import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });
  let uid;
  try { ({ uid } = await auth.verifyIdToken(token)); }
  catch { return res.status(401).json({ error: 'Nieważny token' }); }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.collection('users').doc(uid).collection('subscription').doc('current').set({
    plan: 'biznes', expiresAt: Timestamp.fromDate(expiresAt), activatedAt: Timestamp.now(),
  });
  return res.status(200).json({ ok: true, expiresAt: expiresAt.toISOString() });
}



