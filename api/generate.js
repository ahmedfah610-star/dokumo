import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

// Dozwolone kategorie dokumentów
const ALLOWED_CATS = new Set(['hr','kariera','biznes','najem','sprzedaz','inne']);

// Wymagane plany per kategoria (serwer-side)
const CAT_REQUIRED_PLANS = {
  hr:       ['kariera','biznes','promax'],
  kariera:  ['kariera','biznes','promax','start'],
  biznes:   ['biznes','promax'],
  najem:    ['kariera','biznes','promax'],
  sprzedaz: ['kariera','biznes','promax'],
  inne:     ['kariera','biznes','promax'],
};

const RATE_LIMIT = 25;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function getIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',');
  return (req.headers['x-real-ip'] || fwd[fwd.length - 1] || req.socket?.remoteAddress || 'unknown')
    .trim().replace(/[^a-zA-Z0-9._:-]/g, '_').substring(0, 64);
}

async function checkSubscription(uid) {
  const snap = await db.collection('users').doc(uid)
    .collection('subscription').doc('current').get();
  if (!snap.exists) return null;
  const data = snap.data();
  const expiresAt = data.expiresAt?.toDate?.();
  if (!expiresAt || expiresAt <= new Date()) return null;
  return data;
}

async function checkRateLimit(uid) {
  const windowStart = Timestamp.fromMillis(Date.now() - RATE_WINDOW_MS);
  const snap = await db.collection('users').doc(uid)
    .collection('usage').where('ts', '>=', windowStart).count().get();
  return snap.data().count;
}

async function reserveUsage(uid) {
  const ref = await db.collection('users').doc(uid).collection('usage').add({ ts: Timestamp.now() });
  return () => ref.delete().catch(() => {});
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt, url, docId, docName, docCat, docIcon, docCatLabel, type: freeType } = req.body;

  // ── CV i list motywacyjny — zawsze wymaga subskrypcji ──
  if (freeType === 'cv' || freeType === 'letter') {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Wymagane logowanie' });
    let uid;
    try { const decoded = await auth.verifyIdToken(token); uid = decoded.uid; }
    catch { return res.status(401).json({ error: 'Nieprawidłowy token' }); }
    if (!prompt || typeof prompt !== 'string' || prompt.length > 15000)
      return res.status(400).json({ error: 'Brak lub zbyt długie zapytanie' });
    try {
      const sub = await checkSubscription(uid);
      if (!sub || !['kariera','biznes','promax','start'].includes(sub.plan))
        return res.status(403).json({ error: 'subscription_required' });
    } catch(e) {
      return res.status(503).json({ error: 'Chwilowy problem z serwerem.' });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Brak klucza API' });
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000,
          system: 'Piszesz wyłącznie po polsku. Zero markdown, zero gwiazdek, zero emoji.',
          messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(30000)
      });
      const data = await r.json();
      if (data.error) return res.status(500).json({ error: data.error.message });
      const text = data.content?.[0]?.text || '';
      if (!text) return res.status(500).json({ error: 'Pusta odpowiedź AI' });
      return res.status(200).json({ text });
    } catch(e) {
      return res.status(500).json({ error: e.name === 'TimeoutError' ? 'Przekroczono czas — spróbuj ponownie.' : e.message });
    }
  }

  // ── 1. Wymagane uwierzytelnienie ──
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Wymagane logowanie' });

  let uid;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Nieprawidłowy token' });
  }

  // ── 2. Walidacja kategorii ──
  const cat = docCat || 'inne';
  if (!ALLOWED_CATS.has(cat)) {
    return res.status(400).json({ error: 'Niedozwolona kategoria dokumentu' });
  }

  // ── 3. Subskrypcja lub darmowy slot per IP (1 na zawsze) ──
  let isFree = false;
  try {
    const sub = await checkSubscription(uid);
    if (!sub) {
      // Brak subskrypcji — sprawdź jednorazowy darmowy slot per IP
      const ip = getIp(req);
      const freeRef = db.collection('freeDocUsage').doc(ip);
      const freeSnap = await freeRef.get();
      if (freeSnap.exists) {
        return res.status(403).json({ error: 'free_used' });
      }
      await freeRef.set({ usedAt: Timestamp.now(), uid });
      isFree = true;
    } else {
      const requiredPlans = CAT_REQUIRED_PLANS[cat] || ['kariera','biznes','promax'];
      if (!requiredPlans.includes(sub.plan)) {
        return res.status(403).json({ error: 'Twój pakiet nie obejmuje tej kategorii dokumentów' });
      }
    }
  } catch(e) {
    console.error('Subscription check error:', e.message);
    return res.status(500).json({ error: 'Błąd weryfikacji subskrypcji' });
  }

  // ── 4. Rate limiting (tylko dla subskrybentów) ──
  let rollbackUsage = null;
  if (!isFree) {
    try {
      const count = await checkRateLimit(uid);
      if (count >= RATE_LIMIT) {
        return res.status(429).json({ error: 'Przekroczono limit generowania dokumentów (25/godz.). Spróbuj za chwilę.' });
      }
      rollbackUsage = await reserveUsage(uid);
    } catch(e) {
      console.error('Rate limit check error:', e.message);
      return res.status(503).json({ error: 'Chwilowy problem z serwerem. Spróbuj ponownie.' });
    }
  }

  // ── Tryb pobierania URL ──
  if (url) {
    if (rollbackUsage) { rollbackUsage(); rollbackUsage = null; }
    try { new URL(url); } catch { return res.status(400).json({ error: 'Nieprawidłowy URL' }); }
    const parsedUrl = new URL(url);
    if (!/^https?:$/.test(parsedUrl.protocol)) return res.status(400).json({ error: 'Niedozwolony protokół URL' });
    const BLOCKED_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|0\.0\.0\.0|metadata\.)/;
    if (BLOCKED_HOST.test(parsedUrl.hostname.toLowerCase())) return res.status(400).json({ error: 'Niedozwolony adres URL' });
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Dokumo/1.0)', 'Accept': 'text/html', 'Accept-Language': 'pl,en;q=0.9' },
        redirect: 'manual', signal: AbortSignal.timeout(8000)
      });
      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get('location') || '';
        let destUrl; try { destUrl = new URL(location, url); } catch { return res.status(422).json({ error: 'Nieprawidłowy redirect' }); }
        if (destUrl.hostname.toLowerCase() !== parsedUrl.hostname.toLowerCase()) {
          return res.status(422).json({ error: 'Redirect do innej domeny — niedozwolone' });
        }
        const r2 = await fetch(destUrl.href, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Dokumo/1.0)', 'Accept': 'text/html', 'Accept-Language': 'pl,en;q=0.9' },
          redirect: 'manual', signal: AbortSignal.timeout(8000)
        });
        if (!r2.ok) return res.status(422).json({ error: 'Strona niedostępna (' + r2.status + ')' });
        const html2 = await r2.text();
        const text2 = html2.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
          .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
          .replace(/\s{2,}/g,' ').trim().substring(0,12000);
        if (text2.length < 100) return res.status(422).json({ error: 'Nie udało się pobrać treści strony' });
        return res.status(200).json({ text: text2 });
      }
      if (!r.ok) return res.status(422).json({ error: 'Strona niedostępna (' + r.status + ')' });
      const html = await r.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ').trim().substring(0, 12000);
      if (text.length < 100) return res.status(422).json({ error: 'Nie udało się pobrać treści ogłoszenia' });
      return res.status(200).json({ text });
    } catch(err) {
      const msg = err.name === 'TimeoutError' ? 'Przekroczono czas pobierania strony' : 'Nie udało się pobrać treści ogłoszenia';
      return res.status(422).json({ error: msg });
    }
  }

  if (!prompt) return res.status(400).json({ error: 'Brak zapytania' });
  if (typeof prompt !== 'string' || prompt.length > 20000) return res.status(400).json({ error: 'Zapytanie zbyt długie' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Brak klucza ANTHROPIC_API_KEY' });

  const safeSystemPrompt = 'Piszesz wyłącznie po polsku. Przestrzegaj polskiej interpunkcji i ortografii. Zero markdown, zero gwiazdek, zero emoji, chyba że instrukcja wyraźnie nakazuje inaczej.';

  try {
    const r = await fetch(
      'https://api.anthropic.com/v1/messages',
      { method:'POST', headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
        body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:8000, system: safeSystemPrompt, messages:[{role:'user',content:prompt}] }),
        signal: AbortSignal.timeout(57000) }
    );
    const data = await r.json();
    if (data.error) {
      if (rollbackUsage) rollbackUsage();
      return res.status(500).json({ error: data.error.message });
    }
    const text = data.content?.[0]?.text || '';
    if (!text) {
      if (rollbackUsage) rollbackUsage();
      return res.status(500).json({ error: 'Pusta odpowiedź AI' });
    }

    // Zapisz dokument do Firestore (tylko dla subskrybentów — darmowi mogą nie mieć dashboardu)
    if (!isFree) {
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
    }

    return res.status(200).json({ text });
  } catch(e) {
    if (rollbackUsage) rollbackUsage();
    const msg = e.name === 'TimeoutError' || e.message?.includes('aborted')
      ? 'Generowanie trwa zbyt długo — spróbuj ponownie za chwilę.'
      : e.message;
    return res.status(500).json({ error: msg });
  }
}
