import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

const FROM = 'Dokumo <noreply@dokumoflow.com>';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).end();

  let uid, email;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return res.status(401).end();
  }

  if (!email) return res.status(200).json({ ok: true });

  // Sprawdź czy już wysłany
  const metaRef = db.collection('userMeta').doc(uid);
  const metaSnap = await metaRef.get();
  if (metaSnap.exists && metaSnap.data().welcomeSent) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  // Zapisz metadane (rejestracja momentu + flagi)
  await metaRef.set({
    email,
    registeredAt: Timestamp.now(),
    welcomeSent: true,
    firstDocSent: false,
    reminderSent: false,
  }, { merge: true });

  // Wyślij email powitalny
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: email,
        subject: 'Witaj w Dokumo! Twój darmowy dokument czeka 👋',
        html: welcomeHtml(),
      }),
    });
  } catch (e) {
    console.error('Welcome email failed:', e.message);
  }

  return res.status(200).json({ ok: true });
}

function welcomeHtml() {
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
      <h1 style="font-size:22px;font-weight:800;color:#111;margin:0 0 10px;letter-spacing:-.02em">Witaj w Dokumo! 👋</h1>
      <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 28px">
        Cieszmy się, że jesteś. Masz <strong style="color:#111">jedno darmowe pobranie</strong> — wybierz dowolny dokument i wygeneruj go w 30 sekund, bez szablonów, bez prawniczego żargonu.
      </p>

      <!-- Popularne dokumenty -->
      <div style="background:#f8f8f8;border-radius:14px;padding:20px 24px;margin-bottom:28px">
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;margin:0 0 14px">Popularne dokumenty</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:5px 0"><a href="https://dokumoflow.com/generator-umowy-b2b.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">📝 Umowa B2B</a></td></tr>
          <tr><td style="padding:5px 0"><a href="https://dokumoflow.com/umowa-najmu.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🏠 Umowa najmu</a></td></tr>
          <tr><td style="padding:5px 0"><a href="https://dokumoflow.com/generator-nda.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🔒 NDA — umowa o poufności</a></td></tr>
          <tr><td style="padding:5px 0"><a href="https://dokumoflow.com/generator-regulaminu-sklepu.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🛒 Regulamin sklepu</a></td></tr>
          <tr><td style="padding:5px 0"><a href="https://dokumoflow.com/faktura.html" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">🧾 Faktura</a></td></tr>
        </table>
      </div>

      <a href="https://dokumoflow.com" style="display:block;background:#111;color:#fff;text-align:center;padding:15px 24px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:-.01em">Wygeneruj swój dokument →</a>

      <p style="font-size:13px;color:#aaa;margin:28px 0 0;line-height:1.6">
        Jeśli masz pytania, napisz do nas:<br>
        <a href="mailto:dokumoflow@gmail.com" style="color:#555">dokumoflow@gmail.com</a>
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
