export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Brak URL' });

  try {
    new URL(url); // validate
  } catch {
    return res.status(400).json({ error: 'Nieprawidłowy URL' });
  }

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Dokumo/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pl,en;q=0.9'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000)
    });

    if (!r.ok) return res.status(422).json({ error: 'Strona niedostępna (' + r.status + ')' });

    const contentType = r.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return res.status(422).json({ error: 'Nieobsługiwany typ strony' });
    }

    const html = await r.text();

    // Strip tags, scripts, styles — extract readable text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .substring(0, 12000);

    if (text.length < 100) return res.status(422).json({ error: 'Nie udało się pobrać treści strony' });

    res.status(200).json({ text });
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'Przekroczono czas pobierania strony' : 'Nie udało się pobrać treści ogłoszenia';
    res.status(422).json({ error: msg });
  }
}
