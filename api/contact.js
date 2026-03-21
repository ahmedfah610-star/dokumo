export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'https://dokumoflow.com');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Wypełnij wszystkie pola' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Nieprawidłowy adres e-mail' });
  }
  if (message.length > 4000) {
    return res.status(400).json({ error: 'Wiadomość jest zbyt długa (max 4000 znaków)' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Brak konfiguracji e-mail' });

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'Dokumo Kontakt <onboarding@resend.dev>',
        to: 'dokumoflow@gmail.com',
        reply_to: email,
        subject: `Wiadomość od ${name}`,
        text: `Od: ${name} <${email}>\n\n${message}`,
        html: `<p><strong>Od:</strong> ${name} &lt;${email}&gt;</p><hr/><p>${message.replace(/\n/g, '<br>')}</p>`
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      console.error('Resend error:', data);
      return res.status(500).json({ error: 'Nie udało się wysłać wiadomości. Spróbuj ponownie.' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Contact send error:', e.message);
    return res.status(500).json({ error: 'Błąd serwera. Spróbuj ponownie za chwilę.' });
  }
}
