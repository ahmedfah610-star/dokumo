import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const auth = getAuth();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Weryfikacja tokenu
  const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!idToken) return res.status(401).json({ error: 'Brak autoryzacji' });

  let uid;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: 'Nieważny token' });
  }

  // Aktywuj subskrypcję na 7 dni
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.collection('users').doc(uid).collection('subscription').doc('current').set({
    plan: 'biznes',
    expiresAt: Timestamp.fromDate(expiresAt),
    activatedAt: Timestamp.now(),
  });

  return res.status(200).json({ ok: true, expiresAt: expiresAt.toISOString() });
}