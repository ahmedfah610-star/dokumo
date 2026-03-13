import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
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

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 595px; background: #fff; }
</style>
</head>
<body>${html}</body>
</html>`;

  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 595, height: 842 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 8000 });

    const pdf = await page.pdf({
      width: '595px',
      height: '842px',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${(filename || 'CV').replace(/"/g, '')}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    return res.status(200).send(Buffer.from(pdf));
  } catch (err) {
    console.error('PDF error:', err.message);
    return res.status(500).json({ error: err.message || 'Błąd generowania PDF' });
  } finally {
    if (browser) await browser.close();
  }
}
