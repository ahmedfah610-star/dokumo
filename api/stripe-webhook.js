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

// Mapowanie Stripe Price ID → plan
// Uzupełnij po stworzeniu produktów w Stripe Dashboard
const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_START]:   'start',
  [process.env.STRIPE_PRICE_KARIERA]: 'kariera',
  [process.env.STRIPE_PRICE_BIZNES]:  'biznes',
  [process.env.STRIPE_PRICE_PROMAX]:  'promax',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    req.on('data', chunk => { data = Buffer.concat([data, chunk]); });
    req.on('end', () => resolve(data.toString()));
    req.on('error', reject);
  });

  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  // Weryfikuj podpis Stripe
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
    const planFromMeta = session.metadata?.plan;
    const priceId = session.line_items?.data?.[0]?.price?.id;
    const plan = planFromMeta || PRICE_TO_PLAN[priceId] || 'biznes';

    console.log(`Checkout completed: email=${email}, plan=${plan}, session=${session.id}`);

    if (email) {
      try {
        const auth = getAuth();
        const user = await auth.getUserByEmail(email);
        const days = plan === 'start' ? 365 : 30;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        const subDoc = {
          plan,
          expiresAt: Timestamp.fromDate(expiresAt),
          activatedAt: Timestamp.now(),
          stripeSessionId: session.id,
          stripeSubscriptionId: session.subscription || null,
          email,
        };
        if (plan === 'start') subDoc.downloadsLeft = 1;
        await db.collection('users').doc(user.uid).collection('subscription').doc('current').set(subDoc);
        await db.collection('payments').add({
          uid: user.uid, email, plan,
          stripeSessionId: session.id,
          amount: session.amount_total || 0,
          currency: session.currency || 'pln',
          ts: Timestamp.now(),
        });
        console.log(`Plan "${plan}" saved for uid: ${user.uid}`);
      } catch(e) {
        console.error('Firestore save failed:', e.message);
        return res.status(500).json({ error: 'DB error' });
      }
    }
  }

  // Odnowienie subskrypcji — przedłuż expiresAt o 30 dni
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    if (invoice.billing_reason !== 'subscription_cycle') {
      return res.status(200).json({ received: true }); // pomiń pierwszą fakturę (obsłużona wyżej)
    }
    const subId = invoice.subscription;
    const customerEmail = invoice.customer_email;
    if (subId && customerEmail) {
      try {
        const auth = getAuth();
        const user = await auth.getUserByEmail(customerEmail);
        const snap = await db.collection('users').doc(user.uid).collection('subscription').doc('current').get();
        if (snap.exists && snap.data().stripeSubscriptionId === subId) {
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await snap.ref.update({ expiresAt: Timestamp.fromDate(expiresAt), cancelled: false });
          console.log(`Subscription renewed for uid: ${user.uid}`);
        }
      } catch(e) {
        console.error('Renewal update failed:', e.message);
      }
    }
  }

  // Anulowanie subskrypcji — natychmiastowe odcięcie dostępu
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const customerId = sub.customer;
    try {
      // Znajdź użytkownika po stripeSubscriptionId
      const snap = await db.collectionGroup('subscription')
        .where('stripeSubscriptionId', '==', sub.id).limit(1).get();
      if (!snap.empty) {
        const ref = snap.docs[0].ref;
        await ref.update({ expiresAt: Timestamp.fromDate(new Date()), cancelled: true, cancelledAt: Timestamp.now() });
        console.log(`Subscription cancelled for doc: ${ref.path}`);
      }
    } catch(e) {
      console.error('Subscription delete failed:', e.message);
    }
  }

  // Chargeback — natychmiastowe odcięcie dostępu
  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object;
    const chargeId = dispute.charge;
    try {
      const snap = await db.collection('payments')
        .where('stripeSessionId', '==', dispute.payment_intent).limit(1).get();
      if (!snap.empty) {
        const uid = snap.docs[0].data().uid;
        if (uid) {
          await db.collection('users').doc(uid).collection('subscription').doc('current')
            .update({ expiresAt: Timestamp.fromDate(new Date()), cancelled: true, chargebackAt: Timestamp.now() });
          console.log(`Access revoked due to dispute for uid: ${uid}, charge: ${chargeId}`);
        }
      }
    } catch(e) {
      console.error('Dispute handling failed:', e.message);
    }
  }

  return res.status(200).json({ received: true });
}
