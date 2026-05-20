import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

const VALID_PLANS = ['kariera', 'biznes', 'promax'];

async function verifyAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) throw Object.assign(new Error('Brak tokenu'), { status: 401 });
  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  // Jeśli ADMIN_EMAILS nie skonfigurowany — blokuj wszystkich (fail-closed)
  if (!ADMIN_EMAILS.length) throw Object.assign(new Error('Brak dostępu — ADMIN_EMAILS nie skonfigurowane'), { status: 403 });
  let decoded;
  try { decoded = await auth.verifyIdToken(token); }
  catch { throw Object.assign(new Error('Nieważny token'), { status: 401 }); }
  if (!ADMIN_EMAILS.includes((decoded.email || '').toLowerCase())) {
    throw Object.assign(new Error('Brak dostępu'), { status: 403 });
  }
  return decoded;
}

// Liczy count() z aggregation query; zwraca null przy błędzie (np. brak indeksu)
async function cnt(query) {
  try { return (await query.count().get()).data().count; }
  catch { return null; }
}

// Agreguje dane z całego Firestore na potrzeby dashboardu
async function buildStats() {
  const T = Date.now();
  const DAY = 86400000;
  const tsSince = days => Timestamp.fromMillis(T - days * DAY);

  // ── Płatności ──
  const paySnap = await db.collection('payments').orderBy('ts', 'desc').limit(500).get();
  const allPay = paySnap.docs.map(d => {
    const x = d.data();
    return { plan: x.plan, email: x.email, amount: x.amount, currency: x.currency,
             stripeSessionId: x.stripeSessionId, id: d.id,
             tsMs: x.ts?.toMillis?.() ?? null,
             ts: x.ts?.toDate?.()?.toISOString() ?? null };
  });
  const revenue = { total: 0, d1: 0, d7: 0, d30: 0, prev30: 0, byPlan: {}, arpu: 0 };
  const payerEmails = new Set();
  for (const p of allPay) {
    const zl = (p.amount || 0) / 100;
    revenue.total += zl;
    revenue.byPlan[p.plan || '?'] = (revenue.byPlan[p.plan || '?'] || 0) + zl;
    if (p.email) payerEmails.add(p.email.toLowerCase());
    if (p.tsMs != null) {
      const age = T - p.tsMs;
      if (age <= DAY) revenue.d1 += zl;
      if (age <= 7 * DAY) revenue.d7 += zl;
      if (age <= 30 * DAY) revenue.d30 += zl;
      if (age > 30 * DAY && age <= 60 * DAY) revenue.prev30 += zl;
    }
  }
  revenue.arpu = allPay.length ? revenue.total / allPay.length : 0;
  revenue.count = await cnt(db.collection('payments')) ?? allPay.length;

  // ── Użytkownicy / wzrost ──
  const um = db.collection('userMeta');
  const users = {
    total: await cnt(um),
    d1: await cnt(um.where('registeredAt', '>=', tsSince(1))),
    d7: await cnt(um.where('registeredAt', '>=', tsSince(7))),
    d30: await cnt(um.where('registeredAt', '>=', tsSince(30))),
  };
  const reminders = {
    sent: await cnt(um.where('reminderSent', '==', true)),
    pending: await cnt(um.where('reminderSent', '==', false)),
  };
  const conversionPct = users.total ? +(payerEmails.size / users.total * 100).toFixed(1) : 0;

  // ── Subskrypcje ──
  const subs = { active: 0, byPlan: {}, grantedByAdmin: 0, expiringSoon: [], pending: 0 };
  try {
    const subSnap = await db.collectionGroup('subscription').limit(3000).get();
    for (const s of subSnap.docs) {
      const x = s.data();
      const exp = x.expiresAt?.toMillis?.() ?? 0;
      if (exp > T) {
        subs.active++;
        subs.byPlan[x.plan || '?'] = (subs.byPlan[x.plan || '?'] || 0) + 1;
        if (x.grantedByAdmin) subs.grantedByAdmin++;
        if (exp - T <= 7 * DAY) {
          subs.expiringSoon.push({ email: x.email || '—', plan: x.plan || '?',
                                   expiresAt: new Date(exp).toISOString() });
        }
      }
    }
    subs.expiringSoon.sort((a, b) => a.expiresAt < b.expiresAt ? -1 : 1);
  } catch (e) { subs.error = e.message; }
  subs.pending = await cnt(db.collection('pending_subs'));

  // ── Dokumenty / użycie produktu ──
  const cgDocs = db.collectionGroup('documents');
  const docs = {
    total: await cnt(cgDocs),
    d1: await cnt(cgDocs.where('createdAt', '>=', tsSince(1))),
    d7: await cnt(cgDocs.where('createdAt', '>=', tsSince(7))),
    d30: await cnt(cgDocs.where('createdAt', '>=', tsSince(30))),
    byCat: {}, topTypes: [], daily: [],
  };
  try {
    const sSnap = await cgDocs.orderBy('createdAt', 'desc').limit(1500).get();
    const byType = {};
    const dayBuckets = {};
    for (let i = 13; i >= 0; i--) {
      dayBuckets[new Date(T - i * DAY).toISOString().slice(0, 10)] = 0;
    }
    for (const d of sSnap.docs) {
      const x = d.data();
      const cat = x.catLabel || x.cat || 'Inne';
      docs.byCat[cat] = (docs.byCat[cat] || 0) + 1;
      const type = (x.icon ? x.icon + ' ' : '') + (x.typeId || x.name || 'inny');
      byType[type] = (byType[type] || 0) + 1;
      const ms = x.createdAt?.toMillis?.() ?? null;
      if (ms != null) {
        const key = new Date(ms).toISOString().slice(0, 10);
        if (key in dayBuckets) dayBuckets[key]++;
      }
    }
    docs.topTypes = Object.entries(byType).map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count).slice(0, 12);
    docs.daily = Object.entries(dayBuckets).map(([date, count]) => ({ date, count }));
    docs.sampleSize = sSnap.size;
  } catch (e) { docs.error = e.message; }

  // ── Darmowe użycie (zasięg / leady) ──
  const free = {
    docTotal: await cnt(db.collection('freeDocUsage')),
    doc7d: await cnt(db.collection('freeDocUsage').where('usedAt', '>=', tsSince(7))),
    doc30d: await cnt(db.collection('freeDocUsage').where('usedAt', '>=', tsSince(30))),
    contractTotal: await cnt(db.collection('freeContractUsage')),
    contract7d: await cnt(db.collection('freeContractUsage').where('usedAt', '>=', tsSince(7))),
    recent: [],
  };
  try {
    const fSnap = await db.collection('freeDocUsage').orderBy('usedAt', 'desc').limit(15).get();
    free.recent = fSnap.docs.map(d => {
      const x = d.data();
      return { docName: x.docName || 'Dokument', docCat: x.docCat || '—',
               usedAt: x.usedAt?.toDate?.()?.toISOString() ?? null };
    });
  } catch (e) { free.recentError = e.message; }

  // ── Dzienny ruch gości: analizy umów (globalLimits) ──
  let contractDaily = [];
  try {
    const glSnap = await db.collection('globalLimits').get();
    glSnap.forEach(d => {
      const m = d.id.match(/^contract_free_(\d{4}-\d{2}-\d{2})$/);
      if (m) contractDaily.push({ date: m[1], count: d.data().count || 0 });
    });
    contractDaily.sort((a, b) => a.date < b.date ? -1 : 1);
    contractDaily = contractDaily.slice(-14);
  } catch (_) {}

  return {
    generatedAt: new Date().toISOString(),
    revenue, users, reminders, conversionPct,
    payers: payerEmails.size,
    subs, docs, free, contractDaily,
    payments: allPay.slice(0, 200),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dokumoflow.com');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Cron: reminder emails — GET /api/admin?cron=reminder + x-cron-secret header ──
  if (req.method === 'GET' && req.query.cron === 'reminder') {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers['x-cron-secret'] !== secret) return res.status(401).end();
    try {
      const now = Date.now();
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const snap = await db.collection('userMeta')
        .where('reminderSent', '==', false)
        .where('registeredAt', '<=', Timestamp.fromDate(sevenDaysAgo))
        .where('registeredAt', '>=', Timestamp.fromDate(thirtyDaysAgo))
        .limit(100).get();
      let sent = 0;
      for (const docSnap of snap.docs) {
        const email = docSnap.data().email;
        if (!email) continue;
        try {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Dokumo <noreply@dokumoflow.com>',
              to: email,
              subject: 'Wróć do Dokumo — Twoje dokumenty czekają',
              html: cronReminderHtml(),
            }),
          });
          if (r.ok) { await docSnap.ref.update({ reminderSent: true, reminderSentAt: Timestamp.now() }); sent++; }
        } catch(e) { console.error('Reminder email failed:', email, e.message); }
      }
      return res.status(200).json({ ok: true, sent, checked: snap.size });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  try {
    // GET — pełne statystyki dashboardu
    if (req.method === 'GET') {
      await verifyAdmin(req);
      const stats = await buildStats();
      const { payments, ...rest } = stats;
      return res.status(200).json({ payments, stats: rest });
    }

    if (req.method !== 'POST') return res.status(405).end();

    await verifyAdmin(req);
    const { action, email, plan, days = 30 } = req.body || {};

    // POST action=grant — nadaj subskrypcję (dawniej /api/admin-grant)
    if (action === 'grant') {
      if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Podaj email' });
      if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: 'Nieprawidłowy plan: ' + plan });

      const daysNum = Math.max(1, Math.min(365, parseInt(days) || 30));
      const expiresAt = new Date(Date.now() + daysNum * 24 * 60 * 60 * 1000);
      const emailClean = email.trim().toLowerCase();

      const subData = {
        plan,
        expiresAt: Timestamp.fromDate(expiresAt),
        activatedAt: Timestamp.now(),
        grantedByAdmin: true,
        email: emailClean,
      };

      try {
        const user = await auth.getUserByEmail(emailClean);
        await db.collection('users').doc(user.uid).collection('subscription').doc('current').set(subData);
        return res.status(200).json({ ok: true, status: 'granted', uid: user.uid, plan, expiresAt: expiresAt.toISOString() });
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
        const emailKey = emailClean.replace(/[^a-z0-9._-]/g, '_');
        await db.collection('pending_subs').doc(emailKey).set({ ...subData, pendingSince: Timestamp.now() });
        return res.status(200).json({ ok: true, status: 'pending', plan, expiresAt: expiresAt.toISOString() });
      }
    }

    return res.status(400).json({ error: 'Nieznana akcja' });

  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}

function cronReminderHtml() {
  return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;padding:0 16px">
<div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.07)">
<div style="background:#111;padding:28px 32px;text-align:center"><span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-.02em">Dokumo</span></div>
<div style="padding:36px 32px">
<h1 style="font-size:21px;font-weight:800;color:#111;margin:0 0 10px">Hej, wróć do Dokumo! 📄</h1>
<p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 24px">Minął tydzień od rejestracji. Masz <strong style="color:#111">jedno darmowe pobranie</strong> — użyj go na dowolny dokument.</p>
<div style="background:#f8f8f8;border-radius:14px;padding:20px 24px;margin-bottom:28px">
<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;margin:0 0 14px">Co możemy dla Ciebie zrobić?</p>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:5px 0"><a href="https://dokumoflow.com/generator-umowy-b2b.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">📝 Umowa B2B — dla freelancerów</a></td></tr>
<tr><td style="padding:5px 0"><a href="https://dokumoflow.com/umowa-najmu.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🏠 Umowa najmu — dla wynajmujących</a></td></tr>
<tr><td style="padding:5px 0"><a href="https://dokumoflow.com/generator-nda.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🔒 NDA — umowa o poufności</a></td></tr>
<tr><td style="padding:5px 0"><a href="https://dokumoflow.com/generator-regulaminu-sklepu.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🛒 Regulamin sklepu</a></td></tr>
</table></div>
<a href="https://dokumoflow.com" style="display:block;background:#111;color:#fff;text-align:center;padding:15px 24px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">Wygeneruj dokument za darmo →</a>
<p style="font-size:12px;color:#bbb;margin:24px 0 0;text-align:center">© 2026 Dokumo · <a href="https://dokumoflow.com" style="color:#bbb;text-decoration:none">dokumoflow.com</a></p>
</div></div></div></body></html>`;
}
