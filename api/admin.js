import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

const VALID_PLANS = ['kariera', 'biznes', 'promax'];

async function verifyAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) throw Object.assign(new Error('Brak tokenu'), { status: 401 });
  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  // Jeśli ADMIN_EMAILS nie skonfigurowany — blokuj wszystkich (fail-closed)
  if (!ADMIN_EMAILS.length) throw Object.assign(new Error('Brak dostępu — ADMIN_EMAILS nie skonfigurowane'), { status: 403 });
  let decoded;
  try { decoded = await auth.verifyIdToken(token); }
  catch { throw Object.assign(new Error('Nieważny token'), { status: 401 }); }
  if (!ADMIN_EMAILS.includes((decoded.email || '').toLowerCase())) {
    throw Object.assign(new Error('Brak dostępu'), { status: 403 });
  }
  return decoded;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dokumoflow.com');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET — statystyki (dawniej /api/analytics)
    if (req.method === 'GET') {
      await verifyAdmin(req);
      const paymentsSnap = await db.collection('payments').orderBy('ts', 'desc').limit(200).get();
      const payments = paymentsSnap.docs.map(d => ({ ...d.data(), id: d.id, ts: d.data().ts?.toDate?.()?.toISOString() || null }));
      return res.status(200).json({ payments });
    }

    if (req.method !== 'POST') return res.status(405).end();

    await verifyAdmin(req);
    const { action, email, plan, days = 30 } = req.body || {};

    // POST action=grant — nadaj subskrypcję (dawniej /api/admin-grant)
    if (action === 'grant') {
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

      try {
        const user = await auth.getUserByEmail(emailClean);
        await db.collection('users').doc(user.uid).collection('subscription').doc('current').set(subData);
        return res.status(200).json({ ok: true, status: 'granted', uid: user.uid, plan, expiresAt: expiresAt.toISOString() });
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
        const emailKey = emailClean.replace(/[^a-z0-9._-]/g, '_');
        await db.collection('pending_subs').doc(emailKey).set({ ...subData, pendingSince: Timestamp.now() });
        return res.status(200).json({ ok: true, status: 'pending', plan, expiresAt: expiresAt.toISOString() });
      }
    }

    return res.status(400).json({ error: 'Nieznana akcja' });

  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
