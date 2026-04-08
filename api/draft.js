import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

// In-memory rate limit: max 20 req/min per uid
const _rl = new Map();
function checkRl(uid) {
  const now = Date.now();
  const e = _rl.get(uid) || { c: 0, r: now + 60000 };
  if (now > e.r) { e.c = 0; e.r = now + 60000; }
  if (e.c >= 20) return false;
  e.c++; _rl.set(uid, e); return true;
}

export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });

  let uid;
  try { ({ uid } = await auth.verifyIdToken(token)); }
  catch(e) { return res.status(401).json({ error: 'Nieważny token' }); }

  if (!checkRl(uid)) return res.status(429).json({ error: 'Zbyt wiele żądań. Spróbuj za chwilę.' });

  // POST – zapisz wersję roboczą
  if (req.method === 'POST') {
    const { text, cvDataJson } = req.body;
    if (typeof text === 'string' && text.length > 200000) return res.status(400).json({ error: 'Dane zbyt duże' });
    if (typeof cvDataJson === 'string' && cvDataJson.length > 200000) return res.status(400).json({ error: 'Dane zbyt duże' });
    try {
      await db.collection('users').doc(uid).collection('drafts').doc('cv').set({
        text: text || '',
        cvDataJson: cvDataJson || '',
        updatedAt: new Date(),
      });
      return res.status(200).json({ ok: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET – wczytaj wersję roboczą
  if (req.method === 'GET') {
    try {
      const snap = await db.collection('users').doc(uid).collection('drafts').doc('cv').get();
      if (!snap.exists) return res.status(404).json({ error: 'Brak wersji roboczej' });
      const data = snap.data();
      return res.status(200).json({ cvDataJson: data.cvDataJson || '', updatedAt: data.updatedAt?.toDate?.() || null });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE – usuń wersję roboczą
  if (req.method === 'DELETE') {
    try {
      await db.collection('users').doc(uid).collection('drafts').doc('cv').delete();
      return res.status(200).json({ ok: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
}
