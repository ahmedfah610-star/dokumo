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

  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  try {
    const decoded = await auth.verifyIdToken(token);
    if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes((decoded.email || '').toLowerCase())) {
      return res.status(403).json({ error: 'Brak dostępu' });
    }
  } catch(e) {
    return res.status(401).json({ error: 'Nieważny token' });
  }

  const [analyticsSnap, paymentsSnap] = await Promise.all([
    db.collection('analytics').orderBy('ts', 'desc').limit(500).get(),
    db.collection('payments').orderBy('ts', 'desc').limit(200).get(),
  ]);

  const events = analyticsSnap.docs.map(d => ({
    ...d.data(), id: d.id,
    ts: d.data().ts?.toDate?.()?.toISOString() || null,
  }));
  const payments = paymentsSnap.docs.map(d => ({
    ...d.data(), id: d.id,
    ts: d.data().ts?.toDate?.()?.toISOString() || null,
  }));

  return res.status(200).json({ events, payments });
}
