import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { bump } from '../lib/analytics.js';

// Kody rabatowe — ustaw w Vercel env: DISCOUNT_CODES=KOD1:50,KOD2:30
const DISCOUNT_CODES = (() => {
  const out = {};
  (process.env.DISCOUNT_CODES || '').split(',').forEach(entry => {
    const [k, v] = entry.trim().split(':');
    if (k && v && !isNaN(v)) out[k.toUpperCase()] = Number(v);
  });
  return out;
})();

const PRICE_IDS = {
  start:   process.env.STRIPE_PRICE_START,
  kariera: process.env.STRIPE_PRICE_KARIERA,
  biznes:  process.env.STRIPE_PRICE_BIZNES,
  promax:  process.env.STRIPE_PRICE_PROMAX,
};

async function stripePost(path, params) {
  const r = await fetch('https://api.stripe.com/v1' + path, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  return r.json();
}

async function stripeGet(path) {
  const r = await fetch('https://api.stripe.com/v1' + path, {
    headers: { 'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY },
  });
  return r.json();
}

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

const VALID_PLANS = ['start', 'kariera', 'biznes', 'promax'];

export default async function handler(req, res) {
  // Cron job — Vercel Cron wywołuje GET z Authorization: Bearer ${CRON_SECRET}
  if (req.method === 'GET' && process.env.CRON_SECRET
      && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) {
    return runReengagementCron(req, res);
  }

  // GET — sprawdź subskrypcję (dawniej /api/check-sub)
  if (req.method === 'GET') {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(200).json({ active: false });
    let uid, email;
    try { ({ uid, email } = await auth.verifyIdToken(token)); }
    catch { return res.status(200).json({ active: false }); }

    // Sprawdź i aktywuj oczekującą subskrypcję (nadaną przez admina przed założeniem konta)
    if (email) {
      try {
        const emailKey = email.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
        const pendingRef = db.collection('pending_subs').doc(emailKey);
        const pendingSnap = await pendingRef.get();
        if (pendingSnap.exists) {
          const pendingData = pendingSnap.data();
          const pendingExpires = pendingData.expiresAt?.toDate?.();
          if (pendingExpires && pendingExpires > new Date()) {
            await db.collection('users').doc(uid).collection('subscription').doc('current').set(pendingData);
          }
          await pendingRef.delete();
        }
      } catch (_) {}
    }

    // Email powitalny + sprawdzenie subskrypcji równolegle (gwarantuje ukończenie przed odpowiedzią)
    const [, snapResult] = await Promise.allSettled([
      email ? sendWelcomeIfNew(uid, email) : Promise.resolve(),
      db.collection('users').doc(uid).collection('subscription').doc('current').get(),
    ]);
    if (snapResult.status === 'rejected') return res.status(200).json({ active: false });
    const snap = snapResult.value;
    if (!snap.exists) return res.status(200).json({ active: false });
    const data = snap.data();
    const expiresAt = data.expiresAt?.toDate?.();
    const active = expiresAt && expiresAt > new Date();

    // Miesięczne wykorzystanie generowań (genUsage/{uid}, spójne z api/generate.js)
    // oraz pytań do asystenta (legalChatUsage, spójne z api/legal-chat.js)
    const GEN_LIMITS = { kariera: 30, biznes: 30, promax: 100 };
    const AI_LIMITS = { kariera: 10, biznes: 10, promax: 100 };
    const month = new Date().toISOString().slice(0, 7);
    let genUsed = null, genLimit = null, aiUsed = null, aiLimit = null;
    if (active && GEN_LIMITS[data.plan]) {
      genLimit = GEN_LIMITS[data.plan];
      try {
        const gSnap = await db.collection('genUsage').doc(uid).get();
        const g = gSnap.exists ? gSnap.data() : {};
        genUsed = g.month === month ? (g.count || 0) : 0;
      } catch (_) { genUsed = null; }
    }
    if (active && AI_LIMITS[data.plan]) {
      aiLimit = AI_LIMITS[data.plan];
      try {
        const aSnap = await db.collection('legalChatUsage').doc(uid.replace(/[\/:.]/g, '_')).get();
        const a = aSnap.exists ? aSnap.data() : {};
        aiUsed = a.month === month ? (a.monthCount || 0) : 0;
      } catch (_) { aiUsed = null; }
    }

    return res.status(200).json({ active, plan: data.plan, expiresAt: expiresAt?.toISOString() || null, cancelled: data.cancelled || false, downloadsLeft: data.downloadsLeft ?? null, genUsed, genLimit, aiUsed, aiLimit , platnoscNieudana: !!data.platnoscNieudana, platnoscKolejnaProba: data.platnoscKolejnaProba?.toDate?.()?.toISOString() || null });
  }

  if (req.method !== 'POST') return res.status(405).end();
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });

  let uid;
  try { ({ uid } = await auth.verifyIdToken(token)); }
  catch { return res.status(401).json({ error: 'Nieważny token' }); }

  const { action, plan } = req.body || {};

  // action 'activate' usunięty — subskrypcje nadaje tylko stripe-webhook lub admin.js

  if (action === 'cancel') {
    const snap = await db.collection('users').doc(uid).collection('subscription').doc('current').get();
    if (!snap.exists) return res.status(404).json({ error: 'Brak aktywnej subskrypcji' });
    const dane = snap.data();
    const stripeSubId = dane.stripeSubscriptionId || null;
    const jednorazowa = dane.plan === 'start';          // płatność jednorazowa, nie ma czego anulować
    const odAdmina = !!dane.grantedByAdmin;             // nadana ręcznie, Stripe o niej nie wie

    // Subskrypcja cykliczna opłacona przez Stripe, ale bez zapisanego ID — nie
    // mamy czym anulować pobrania. NIE wolno tego oznaczyć jako anulowanej:
    // użytkownik schowałby przycisk i płacił dalej, przekonany, że zrezygnował.
    if (!stripeSubId && !jednorazowa && !odAdmina) {
      console.error('Cancel bez stripeSubscriptionId, uid:', uid);
      return res.status(409).json({
        error: 'Nie możemy automatycznie anulować tej subskrypcji. Napisz na dokumoflow@gmail.com — anulujemy ręcznie i potwierdzimy.',
      });
    }

    // Anuluj w Stripe na koniec okresu: dostęp zostaje do końca opłaconego
    // okresu, kolejna płatność nie zostanie pobrana.
    if (stripeSubId) {
      if (!process.env.STRIPE_SECRET_KEY) {
        console.error('Cancel: brak STRIPE_SECRET_KEY');
        return res.status(503).json({ error: 'Anulowanie chwilowo niedostępne. Spróbuj za chwilę.' });
      }
      // Wynik MUSI być sprawdzony. Wcześniej błąd był tylko logowany, a niżej
      // i tak zapisywaliśmy cancelled:true — użytkownik widział „Anulowana",
      // Stripe pobierał dalej, a przycisk anulowania już się nie pokazywał.
      let odp;
      try {
        odp = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(stripeSubId)}`, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ cancel_at_period_end: 'true' }).toString(),
          signal: AbortSignal.timeout(10000),
        });
      } catch (e) {
        console.error('Stripe cancel — brak odpowiedzi:', e.message);
        return res.status(503).json({ error: 'Nie udało się połączyć ze Stripe. Subskrypcja NIE została anulowana — spróbuj ponownie.' });
      }
      if (!odp.ok) {
        const tresc = await odp.text().catch(() => '');
        console.error('Stripe cancel HTTP', odp.status, tresc.slice(0, 300));
        return res.status(502).json({ error: 'Stripe odrzucił anulowanie. Subskrypcja NIE została anulowana — napisz na dokumoflow@gmail.com.' });
      }
    }

    try {
      await snap.ref.update({ cancelled: true, cancelledAt: new Date() });
    } catch (e) {
      // Stripe już nie pobierze kolejnej płatności, więc nie cofamy operacji —
      // ale mówimy wprost, że nasz zapis się nie udał.
      console.error('Cancel: zapis do Firestore nieudany:', e.message);
      return res.status(500).json({ error: 'Anulowaliśmy płatność, ale nie zapisaliśmy statusu. Odśwież stronę za chwilę.' });
    }
    return res.status(200).json({ ok: true, doKonca: dane.expiresAt?.toDate?.()?.toISOString() || null });
  }

  if (action === 'use-download') {
    const ref = db.collection('users').doc(uid).collection('subscription').doc('current');
    try {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw Object.assign(new Error('Brak subskrypcji'), { status: 403 });
        const data = snap.data();
        if (data.plan !== 'start') return { ok: true }; // inne plany - bez limitu
        const left = data.downloadsLeft ?? 0;
        if (left <= 0) throw Object.assign(new Error('Pobranie już wykorzystane'), { status: 403 });
        tx.update(ref, { downloadsLeft: left - 1 });
        return { ok: true, downloadsLeft: left - 1 };
      });
      return res.status(200).json(result);
    } catch(e) {
      return res.status(e.status || 500).json({ error: e.message });
    }
  }

  if (action === 'create-checkout') {
    if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: 'Nieprawidłowy plan' });
    const priceId = PRICE_IDS[plan];
    if (!priceId) return res.status(500).json({ error: 'Brak konfiguracji ceny dla planu: ' + plan });

    let email;
    try { email = (await auth.getUser(uid)).email; } catch {}

    const origin = 'https://dokumoflow.com';
    const isOneTime = plan === 'start';
    const sessionParams = {
      mode: isOneTime ? 'payment' : 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      customer_email: email || '',
      'metadata[plan]': plan,
      'metadata[uid]': uid,
      success_url: `${origin}/subskrypcja.html?payment_success=1&plan=${plan}`,
      cancel_url: `${origin}/subskrypcja.html`,
    };

    const code = (req.body.code || '').toUpperCase().trim();
    const percent = code ? DISCOUNT_CODES[code] : null;
    if (percent) {
      const couponId = `DOKUMO_${code}`;
      const couponSuffix = isOneTime ? '_OT' : '';
      const fullCouponId = couponId + couponSuffix;
      const existing = await stripeGet('/coupons/' + fullCouponId);
      if (existing.error?.code === 'resource_missing') {
        await stripePost('/coupons', {
          id: fullCouponId,
          percent_off: String(percent),
          duration: isOneTime ? 'forever' : 'once',
          name: isOneTime ? `${percent}% rabat — jednorazowe` : `${percent}% rabat — 1. miesiąc`,
        });
      }
      const couponId2 = fullCouponId;
      sessionParams['discounts[0][coupon]'] = couponId2;
    }

    const session = await stripePost('/checkout/sessions', sessionParams);
    if (!session.url) return res.status(500).json({ error: session.error?.message || 'Błąd Stripe' });
    bump(db, 'checkout_started', { plan });
    return res.status(200).json({ url: session.url });
  }

  return res.status(400).json({ error: 'Nieznana akcja' });
}

// ── Email powitalny przy pierwszym logowaniu ──
async function sendWelcomeIfNew(uid, email) {
  const metaRef = db.collection('userMeta').doc(uid);
  const snap = await metaRef.get();
  if (snap.exists && snap.data().welcomeSent) return; // już wysłany

  await metaRef.set({
    email,
    registeredAt: Timestamp.now(),
    welcomeSent: true,
    firstDocSent: false,
    reminderSent: false,
  }, { merge: true });

  bump(db, 'signup'); // rejestracja w lejku analityki dziennej

  const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;padding:0 16px">
<div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.07)">
<div style="background:#111;padding:28px 32px;text-align:center"><span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-.02em">Dokumo</span></div>
<div style="padding:36px 32px">
<h1 style="font-size:22px;font-weight:800;color:#111;margin:0 0 10px">Witaj w Dokumo! 👋</h1>
<p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 24px">Dziękujemy za założenie konta. Dokumo łączy <strong style="color:#111">generatory umów i pism</strong> z <strong style="color:#111">Asystentem Prawnym i Podatkowym AI</strong>, który odpowiada z konkretną podstawą prawną — artykułami ustaw, aktami z Dziennika Ustaw i orzecznictwem sądów.</p>
<div style="background:#f8f8f8;border-radius:14px;padding:20px 24px;margin-bottom:28px">
<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;margin:0 0 14px">Od czego zacząć</p>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:5px 0"><a href="https://dokumoflow.com/asystent-prawny.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">⚖️ Asystent Prawny i Podatkowy AI — pytaj o prawo i podatki</a></td></tr>
<tr><td style="padding:5px 0"><a href="https://dokumoflow.com/analiza-umowy.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🔍 Analiza umowy AI — sprawdź ryzyka przed podpisem</a></td></tr>
<tr><td style="padding:5px 0"><a href="https://dokumoflow.com/generator-umowy-b2b.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">📝 Umowy — B2B, zlecenie, o pracę, NDA, najem</a></td></tr>
<tr><td style="padding:5px 0"><a href="https://dokumoflow.com/kreator-cv.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">📄 Kreator CV i listu motywacyjnego z AI</a></td></tr>
<tr><td style="padding:5px 0"><a href="https://dokumoflow.com/faktura.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🧾 Faktury i kalkulator wynagrodzeń</a></td></tr>
</table></div>
<a href="https://dokumoflow.com" style="display:block;background:#111;color:#fff;text-align:center;padding:15px 24px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">Przejdź do Dokumo →</a>
<p style="font-size:12px;color:#bbb;margin:28px 0 0;text-align:center">© 2026 Dokumo · <a href="https://dokumoflow.com" style="color:#bbb;text-decoration:none">dokumoflow.com</a></p>
</div></div></div></body></html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Dokumo <noreply@dokumoflow.com>',
      to: email,
      subject: 'Witaj w Dokumo — od czego zacząć 👋',
      html,
    }),
  });
}

// ── Cron: re-engagement email 3 dni po rejestracji ──
async function runReengagementCron(req, res) {
  // Tryb broadcast: ?mode=broadcast — jednorazowy mailing do wszystkich
  // w bazie z reminderSent:false (bez okna 3-dniowego). Batch 100/run.
  const url = new URL(req.url, 'https://dokumoflow.com');
  const isBroadcast = url.searchParams.get('mode') === 'broadcast';

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const windowStart = Timestamp.fromMillis(now - 4 * DAY);
  const windowEnd = Timestamp.fromMillis(now - 3 * DAY);

  let snap;
  try {
    let q = db.collection('userMeta').where('reminderSent', '==', false);
    if (!isBroadcast) {
      q = q.where('registeredAt', '>=', windowStart).where('registeredAt', '<', windowEnd);
    }
    snap = await q.limit(isBroadcast ? 100 : 500).get();
  } catch (e) {
    console.error('Cron query error:', e.message);
    return res.status(500).json({ error: 'Query failed: ' + e.message });
  }

  let sent = 0, skipped = 0, errors = 0;

  for (const doc of snap.docs) {
    const uid = doc.id;
    const data = doc.data();
    const email = data.email;
    if (!email) { skipped++; continue; }

    try {
      const subSnap = await db.collection('users').doc(uid)
        .collection('subscription').doc('current').get();
      if (subSnap.exists) {
        const expiresAt = subSnap.data().expiresAt?.toDate?.();
        if (expiresAt && expiresAt > new Date()) {
          await doc.ref.update({ reminderSent: true, reminderSkipped: 'paying_customer' });
          skipped++;
          continue;
        }
      }
    } catch (e) {
      console.error(`Sub check failed for ${uid}: ${e.message}`);
    }

    try {
      await sendReengagementEmail(email, { broadcast: isBroadcast });
      await doc.ref.update({ reminderSent: true, reminderSentAt: Timestamp.now() });
      sent++;
    } catch (e) {
      console.error(`Reminder email failed for ${uid}: ${e.message}`);
      errors++;
    }
  }

  const hasMore = isBroadcast && snap.size === 100;
  return res.status(200).json({ mode: isBroadcast ? 'broadcast' : '3day', total: snap.size, sent, skipped, errors, hasMore });
}

async function sendReengagementEmail(to, { broadcast = false } = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY missing');

  const introLine = broadcast
    ? 'Niedawno zarejestrowałeś się w naszym serwisie — chcieliśmy Ci pokazać, jakie narzędzia masz do dyspozycji i zachęcić, żebyś z nich skorzystał kiedy tylko będzie taka potrzeba.'
    : 'Trzy dni temu założyłeś konto w Dokumo — chcieliśmy się tylko upewnić, że wiesz co możesz u nas zrobić, kiedy tylko przyjdzie taka potrzeba.';

  const subject = broadcast
    ? 'Skorzystaj z naszych narzędzi — Dokumo'
    : 'Co możesz zrobić w Dokumo — kilka pomysłów';

  const html = `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="max-width:560px;margin:40px auto;padding:0 16px">
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.07)">
    <div style="background:#111;padding:28px 32px;text-align:center">
      <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-.02em">Dokumo</span>
    </div>
    <div style="padding:36px 32px">
      <h1 style="font-size:21px;font-weight:800;color:#111;margin:0 0 12px;letter-spacing:-.02em">Cześć! Mała przypominajka 👋</h1>
      <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 14px">
        ${introLine}
      </p>
      <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 24px">
        Jesteśmy platformą, która łączy <strong style="color:#111">gotowe szablony dokumentów prawnych</strong> z <strong style="color:#111">analizą AI</strong> — pomagamy w sytuacjach, w których inaczej musiałbyś iść do prawnika lub spędzać godziny w Wordzie.
      </p>
      <div style="background:#f8f8f8;border-radius:14px;padding:20px 24px;margin-bottom:28px">
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;margin:0 0 14px">Co znajdziesz w Dokumo</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0"><span style="color:#111;font-size:14px;font-weight:600">⚖️ Asystent Prawny i Podatkowy AI</span><div style="color:#888;font-size:12px;margin-top:2px">Odpowiedzi z podstawą prawną, aktami z Dziennika Ustaw i orzecznictwem sądów</div></td></tr>
          <tr><td style="padding:6px 0"><span style="color:#111;font-size:14px;font-weight:600">📄 Generator umów i pism</span><div style="color:#888;font-size:12px;margin-top:2px">B2B, zlecenie, NDA, najem, wypowiedzenie — gotowe w 60 sekund</div></td></tr>
          <tr><td style="padding:6px 0"><span style="color:#111;font-size:14px;font-weight:600">🤖 Kreator CV i listu z AI</span><div style="color:#888;font-size:12px;margin-top:2px">Dopasowane do oferty pracy, profesjonalna stylistyka</div></td></tr>
          <tr><td style="padding:6px 0"><span style="color:#111;font-size:14px;font-weight:600">🔍 Analiza umowy AI</span><div style="color:#888;font-size:12px;margin-top:2px">Sprawdź czy nie podpisujesz czegoś niekorzystnego</div></td></tr>
          <tr><td style="padding:6px 0"><span style="color:#111;font-size:14px;font-weight:600">✍️ Podpisywanie dokumentów online</span><div style="color:#888;font-size:12px;margin-top:2px">Bezpieczny e-podpis bez wydruków i skanowania</div></td></tr>
          <tr><td style="padding:6px 0"><span style="color:#111;font-size:14px;font-weight:600">🧾 Faktury i kalkulator wynagrodzeń</span><div style="color:#888;font-size:12px;margin-top:2px">Praktyczne narzędzia dla freelancera i firmy</div></td></tr>
        </table>
      </div>
      <a href="https://dokumoflow.com" style="display:block;background:#111;color:#fff;text-align:center;padding:15px 24px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">Zobacz wszystko →</a>
      <p style="color:#888;font-size:13px;line-height:1.6;margin:28px 0 0;text-align:center">
        Trzymamy kciuki za wszystko czym aktualnie się zajmujesz. Gdyby coś było potrzebne — wiesz gdzie nas znaleźć.
      </p>
      <p style="font-size:12px;color:#bbb;margin:20px 0 0;text-align:center">
        © 2026 Dokumo · <a href="https://dokumoflow.com" style="color:#bbb;text-decoration:none">dokumoflow.com</a>
      </p>
    </div>
  </div>
</div>
</body>
</html>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Dokumo <noreply@dokumoflow.com>',
      to,
      subject,
      html,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`Resend ${r.status}: ${errText.slice(0, 200)}`);
  }
}
