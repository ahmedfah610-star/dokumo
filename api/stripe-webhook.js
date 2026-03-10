import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = await getRawBody(req);

  // Weryfikacja podpisu Stripe
  let event;
  try {
    event = verifyStripeWebhook(rawBody, sig, secret);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid signature: ' + e.message });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email;

    if (email) {
      // Znajdź usera po emailu w Firebase Auth
      try {
        const { getAuth } = await import('firebase-admin/auth');
        const auth = getAuth();
        const user = await auth.getUserByEmail(email);
        const uid = user.uid;

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db.collection('users').doc(uid).collection('subscription').doc('current').set({
          plan: 'biznes',
          expiresAt: Timestamp.fromDate(expiresAt),
          activatedAt: Timestamp.now(),
          stripeSessionId: session.id,
        });
        console.log(`PRO activated for ${email}, expires ${expiresAt}`);
      } catch (e) {
        console.error('Error activating PRO:', e.message);
      }
    }
  }

  return res.status(200).json({ received: true });
}

// Parsuj raw body
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Weryfikacja podpisu bez biblioteki stripe
function verifyStripeWebhook(payload, sig, secret) {
  const parts = sig.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const signatures = sig.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));

  const signedPayload = `${timestamp}.${payload}`;

  const crypto = require('crypto');
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  if (!signatures.includes(expected)) {
    throw new Error('Signature mismatch');
  }

  // Sprawdź czy nie starszy niż 5 minut
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
    throw new Error('Timestamp too old');
  }

  return JSON.parse(payload);
}
