import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });
  let uid;
  try { ({ uid } = await auth.verifyIdToken(token)); }
  catch { return res.status(401).json({ error: 'Nieważny token' }); }

  const snap = await db.collection('users').doc(uid).collection('documents')
    .orderBy('createdAt', 'desc').limit(100).get();
  const docs = snap.docs.map(d => ({
    ...d.data(), id: d.id,
    createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
    updatedAt:  d.data().updatedAt?.toDate?.()?.toISOString()  || null,
  }));
  return res.status(200).json({ docs });
}


