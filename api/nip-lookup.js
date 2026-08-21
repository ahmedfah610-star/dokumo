import { zweryfikuj, validNip } from '../lib/kontrahent.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  // Prosty in-memory rate limit per IP: max 30 req/min
  const ip = ((req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',').pop() || '').trim();
  if (ip) {
    const now = Date.now();
    if (!handler._rl) handler._rl = new Map();
    const e = handler._rl.get(ip) || { c: 0, r: now + 60000 };
    if (now > e.r) { e.c = 0; e.r = now + 60000; }
    if (e.c >= 30) return res.status(429).json({ error: 'Zbyt wiele żądań' });
    e.c++;
    handler._rl.set(ip, e);
  }
  // Walidacja kodu rabatowego. To jedyna wyrocznia „ten kod istnieje" w całym
  // serwisie, więc limit MUSI być trwały — licznik w pamięci procesu resetuje
  // się z każdą nową instancją funkcji i realnie nie ogranicza zgadywania.
  // 20 prób na godzinę per IP: człowiek wpisujący kod z newslettera tego nie
  // dotknie, słownikowy atak owszem.
  if ('discount_code' in req.query) {
    const { limitTrwaly } = await import('../lib/limit.js');
    const lim = await limitTrwaly('kod-rabatowy', ip || 'brak-ip', 20, 60 * 60 * 1000);
    if (!lim.ok) {
      // Świadomie fail-closed: przy awarii Firestore wolimy chwilowo nie
      // sprawdzać kodów niż wystawić wyrocznię bez żadnego limitu.
      return lim.blad
        ? res.status(503).json({ valid: false, error: 'Weryfikacja kodu chwilowo niedostępna' })
        : res.status(429).json({ valid: false, error: 'Zbyt wiele prób — spróbuj później' });
    }
    const CODES = (() => {
      const out = {};
      (process.env.DISCOUNT_CODES || '').split(',').forEach(entry => {
        const [k, v] = entry.trim().split(':');
        if (k && v && !isNaN(v)) out[k.toUpperCase()] = Number(v);
      });
      return out;
    })();
    const code = (req.query.discount_code || '').toUpperCase().trim();
    const percent = CODES[code];
    return res.status(200).json(percent ? { valid: true, percent } : { valid: false });
  }

  if ('fbconfig' in req.query) {
    // Firebase Web API Key z zalozenia jest publiczny (frontend SDK). Cache 1h
    // skraca load kazdej strony o 200-2000ms (eliminuje fetch + Vercel cold start)
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
    return res.json({
      apiKey: process.env.FIREBASE_WEB_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
    });
  }

  // ── Agent Weryfikacji Kontrahenta ──
  // GET ?verify=NIP[&account=RACHUNEK][&amount=KWOTA][&date=RRRR-MM-DD][&vies=1]
  // Zwraca status VAT, rachunki, ocenę ryzyka i dowód sprawdzenia (requestId MF).
  if ('verify' in req.query) {
    const nipQ = String(req.query.verify || '');
    if (!validNip(nipQ)) return res.status(400).json({ ok: false, error: 'Nieprawidłowy NIP' });
    // Weryfikacja odpytuje zewnętrzne rejestry — ostrzejszy limit: 10/min per IP.
    if (ip) {
      if (!handler._vrl) handler._vrl = new Map();
      const nowV = Date.now();
      const v = handler._vrl.get(ip) || { c: 0, r: nowV + 60000 };
      if (nowV > v.r) { v.c = 0; v.r = nowV + 60000; }
      if (v.c >= 10) return res.status(429).json({ ok: false, error: 'Zbyt wiele weryfikacji — odczekaj minutę' });
      v.c++; handler._vrl.set(ip, v);
    }
    const d = String(req.query.date || '');
    try {
      const out = await zweryfikuj(nipQ, {
        rachunek: req.query.account || null,
        kwota: req.query.amount != null ? Number(req.query.amount) : null,
        date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null,
        vies: req.query.vies === '1',
      });
      return res.status(out.ok ? 200 : 404).json(out);
    } catch (e) {
      return res.status(e.upstream ? 503 : 500)
        .json({ ok: false, error: e.upstream ? 'Rejestr MF chwilowo niedostępny — spróbuj za chwilę' : 'Błąd weryfikacji' });
    }
  }

  const { nip } = req.query;
  if (!nip) return res.status(400).json({ error: 'Brak NIP' });

  const clean = nip.replace(/[\s\-\.]/g, '');
  if (!/^\d{10}$/.test(clean)) {
    return res.status(400).json({ error: 'NIP musi składać się z 10 cyfr' });
  }

  const today = new Date().toISOString().split('T')[0];
  try {
    const r = await fetch(
      `https://wl-api.mf.gov.pl/api/search/nip/${clean}?date=${today}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!r.ok) return res.status(404).json({ error: 'Nie znaleziono firmy o podanym NIP' });

    const data = await r.json();
    const s = data?.result?.subject;
    if (!s) return res.status(404).json({ error: 'Nie znaleziono firmy o podanym NIP' });

    // Normalize name: MF API returns UPPERCASE
    const name = s.name
      ? s.name.charAt(0).toUpperCase() + s.name.slice(1).toLowerCase()
      : '';
    const adres = s.workingAddress || s.residenceAddress || '';

    return res.status(200).json({ name, adres, nip: s.nip || clean });
  } catch (e) {
    return res.status(500).json({ error: 'Błąd połączenia z bazą MF' });
  }
}
