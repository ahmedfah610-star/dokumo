import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'https://dokumoflow.com');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Wypełnij wszystkie pola' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Nieprawidłowy adres e-mail' });
  }
  if (message.length > 4000) {
    return res.status(400).json({ error: 'Wiadomość jest zbyt długa (max 4000 znaków)' });
  }

  // Zapisz do Firestore — zawsze działa
  try {
    await db.collection('contactMessages').add({
      name,
      email,
      message,
      createdAt: new Date(),
      read: false,
    });
  } catch (e) {
    console.error('Firestore contact save error:', e.message);
    return res.status(500).json({ error: 'Błąd serwera. Spróbuj ponownie za chwilę.' });
  }

  // Opcjonalnie wyślij email przez Resend (jeśli klucz skonfigurowany)
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: 'Dokumo Kontakt <onboarding@resend.dev>',
          to: 'dokumoflow@gmail.com',
          reply_to: email,
          subject: `Wiadomość od ${name}`,
          text: `Od: ${name} <${email}>\n\n${message}`,
          html: `<p><strong>Od:</strong> ${name} &lt;${email}&gt;</p><hr/><p>${message.replace(/\n/g, '<br>')}</p>`
        }),
        signal: AbortSignal.timeout(8000)
      });
    } catch (e) {
      console.error('Resend error (non-fatal):', e.message);
      // Nie blokuj — wiadomość już zapisana w Firestore
    }
  }

  return res.status(200).json({ ok: true });
}
