import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

// In-memory rate limit: max 60 zapisów/min per uid
const _rlMap = new Map();
function checkMemRateLimit(uid, max, windowMs) {
  const now = Date.now();
  const entry = _rlMap.get(uid) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  if (entry.count >= max) return false;
  entry.count++;
  _rlMap.set(uid, entry);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });

  let uid;
  try { ({ uid } = await auth.verifyIdToken(token)); }
  catch { return res.status(401).json({ error: 'Nieważny token' }); }

  if (!checkMemRateLimit(uid, 60, 60_000)) {
    return res.status(429).json({ error: 'Zbyt wiele żądań. Spróbuj za chwilę.' });
  }

  const { docId, text, name, covDataJson, fakDataJson } = req.body;
  if (!docId) return res.status(400).json({ error: 'Brak docId' });

  // Limity rozmiaru
  const MAX = 500000;
  if (typeof text === 'string' && text.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });
  if (typeof covDataJson === 'string' && covDataJson.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });
  if (typeof fakDataJson === 'string' && fakDataJson.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });

  try {
    const ref = db.collection('users').doc(uid).collection('documents').doc(docId);
    const update = { text: text || '', updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (covDataJson !== undefined) update.covDataJson = covDataJson;
    if (fakDataJson !== undefined) update.fakDataJson = fakDataJson;
    await ref.update(update);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
