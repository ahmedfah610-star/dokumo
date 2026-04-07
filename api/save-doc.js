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

  const { docId, docName, docCat, docIcon, docCatLabel, text, cvDataJson, covDataJson, fakDataJson } = req.body;
  if (!docName) return res.status(400).json({ error: 'Brak nazwy dokumentu' });

  // Limity rozmiaru pól
  const MAX = 500000; // 500KB per pole
  if (typeof text === 'string' && text.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });
  if (typeof cvDataJson === 'string' && cvDataJson.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });
  if (typeof covDataJson === 'string' && covDataJson.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });
  if (typeof fakDataJson === 'string' && fakDataJson.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });

  let uid;
  try {
    ({ uid } = await auth.verifyIdToken(token));
  } catch {
    return res.status(401).json({ error: 'Nieważny token' });
  }

  // Sprawdź subskrypcję
  try {
    const subSnap = await db.collection('users').doc(uid).collection('subscription').doc('current').get();
    if (!subSnap.exists) return res.status(403).json({ error: 'Brak aktywnej subskrypcji' });
    const exp = subSnap.data().expiresAt?.toDate?.();
    if (!exp || exp <= new Date()) return res.status(403).json({ error: 'Subskrypcja wygasła' });
  } catch(e) {
    return res.status(500).json({ error: 'Błąd weryfikacji subskrypcji' });
  }

  // Limit liczby dokumentów per użytkownik (max 500)
  try {
    const countSnap = await db.collection('users').doc(uid).collection('documents').count().get();
    if (countSnap.data().count >= 500) return res.status(429).json({ error: 'Osiągnięto limit dokumentów' });
  } catch(_) {}

  try {
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
    if (fakDataJson) payload.fakDataJson = fakDataJson;
    await ref.set(payload);
    return res.status(200).json({ ok: true, id: ref.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
