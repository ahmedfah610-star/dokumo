export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

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
