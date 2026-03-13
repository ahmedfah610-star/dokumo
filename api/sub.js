import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

const VALID_PLANS = ['kariera', 'biznes', 'promax'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });

  let uid;
  try { ({ uid } = await auth.verifyIdToken(token)); }
  catch { return res.status(401).json({ error: 'Nieważny token' }); }

  const { action, plan } = req.body || {};

  if (action === 'activate') {
    if (!VALID_PLANS.includes(plan)) {
      return res.status(400).json({ error: 'Nieprawidłowy plan: ' + plan });
    }
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.collection('users').doc(uid).collection('subscription').doc('current').set({
      plan,
      expiresAt: Timestamp.fromDate(expiresAt),
      activatedAt: Timestamp.now(),
    });
    return res.status(200).json({ ok: true, plan, expiresAt: expiresAt.toISOString() });
  }

  if (action === 'cancel') {
    await db.collection('users').doc(uid).collection('subscription').doc('current').update({
      cancelled: true,
      cancelledAt: new Date(),
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Nieznana akcja' });
}
