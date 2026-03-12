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

  try {
    const { uid } = await auth.verifyIdToken(token);
    const snap = await db.collection('users').doc(uid).collection('drafts').doc('cv').get();
    if (!snap.exists) return res.status(404).json({ error: 'Brak wersji roboczej' });
    const data = snap.data();
    return res.status(200).json({ cvDataJson: data.cvDataJson || '', updatedAt: data.updatedAt?.toDate?.() || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
