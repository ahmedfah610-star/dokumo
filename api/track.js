import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { page, referrer, uid } = req.body || {};
  if (!page) return res.status(400).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '';
  const country = req.headers['x-vercel-ip-country'] || '';
  const city = req.headers['x-vercel-ip-city'] || '';
  const ua = req.headers['user-agent'] || '';

  try {
    await db.collection('analytics').add({
      page,
      referrer: referrer || '',
      uid: uid || null,
      ip,
      country,
      city,
      ua,
      ts: Timestamp.now(),
    });
    return res.status(200).json({ ok: true });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
