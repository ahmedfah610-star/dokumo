import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const auth = getAuth();
const db = getFirestore();

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // POST — create signing session (party 1 signs)
  if (req.method === 'POST') {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    let uid = null;
    if (token) { try { ({ uid } = await auth.verifyIdToken(token)); } catch {} }

    const { docText, docName, party1Name, party1Sig, party1Date, party2Email } = req.body || {};
    if (!docText || !party1Name || !party1Sig) {
      return res.status(400).json({ error: 'Brak wymaganych danych' });
    }
    if (typeof docText !== 'string' || docText.length > 200000) {
      return res.status(400).json({ error: 'Dokument zbyt duży' });
    }

    const ref = db.collection('signingSessions').doc();
    await ref.set({
      id: ref.id,
      docText,
      docName: docName || 'Dokument',
      createdBy: uid || null,
      createdAt: Timestamp.now(),
      status: 'waiting_party2',
      party1: { name: party1Name, sig: party1Sig, date: party1Date || '', signedAt: Timestamp.now() },
      party2Email: party2Email || null,
      party2: null,
    });

    return res.status(200).json({ sessionId: ref.id });
  }

  // GET — load session (for party 2 signing page)
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Brak id' });

    const snap = await db.collection('signingSessions').doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Sesja nie istnieje' });

    const d = snap.data();
    return res.status(200).json({
      docText: d.docText,
      docName: d.docName,
      status: d.status,
      party1Name: d.party1?.name,
      party1Date: d.party1?.date,
      party2: d.party2 ? { name: d.party2.name, date: d.party2.date } : null,
    });
  }

  // PATCH — party 2 signs, returns full data for PDF generation
  if (req.method === 'PATCH') {
    const { id, party2Name, party2Sig } = req.body || {};
    if (!id || !party2Name || !party2Sig) {
      return res.status(400).json({ error: 'Brak wymaganych danych' });
    }

    const ref = db.collection('signingSessions').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Sesja nie istnieje' });
    if (snap.data().status === 'completed') {
      return res.status(400).json({ error: 'Dokument już podpisany' });
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('pl-PL') + ' ' + now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

    await ref.update({
      status: 'completed',
      party2: { name: party2Name, sig: party2Sig, date: dateStr, signedAt: Timestamp.now() },
    });

    const updated = (await ref.get()).data();
    return res.status(200).json({
      docText: updated.docText,
      docName: updated.docName,
      party1: { name: updated.party1.name, sig: updated.party1.sig, date: updated.party1.date },
      party2: { name: party2Name, sig: party2Sig, date: dateStr },
    });
  }

  return res.status(405).end();
}
