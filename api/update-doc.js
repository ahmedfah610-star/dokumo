import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

  const { docId, text, name, covDataJson, fakDataJson } = req.body;
  if (!docId) return res.status(400).json({ error: 'Brak docId' });

  try {
    const { uid } = await auth.verifyIdToken(token);
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
