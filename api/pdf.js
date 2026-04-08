import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const auth = getAuth();
const db = getFirestore();

async function hasActiveSubscription(uid) {
  const snap = await db.collection('users').doc(uid).collection('subscription').doc('current').get();
  if (!snap.exists) return false;
  const exp = snap.data().expiresAt?.toDate?.();
  return exp && exp > new Date();
}

// Rate limit: max 20 PDF na godzinę per użytkownik
const PDF_RATE_LIMIT = 20;
const PDF_WINDOW_MS = 60 * 60 * 1000;

async function checkPdfRateLimit(uid) {
  const windowStart = Timestamp.fromMillis(Date.now() - PDF_WINDOW_MS);
  const snap = await db.collection('users').doc(uid).collection('pdfUsage')
    .where('ts', '>=', windowStart).count().get();
  return snap.data().count;
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '2mb' },  // zredukowany z 10mb — CV nie potrzebuje więcej
    responseLimit: '10mb',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });

  let uid;
  try { ({ uid } = await auth.verifyIdToken(token)); }
  catch { return res.status(401).json({ error: 'Nieważny token' }); }

  try {
    if (!await hasActiveSubscription(uid)) return res.status(403).json({ error: 'Brak aktywnej subskrypcji' });
  } catch(e) {
    return res.status(500).json({ error: 'Błąd weryfikacji subskrypcji' });
  }

  // Start plan — atomowy dekrement downloadsLeft (1 pobranie)
  try {
    const subRef = db.collection('users').doc(uid).collection('subscription').doc('current');
    const blocked = await db.runTransaction(async (tx) => {
      const snap = await tx.get(subRef);
      if (!snap.exists) return true;
      const data = snap.data();
      if (data.plan !== 'start') return false; // inne plany — bez limitu
      const left = data.downloadsLeft ?? 0;
      if (left <= 0) return true;
      tx.update(subRef, { downloadsLeft: left - 1 });
      return false;
    });
    if (blocked) return res.status(403).json({ error: 'Limit pobrań w pakiecie Start został wykorzystany. Wykup wyższy pakiet.' });
  } catch(e) {
    console.error('Start plan download check error:', e.message);
    return res.status(500).json({ error: 'Błąd weryfikacji limitu pobrań' });
  }

  // Rate limit PDF
  try {
    const count = await checkPdfRateLimit(uid);
    if (count >= PDF_RATE_LIMIT) return res.status(429).json({ error: 'Przekroczono limit PDF (20/godz.). Spróbuj za chwilę.' });
    await db.collection('users').doc(uid).collection('pdfUsage').add({ ts: Timestamp.now() });
  } catch(e) {
    console.error('PDF rate limit error:', e.message);
    return res.status(503).json({ error: 'Chwilowy problem z serwerem.' });
  }

  const { html, filename } = req.body || {};
  if (!html) return res.status(400).json({ error: 'Brak HTML' });
  if (typeof html !== 'string' || html.length > 1500000) return res.status(400).json({ error: 'HTML zbyt duży' });

  const pdfServiceUrl = process.env.PDF_SERVICE_URL;
  const pdfApiKey = process.env.PDF_API_KEY;

  if (!pdfServiceUrl) return res.status(500).json({ error: 'PDF_SERVICE_URL nie ustawiony' });

  // Render at exactly 595px so PDF matches the kreator preview 1:1
  const cleanHtml = html
    .replace(/min-height\s*:\s*842px/gi, 'height:842px;min-height:0')
    .replace(/min-height\s*:\s*\d+px/gi, 'min-height:0')
    .replace(/max-height\s*:\s*842px/gi, 'max-height:none');

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=595">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 595px !important; max-width: 595px !important; margin: 0 !important; padding: 0 !important; overflow: hidden; }
  body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>${cleanHtml}</body>
</html>`;

  try {
    const resp = await fetch(`${pdfServiceUrl}/generate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: fullHtml, apiKey: pdfApiKey }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(502).json({ error: err.error || 'Błąd serwisu PDF: ' + resp.status });
    }

    const { pdf } = await resp.json();
    const buffer = Buffer.from(pdf, 'base64');

    res.setHeader('Content-Type', 'application/pdf');
    const safeFn = (filename || 'CV').replace(/"/g, '').replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFn}.pdf"; filename*=UTF-8''${encodeURIComponent((filename || 'CV') + '.pdf')}`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('PDF proxy error:', err.message);
    return res.status(500).json({ error: err.message || 'Błąd generowania PDF' });
  }
}
