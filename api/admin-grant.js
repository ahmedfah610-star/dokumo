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
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Weryfikacja admina
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });

  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  let decoded;
  try { decoded = await auth.verifyIdToken(token); }
  catch { return res.status(401).json({ error: 'Nieważny token' }); }

  if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes((decoded.email || '').toLowerCase())) {
    return res.status(403).json({ error: 'Brak dostępu' });
  }

  const { email, plan, days = 30 } = req.body || {};

  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Podaj email' });
  if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: 'Nieprawidłowy plan: ' + plan });

  const daysNum = Math.max(1, Math.min(365, parseInt(days) || 30));
  const expiresAt = new Date(Date.now() + daysNum * 24 * 60 * 60 * 1000);
  const emailClean = email.trim().toLowerCase();

  const subData = {
    plan,
    expiresAt: Timestamp.fromDate(expiresAt),
    activatedAt: Timestamp.now(),
    grantedByAdmin: true,
    email: emailClean,
  };

  // Szukaj użytkownika po emailu
  try {
    const user = await auth.getUserByEmail(emailClean);
    // Użytkownik istnieje — zapisz subskrypcję bezpośrednio
    await db.collection('users').doc(user.uid).collection('subscription').doc('current').set(subData);
    return res.status(200).json({ ok: true, status: 'granted', uid: user.uid, plan, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      return res.status(500).json({ error: 'Błąd Firebase: ' + e.message });
    }
    // Użytkownik nie istnieje — zapisz oczekującą subskrypcję
    const emailKey = emailClean.replace(/[^a-z0-9._-]/g, '_');
    await db.collection('pending_subs').doc(emailKey).set({
      ...subData,
      pendingSince: Timestamp.now(),
    });
    return res.status(200).json({ ok: true, status: 'pending', plan, expiresAt: expiresAt.toISOString() });
  }
}
