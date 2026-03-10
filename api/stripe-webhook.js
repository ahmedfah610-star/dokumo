import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

// WAŻNE: wyłącz parsowanie body przez Vercel
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Pobierz raw body
  const rawBody = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  // Weryfikuj podpis
  let event;
  try {
    const parts = {};
    sig.split(',').forEach(p => { const [k,v] = p.split('='); parts[k] = (parts[k]||[]).concat(v); });
    const timestamp = parts['t'][0];
    const expected = crypto.createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`).digest('hex');
    if (!parts['v1'].includes(expected)) throw new Error('Bad signature');
    if (Math.abs(Date.now()/1000 - parseInt(timestamp)) > 300) throw new Error('Too old');
    event = JSON.parse(rawBody);
  } catch(e) {
    console.error('Webhook verify failed:', e.message);
    return res.status(400).json({ error: e.message });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email;
    console.log('Checkout completed, email:', email);

    if (email) {
      try {
        const auth = getAuth();
        const user = await auth.getUserByEmail(email);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db.collection('users').doc(user.uid).collection('subscription').doc('current').set({
          plan: 'biznes',
          expiresAt: Timestamp.fromDate(expiresAt),
          activatedAt: Timestamp.now(),
          stripeSessionId: session.id,
          email,
        });
        console.log('PRO saved for uid:', user.uid);
      } catch(e) {
        console.error('Firestore save failed:', e.message);
      }
    }
  }

  return res.status(200).json({ received: true });
}
