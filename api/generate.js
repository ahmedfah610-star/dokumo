import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

// Dozwolone kategorie dokumentów — blokuje wywołania spoza aplikacji
const ALLOWED_CATS = new Set([
  'hr','kariera','biznes','najem','sprzedaz','inne'
]);

// Wymagane plany per kategoria (serwer-side — nie można ominąć)
const CAT_REQUIRED_PLANS = {
  hr:       ['kariera','biznes','promax'],
  kariera:  ['kariera','biznes','promax','start'],
  biznes:   ['biznes','promax'],
  najem:    ['kariera','biznes','promax'],
  sprzedaz: ['kariera','biznes','promax'],
  inne:     ['kariera','biznes','promax'],
};

async function checkSubscription(uid) {
  const snap = await db.collection('users').doc(uid)
    .collection('subscription').doc('current').get();
  if (!snap.exists) return null;
  const data = snap.data();
  const expiresAt = data.expiresAt?.toDate?.();
  if (!expiresAt || expiresAt <= new Date()) return null;
  return data;
}

// Limit: max 25 requestów na godzinę na użytkownika
const RATE_LIMIT = 25;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 godzina

async function checkRateLimit(uid) {
  const windowStart = Timestamp.fromMillis(Date.now() - RATE_WINDOW_MS);
  const snap = await db.collection('users').doc(uid)
    .collection('usage')
    .where('ts', '>=', windowStart)
    .count()
    .get();
  return snap.data().count;
}

async function recordUsage(uid) {
  await db.collection('users').doc(uid)
    .collection('usage')
    .add({ ts: Timestamp.now() });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt, url, docId, docName, docCat, docIcon, docCatLabel, systemPrompt } = req.body;

  // ── Wymagane uwierzytelnienie ──
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Wymagane logowanie' });

  let uid;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Nieprawidłowy token' });
  }

  // ── Rate limiting ──
  try {
    const count = await checkRateLimit(uid);
    if (count >= RATE_LIMIT) {
      return res.status(429).json({ error: 'Przekroczono limit generowania dokumentów (25/godz.). Spróbuj za chwilę.' });
    }
  } catch(e) {
    console.error('Rate limit check error:', e.message);
  }

  // ── Walidacja kategorii ──
  const cat = docCat || 'inne';
  if (!ALLOWED_CATS.has(cat)) {
    return res.status(400).json({ error: 'Niedozwolona kategoria dokumentu' });
  }

  // ── Sprawdzenie subskrypcji (serwer-side) ──
  try {
    const sub = await checkSubscription(uid);
    if (!sub) {
      return res.status(403).json({ error: 'Brak aktywnej subskrypcji' });
    }
    const requiredPlans = CAT_REQUIRED_PLANS[cat] || ['kariera','biznes','promax'];
    if (!requiredPlans.includes(sub.plan)) {
      return res.status(403).json({ error: 'Twój pakiet nie obejmuje tej kategorii dokumentów' });
    }
  } catch(e) {
    console.error('Subscription check error:', e.message);
    return res.status(500).json({ error: 'Błąd weryfikacji subskrypcji' });
  }

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

  // systemPrompt przyjmowany tylko od zalogowanego użytkownika — ale max 4000 znaków
  const safeSystemPrompt = typeof systemPrompt === 'string' && systemPrompt.length <= 4000
    ? systemPrompt
    : 'Piszesz wyłącznie po polsku. Przestrzegaj polskiej interpunkcji i ortografii. Zero markdown, zero gwiazdek, zero emoji, chyba że instrukcja wyraźnie nakazuje inaczej.';

  // Generuj przez Claude
  try {
    const r = await fetch(
      'https://api.anthropic.com/v1/messages',
      { method:'POST', headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
        body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:8000, system: safeSystemPrompt, messages:[{role:'user',content:prompt}] }),
        signal: AbortSignal.timeout(57000) }
    );
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = data.content?.[0]?.text || '';
    if (!text) return res.status(500).json({ error: 'Pusta odpowiedź AI' });

    // Zapisz użycie do rate limitera
    recordUsage(uid).catch(e => console.error('Usage record error:', e.message));

    // Zapisz dokument do Firestore
    try {
      const ref = db.collection('users').doc(uid).collection('documents').doc();
      await ref.set({
        id: ref.id,
        typeId: docId || 'unknown',
        name: docName || 'Dokument',
        text,
        cat,
        icon: docIcon || '📄',
        catLabel: docCatLabel || 'Inne',
        status: 'generated',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch(e) {
      console.error('Firestore save error:', e.message);
    }

    return res.status(200).json({ text });
  } catch(e) {
    const msg = e.name === 'TimeoutError' || e.message?.includes('aborted')
      ? 'Generowanie trwa zbyt długo — spróbuj ponownie za chwilę.'
      : e.message;
    return res.status(500).json({ error: msg });
  }
}
