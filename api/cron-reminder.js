import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

const FROM = 'Dokumo <noreply@dokumoflow.com>';

export default async function handler(req, res) {
  // Tylko GET od Vercel Cron (z Authorization: Bearer <CRON_SECRET>)
  if (req.method !== 'GET') return res.status(405).end();
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== 'Bearer ' + cronSecret) {
    return res.status(401).end();
  }

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // Pobierz użytkowników: reminderSent=false, zarejestrowani 7-30 dni temu
  let snap;
  try {
    snap = await db.collection('userMeta')
      .where('reminderSent', '==', false)
      .where('registeredAt', '<=', Timestamp.fromDate(sevenDaysAgo))
      .where('registeredAt', '>=', Timestamp.fromDate(thirtyDaysAgo))
      .limit(100)
      .get();
  } catch (e) {
    console.error('Cron query failed:', e.message);
    return res.status(500).json({ error: e.message });
  }

  let sent = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const email = data.email;
    if (!email) continue;

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: email,
          subject: 'Wróć do Dokumo — Twoje dokumenty czekają',
          html: reminderHtml(),
        }),
      });
      if (r.ok) {
        await docSnap.ref.update({ reminderSent: true, reminderSentAt: Timestamp.now() });
        sent++;
      }
    } catch (e) {
      console.error('Reminder email failed for', email, e.message);
    }
  }

  console.log(`Cron-reminder: sent ${sent} emails`);
  return res.status(200).json({ ok: true, sent, checked: snap.size });
}

function reminderHtml() {
  return `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="max-width:560px;margin:40px auto;padding:0 16px">
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.07)">

    <!-- Header -->
    <div style="background:#111;padding:28px 32px;text-align:center">
      <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-.02em">Dokumo</span>
    </div>

    <!-- Body -->
    <div style="padding:36px 32px">
      <h1 style="font-size:21px;font-weight:800;color:#111;margin:0 0 10px;letter-spacing:-.02em">Hej, wróć do Dokumo! 📄</h1>
      <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 24px">
        Minął tydzień od rejestracji — czy udało Ci się wygenerować swój dokument? Jeśli nie, masz go <strong style="color:#111">za darmo</strong>. Jedno pobranie, dowolny dokument, bez zobowiązań.
      </p>

      <!-- Propozycje -->
      <div style="background:#f8f8f8;border-radius:14px;padding:20px 24px;margin-bottom:24px">
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;margin:0 0 14px">Co możemy dla Ciebie zrobić?</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:5px 0"><a href="https://dokumoflow.com/generator-umowy-b2b.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">📝 Umowa B2B — dla freelancerów</a></td></tr>
          <tr><td style="padding:5px 0"><a href="https://dokumoflow.com/umowa-najmu.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🏠 Umowa najmu — dla wynajmujących</a></td></tr>
          <tr><td style="padding:5px 0"><a href="https://dokumoflow.com/generator-regulaminu-sklepu.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🛒 Regulamin sklepu — dla e-commerce</a></td></tr>
          <tr><td style="padding:5px 0"><a href="https://dokumoflow.com/generator-nda.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🔒 NDA — umowa o poufności</a></td></tr>
        </table>
      </div>

      <!-- Dlaczego Dokumo -->
      <div style="border-left:3px solid #e5e5e5;padding:14px 20px;margin-bottom:28px">
        <p style="font-size:14px;color:#555;line-height:1.6;margin:0">
          AI generuje dokument w 30 sekund na podstawie Twoich danych. Możesz go pobrać, edytować i podpisać elektronicznie — wszystko w jednym miejscu.
        </p>
      </div>

      <a href="https://dokumoflow.com" style="display:block;background:#111;color:#fff;text-align:center;padding:15px 24px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:-.01em">Wygeneruj dokument za darmo →</a>

      <p style="font-size:13px;color:#aaa;margin:28px 0 0;line-height:1.6;text-align:center">
        Nie chcesz otrzymywać wiadomości? <a href="mailto:dokumoflow@gmail.com?subject=Rezygnacja" style="color:#aaa">Wypisz się</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #f0f0f0;padding:16px 32px;text-align:center">
      <p style="font-size:12px;color:#bbb;margin:0">
        © 2026 Dokumo · <a href="https://dokumoflow.com" style="color:#bbb;text-decoration:none">dokumoflow.com</a>
      </p>
    </div>
  </div>
</div>
</body>
</html>`;
}
