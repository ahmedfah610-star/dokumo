const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');

const app = express();
const PORT = process.env.PORT || 3001;
const PDF_API_KEY = process.env.PDF_API_KEY;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/generate-pdf', async (req, res) => {
  const { html, apiKey } = req.body || {};

  if (!apiKey || apiKey !== PDF_API_KEY) {
    return res.status(401).json({ error: 'Nieautoryzowany' });
  }
  if (!html) {
    return res.status(400).json({ error: 'Brak HTML' });
  }

  let browser;
  try {
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

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    const bodyHeight = await page.evaluate(() => document.documentElement.scrollHeight);

    const buffer = await page.pdf({
      width: '794px',
      height: bodyHeight + 'px',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return res.status(200).json({ pdf: buffer.toString('base64') });
  } catch (err) {
    console.error('PDF error:', err.message);
    return res.status(500).json({ error: err.message || 'Błąd generowania PDF' });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`PDF service running on port ${PORT}`);
});
