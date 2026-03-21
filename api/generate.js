import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt, url, docId, docName, docCat, docIcon, docCatLabel, systemPrompt } = req.body;

  // ── Tryb pobierania URL (fetch-url wbudowany) ──
  if (url) {
    try { new URL(url); } catch { return res.status(400).json({ error: 'Nieprawidłowy URL' }); }
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Dokumo/1.0)', 'Accept': 'text/html', 'Accept-Language': 'pl,en;q=0.9' },
        redirect: 'follow', signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) return res.status(422).json({ error: 'Strona niedostępna (' + r.status + ')' });
      const html = await r.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ').trim().substring(0, 12000);
      if (text.length < 100) return res.status(422).json({ error: 'Nie udało się pobrać treści strony' });
      return res.status(200).json({ text });
    } catch(err) {
      const msg = err.name === 'TimeoutError' ? 'Przekroczono czas pobierania strony' : 'Nie udało się pobrać treści ogłoszenia';
      return res.status(422).json({ error: msg });
    }
  }

  if (!prompt) return res.status(400).json({ error: 'Brak zapytania' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Brak klucza ANTHROPIC_API_KEY' });

  // Generuj przez Claude
  try {
    const r = await fetch(
      'https://api.anthropic.com/v1/messages',
      { method:'POST', headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
        body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:8000, system: systemPrompt || 'Piszesz wyłącznie po polsku. Nigdy nie używaj innych języków ani obcojęzycznych zwrotów — dotyczy to RÓWNIEŻ pojedynczych angielskich słów i wyrażeń branżowych, nawet powszechnie używanych w Polsce. Zawsze stosuj polskie odpowiedniki: "umiejętności techniczne" zamiast "technical skills", "zarządzanie projektem" zamiast "project management", "oprogramowanie" zamiast "software" itp. Przestrzegaj polskiej interpunkcji i ortografii: stawiaj przecinki przed zdaniami podrzędnymi i imiesłowowymi, stosuj myślnik zamiast pauzy w dialogach, nie pomijaj znaków diakrytycznych (ą, ę, ś, ć, ó, ź, ż, ń, ł). Zero markdown, zero gwiazdek, zero emoji, chyba że instrukcja wyraźnie nakazuje inaczej.', messages:[{role:'user',content:prompt}] }),
        signal: AbortSignal.timeout(57000) }
    );
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = data.content?.[0]?.text || '';
    if (!text) return res.status(500).json({ error: 'Pusta odpowiedź AI' });

    // Zapisz do Firestore jeśli user zalogowany
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (token) {
      try {
        const { uid } = await auth.verifyIdToken(token);
        const ref = db.collection('users').doc(uid).collection('documents').doc();
        await ref.set({
          id: ref.id,
          typeId: docId || 'unknown',
          name: docName || 'Dokument',
          text,
          cat: docCat || 'inne',
          icon: docIcon || '📄',
          catLabel: docCatLabel || 'Inne',
          status: 'generated',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch(e) {
        console.error('Firestore save error:', e.message);
        // Nie blokuj — dokument i tak zwracamy
      }
    }

    return res.status(200).json({ text });
  } catch(e) {
    const msg = e.name === 'TimeoutError' || e.message?.includes('aborted')
      ? 'Generowanie trwa zbyt długo — spróbuj ponownie za chwilę.'
      : e.message;
    return res.status(500).json({ error: msg });
  }
}
