import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const auth = getAuth();

// Kody rabatowe — muszą być zgodne z validate-code.js
const CODES = {
  'WELCOME20': 20,
  'LAUNCH30': 30,
  'VIP50': 50,
};

const PRICE_IDS = {
  kariera: process.env.STRIPE_PRICE_KARIERA,
  biznes:  process.env.STRIPE_PRICE_BIZNES,
  promax:  process.env.STRIPE_PRICE_PROMAX,
};

async function stripePost(path, params) {
  const r = await fetch('https://api.stripe.com/v1' + path, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  return r.json();
}

async function stripeGet(path) {
  const r = await fetch('https://api.stripe.com/v1' + path, {
    headers: { 'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY },
  });
  return r.json();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });

  let uid, email;
  try { ({ uid, email } = await auth.verifyIdToken(token)); }
  catch { return res.status(401).json({ error: 'Nieważny token' }); }

  const { plan, code } = req.body || {};

  const VALID_PLANS = ['kariera', 'biznes', 'promax'];
  if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: 'Nieprawidłowy plan' });

  const priceId = PRICE_IDS[plan];
  if (!priceId) return res.status(500).json({ error: 'Brak konfiguracji ceny dla planu: ' + plan });

  const origin = 'https://dokumoflow.com';
  const sessionParams = {
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    customer_email: email || '',
    'metadata[plan]': plan,
    'metadata[uid]': uid,
    success_url: `${origin}/subskrypcja.html?payment_success=1&plan=${plan}`,
    cancel_url: `${origin}/subskrypcja.html`,
  };

  // Zastosuj kod rabatowy — kupon tylko na 1. miesiąc (duration: once)
  if (code) {
    const codeUpper = code.toUpperCase().trim();
    const percent = CODES[codeUpper];
    if (percent) {
      const couponId = `DOKUMO_${codeUpper}`;
      // Sprawdź czy kupon już istnieje w Stripe
      const existing = await stripeGet('/coupons/' + couponId);
      if (existing.error?.code === 'resource_missing') {
        // Utwórz kupon jednorazowy (tylko 1. płatność)
        await stripePost('/coupons', {
          id: couponId,
          percent_off: String(percent),
          duration: 'once',
          name: `${percent}% rabat — 1. miesiąc`,
        });
      }
      sessionParams['discounts[0][coupon]'] = couponId;
    }
  }

  const session = await stripePost('/checkout/sessions', sessionParams);
  if (!session.url) {
    return res.status(500).json({ error: session.error?.message || 'Błąd Stripe' });
  }

  return res.status(200).json({ url: session.url });
}
