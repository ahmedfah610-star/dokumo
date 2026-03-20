import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const auth = getAuth();

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
    responseLimit: '10mb',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });

  try { await auth.verifyIdToken(token); }
  catch { return res.status(401).json({ error: 'Nieważny token' }); }

  const { html, filename } = req.body || {};
  if (!html) return res.status(400).json({ error: 'Brak HTML' });

  const pdfServiceUrl = process.env.PDF_SERVICE_URL;
  const pdfApiKey = process.env.PDF_API_KEY;

  if (!pdfServiceUrl) return res.status(500).json({ error: 'PDF_SERVICE_URL nie ustawiony' });

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=794">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 794px; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>${html}</body>
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
    res.setHeader('Content-Disposition', `attachment; filename="${(filename || 'CV').replace(/"/g, '')}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('PDF proxy error:', err.message);
    return res.status(500).json({ error: err.message || 'Błąd generowania PDF' });
  }
}
