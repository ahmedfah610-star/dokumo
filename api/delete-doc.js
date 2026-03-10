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
  if (req.method !== 'DELETE') return res.status(405).end();

  const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!idToken) return res.status(401).json({ error: 'Brak autoryzacji' });

  let uid;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: 'Nieważny token' });
  }

  const { docId } = req.body;
  if (!docId) return res.status(400).json({ error: 'Brak docId' });

  await db.collection('users').doc(uid).collection('documents').doc(docId).delete();
  return res.status(200).json({ ok: true });
}