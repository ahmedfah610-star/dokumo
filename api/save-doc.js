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

  const { docId, docName, docCat, docIcon, docCatLabel, text, cvDataJson, covDataJson } = req.body;
  if (!docName) return res.status(400).json({ error: 'Brak nazwy dokumentu' });

  try {
    const { uid } = await auth.verifyIdToken(token);
    const ref = db.collection('users').doc(uid).collection('documents').doc();
    const payload = {
      id: ref.id,
      typeId: docId || 'cv',
      name: docName,
      text: text || '',
      cat: docCat || 'kariera',
      icon: docIcon || '📄',
      catLabel: docCatLabel || 'Kariera',
      status: 'generated',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (cvDataJson) payload.cvDataJson = cvDataJson;
    if (covDataJson) payload.covDataJson = covDataJson;
    await ref.set(payload);
    return res.status(200).json({ ok: true, id: ref.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
