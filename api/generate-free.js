import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

// Limity darmowego użycia per IP per godzinę
const LIMITS = {
  cv:     10,
  letter:  5,
};
const WINDOW_MS = 60 * 60 * 1000;

function getIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',');
  return (req.headers['x-real-ip'] || fwd[fwd.length - 1] || req.socket?.remoteAddress || 'unknown')
    .trim().replace(/[^a-zA-Z0-9._:-]/g, '_').substring(0, 64);
}

async function checkAndReserve(ip, type) {
  const max = LIMITS[type];
  const windowStart = Timestamp.fromMillis(Date.now() - WINDOW_MS);
  const col = db.collection('freeUsage').doc(type).collection(ip);
  const count = (await col.where('ts', '>=', windowStart).count().get()).data().count;
  if (count >= max) return false;
  await col.add({ ts: Timestamp.now() });
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Wymaga logowania — ale NIE subskrypcji
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Wymagane logowanie' });
  try { await auth.verifyIdToken(token); }
  catch { return res.status(401).json({ error: 'Nieprawidłowy token' }); }

  const { prompt, type } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.length > 15000)
    return res.status(400).json({ error: 'Brak lub zbyt długie zapytanie' });
  if (!LIMITS[type])
    return res.status(400).json({ error: 'Nieprawidłowy typ' });

  // Rate limit per IP
  const ip = getIp(req);
  try {
    const ok = await checkAndReserve(ip, type);
    if (!ok) return res.status(429).json({ error: 'limit_reached', type, max: LIMITS[type] });
  } catch(e) {
    console.error('Free rate limit error:', e.message);
    return res.status(503).json({ error: 'Chwilowy problem z serwerem. Spróbuj ponownie.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Brak klucza API' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        system: 'Piszesz wyłącznie po polsku. Przestrzegaj polskiej interpunkcji i ortografii. Zero markdown, zero gwiazdek, zero emoji.',
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(30000)
    });
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = data.content?.[0]?.text || '';
    if (!text) return res.status(500).json({ error: 'Pusta odpowiedź AI' });
    return res.status(200).json({ text });
  } catch(e) {
    const msg = e.name === 'TimeoutError' ? 'Przekroczono czas — spróbuj ponownie.' : e.message;
    return res.status(500).json({ error: msg });
  }
}
