import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

// In-memory rate limit: max 30 req/min per uid
const _rl = new Map();
function checkRl(uid) {
  const now = Date.now();
  const e = _rl.get(uid) || { c: 0, r: now + 60000 };
  if (now > e.r) { e.c = 0; e.r = now + 60000; }
  if (e.c >= 30) return false;
  e.c++; _rl.set(uid, e); return true;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });
  let uid;
  try { ({ uid } = await auth.verifyIdToken(token)); }
  catch { return res.status(401).json({ error: 'Nieważny token' }); }

  if (!checkRl(uid)) return res.status(429).json({ error: 'Zbyt wiele żądań.' });

  const snap = await db.collection('users').doc(uid).collection('documents')
    .orderBy('createdAt', 'desc').limit(100).get();
  const docs = snap.docs.map(d => ({
    ...d.data(), id: d.id,
    createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
    updatedAt:  d.data().updatedAt?.toDate?.()?.toISOString()  || null,
  }));
  return res.status(200).json({ docs });
}
