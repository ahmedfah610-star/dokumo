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
  if (!token) return res.status(200).json({ active: false });
  let uid;
  try { ({ uid } = await auth.verifyIdToken(token)); }
  catch { return res.status(200).json({ active: false }); }

  const snap = await db.collection('users').doc(uid).collection('subscription').doc('current').get();
  if (!snap.exists) return res.status(200).json({ active: false });

  const data = snap.data();
  const expiresAt = data.expiresAt?.toDate?.();
  const active = expiresAt && expiresAt > new Date();

  return res.status(200).json({
    active,
    plan: data.plan,
    expiresAt: expiresAt?.toISOString() || null,
    cancelled: data.cancelled || false,
  });
}
