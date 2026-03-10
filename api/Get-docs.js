import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const auth = getAuth();

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!idToken) return res.status(401).json({ error: 'Brak autoryzacji' });

  let uid;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: 'Nieważny token' });
  }

  const snap = await db.collection('users').doc(uid).collection('documents')
    .orderBy('createdAt', 'desc').limit(100).get();

  const docs = snap.docs.map(d => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
    };
  });

  return res.status(200).json({ docs });
}