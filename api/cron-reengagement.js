import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

const FROM = 'Dokumo <noreply@dokumoflow.com>';
const SUBJECT = 'Twoje darmowe pobranie wciąż czeka — co wygenerujesz?';

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const windowStart = Timestamp.fromMillis(now - 4 * DAY);
  const windowEnd = Timestamp.fromMillis(now - 3 * DAY);

  let snap;
  try {
    snap = await db.collection('userMeta')
      .where('registeredAt', '>=', windowStart)
      .where('registeredAt', '<', windowEnd)
      .where('reminderSent', '==', false)
      .limit(500)
      .get();
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
      await sendReminderEmail(email);
      await doc.ref.update({ reminderSent: true, reminderSentAt: Timestamp.now() });
      sent++;
    } catch (e) {
      console.error(`Reminder email failed for ${uid}: ${e.message}`);
      errors++;
    }
  }

  return res.status(200).json({ total: snap.size, sent, skipped, errors });
}

async function sendReminderEmail(to) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY missing');

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
      <h1 style="font-size:21px;font-weight:800;color:#111;margin:0 0 12px;letter-spacing:-.02em">Hej, jeszcze tu jesteś? 👀</h1>
      <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 14px">
        Trzy dni temu założyłeś konto w Dokumo i nie zdążyłeś jeszcze niczego wygenerować. Wciąż masz <strong style="color:#111">jedno darmowe pobranie PDF</strong> — możesz go użyć kiedy chcesz.
      </p>
      <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 24px">
        Jeśli zastanawiasz się od czego zacząć — oto cztery dokumenty, które inni użytkownicy generowali w tym tygodniu najczęściej:
      </p>
      <div style="background:#f8f8f8;border-radius:14px;padding:20px 24px;margin-bottom:28px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0"><a href="https://dokumoflow.com/kreator-cv.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">📄 Kreator CV z AI</a><div style="color:#888;font-size:12px;margin-top:2px">Dopasowane do oferty pracy w 30 sekund</div></td></tr>
          <tr><td style="padding:6px 0"><a href="https://dokumoflow.com/generator-umowy-b2b.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">📝 Umowa B2B</a><div style="color:#888;font-size:12px;margin-top:2px">Gotowy szablon dla freelancera lub firmy</div></td></tr>
          <tr><td style="padding:6px 0"><a href="https://dokumoflow.com/generator-wypowiedzenia.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">📋 Wypowiedzenie umowy</a><div style="color:#888;font-size:12px;margin-top:2px">Z poprawnym okresem i podstawą prawną</div></td></tr>
          <tr><td style="padding:6px 0"><a href="https://dokumoflow.com/analiza-umowy.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🔍 Analiza umowy AI</a><div style="color:#888;font-size:12px;margin-top:2px">Sprawdź, czy nie podpisujesz czegoś niekorzystnego</div></td></tr>
        </table>
      </div>
      <a href="https://dokumoflow.com" style="display:block;background:#111;color:#fff;text-align:center;padding:15px 24px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">Wróć do Dokumo →</a>
      <p style="color:#888;font-size:13px;line-height:1.6;margin:28px 0 0;text-align:center">
        Nie potrzebujesz dziś niczego? Bez stresu — Twoje konto czeka, a my nie spamujemy.
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
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject: SUBJECT, html }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`Resend ${r.status}: ${errText.slice(0, 200)}`);
  }
}
