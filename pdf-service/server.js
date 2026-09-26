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
    // Defense-in-depth: szablony CV/dokumentów używają tylko fontów systemowych
    // i zdjęć jako data: URI — sieć nie jest potrzebna do renderowania, więc
    // blokujemy cały ruch wychodzący na wypadek niezescapowanego HTML (SSRF/exfiltracja).
    // (JS pozostaje włączony — page.evaluate() poniżej go wymaga.)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('data:') || url.startsWith('about:')) return req.continue();
      req.abort();
    });
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

    // Dopasowanie CV do jednej strony liczone jest ponownie TUTAJ. Kreator
    // liczy je w przegladarce uzytkownika, ale tam tekst dziedziczy czcionke
    // ze strony kreatora (Figtree), a tu jej nie ma — sieć jest zablokowana.
    // Inne metryki to inna wysokosc tresci: ten sam zyciorys mial 1053px w
    // podgladzie i 916px w PDF, wiec skala z podgladu zostawiala bialy pas
    // u dolu kartki. Liczymy wiec skale w tym samym srodowisku, w ktorym
    // powstaje plik.
    await page.evaluate(() => {
      const MIN = 0.75, SZER = 595, WYS = 842;
      const strona = document.querySelector('[data-cv-strona]');
      if (!strona) return;
      const root = strona.firstElementChild;
      if (!root) return;

      // zdejmij dopasowanie policzone w przegladarce
      root.style.transform = '';
      root.style.width = '';
      root.style.height = 'auto';
      root.style.minHeight = '0';
      root.style.maxHeight = 'none';
      root.style.overflow = 'visible';
      void root.offsetHeight;

      const wysPrzy = (s) => {
        root.style.width = (SZER / s) + 'px';
        void root.offsetHeight;
        return root.scrollHeight * s;
      };

      if (wysPrzy(1) <= WYS) {
        // krotkie CV — pelna szerokosc i pelna wysokosc kartki
        root.style.width = SZER + 'px';
        root.style.height = WYS + 'px';
        root.style.overflow = 'hidden';
        return;
      }
      // Ponizej progu czytelnosci nie zmniejszamy — wtedy CV ma isc na dwie
      // strony. Pudelko strony ma overflow:hidden, wiec zostawienie go
      // UCIELOBY nadmiar zamiast go przeniesc; rozpakowujemy je.
      if (wysPrzy(MIN) > WYS) {
        root.style.width = SZER + 'px';
        root.style.transform = '';
        strona.parentNode.insertBefore(root, strona);
        strona.remove();
        return;
      }
      let dol = MIN, gora = 1, skala = MIN;
      for (let i = 0; i < 9; i++) {
        const sr = (dol + gora) / 2;
        if (wysPrzy(sr) <= WYS) { skala = sr; dol = sr; } else { gora = sr; }
        if (gora - dol < 0.002) break;
      }
      root.style.width = (SZER / skala) + 'px';
      root.style.transformOrigin = 'top left';
      root.style.transform = 'scale(' + skala + ')';
    });

    await new Promise(r => setTimeout(r, 300));

    // Dokumenty skladane sa w 595x842 px CSS, co Chromium liczy po 96 dpi —
    // wychodzila z tego kartka 158x223 mm zamiast A4. Plik wygladal poprawnie
    // tylko dlatego, ze czytniki dopasowuja go do okna; wydruk w skali 1:1 dawal
    // dokument o cwierc mniejszy. Drukujemy wiec na A4 i skalujemy zawartosc
    // o 96/72, przez co 595 px CSS wypelnia dokladnie szerokosc kartki.
    // Podzial na strony pozostaje bez zmian: po przeskalowaniu obszar strony to
    // nadal 595x842 px CSS.
    const buffer = await page.pdf({
      format: 'A4',
      scale: 96 / 72,
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
