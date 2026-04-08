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
  // Walidacja kodu rabatowego — osobny rate limit: 5 prób/min per IP
  if ('discount_code' in req.query) {
    if (!handler._dcrl) handler._dcrl = new Map();
    if (ip) {
      const now2 = Date.now();
      const dc = handler._dcrl.get(ip) || { c: 0, r: now2 + 60000 };
      if (now2 > dc.r) { dc.c = 0; dc.r = now2 + 60000; }
      if (dc.c >= 5) return res.status(429).json({ valid: false, error: 'Zbyt wiele prób' });
      dc.c++; handler._dcrl.set(ip, dc);
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
    // Nie cachujemy publicznie — tylko no-store żeby przeglądarka nie trzymała w cache
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({
      apiKey: process.env.FIREBASE_WEB_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
    });
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
