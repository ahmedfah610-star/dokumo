const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');

const app = express();
const PORT = process.env.PORT || 3001;
const PDF_API_KEY = process.env.PDF_API_KEY;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Persistent browser — launch once, reuse for all requests
let browser = null;
async function getBrowser() {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    headless: true,
  });
  browser.on('disconnected', () => { browser = null; });
  console.log('[PDF] Browser launched');
  return browser;
}

// Pre-warm browser on startup
getBrowser().catch(err => console.error('[PDF] Warmup error:', err.message));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', browserReady: !!(browser && browser.connected) });
});

app.post('/generate-pdf', async (req, res) => {
  const { html, apiKey } = req.body || {};

  if (!apiKey || apiKey !== PDF_API_KEY) {
    return res.status(401).json({ error: 'Nieautoryzowany' });
  }
  if (!html) {
    return res.status(400).json({ error: 'Brak HTML' });
  }

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    // 595×842 matches the kreator preview exactly (A4 at 72dpi / CSS pixels)
    await page.setViewport({ width: 595, height: 842, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // Strip any remaining min-height / vh heights
    await page.evaluate(() => {
      document.body.style.height = 'auto';
      document.body.style.minHeight = '0';
      document.documentElement.style.height = 'auto';
      document.documentElement.style.minHeight = '0';
      document.querySelectorAll('*').forEach(el => {
        const s = window.getComputedStyle(el);
        if (s.minHeight && s.minHeight !== '0px') el.style.minHeight = '0';
        if (s.height && s.height.includes('vh')) el.style.height = 'auto';
      });
    });

    await new Promise(r => setTimeout(r, 300));

    const buffer = await page.pdf({
      width: '595px',
      height: '842px',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return res.status(200).json({ pdf: buffer.toString('base64') });
  } catch (err) {
    console.error('PDF error:', err.message);
    return res.status(500).json({ error: err.message || 'Błąd generowania PDF' });
  } finally {
    if (page) await page.close();
  }
});

app.listen(PORT, () => {
  console.log(`PDF service running on port ${PORT}`);
});
