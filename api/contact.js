import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

// Rate limit: max 3 wiadomości na godzinę per IP
const CONTACT_LIMIT = 3;
const CONTACT_WINDOW_MS = 60 * 60 * 1000;

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
  if (typeof name !== 'string' || name.length > 200) return res.status(400).json({ error: 'Nieprawidłowe imię' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Nieprawidłowy adres e-mail' });
  }
  if (typeof message !== 'string' || message.length > 4000) {
    return res.status(400).json({ error: 'Wiadomość jest zbyt długa (max 4000 znaków)' });
  }

  // Rate limit per IP
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const ipKey = ip.replace(/[^a-zA-Z0-9._-]/g, '_');
  try {
    const windowStart = Timestamp.fromMillis(Date.now() - CONTACT_WINDOW_MS);
    const snap = await db.collection('contactRateLimit').doc(ipKey)
      .collection('requests').where('ts', '>=', windowStart).count().get();
    if (snap.data().count >= CONTACT_LIMIT) {
      return res.status(429).json({ error: 'Zbyt wiele wiadomości. Spróbuj za godzinę.' });
    }
    await db.collection('contactRateLimit').doc(ipKey).collection('requests').add({ ts: Timestamp.now() });
  } catch(e) {
    console.error('Contact rate limit error:', e.message);
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
