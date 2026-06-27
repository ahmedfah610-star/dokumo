import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { hasSensitivePII } from '../lib/pii.js';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

// Dozwolone kategorie dokumentów
const ALLOWED_CATS = new Set(['hr','kariera','biznes','najem','sprzedaz','inne']);

// Wymagane plany per kategoria (serwer-side)
const CAT_REQUIRED_PLANS = {
  hr:       ['kariera','biznes','promax','start'],
  kariera:  ['kariera','biznes','promax','start'],
  biznes:   ['biznes','promax','start'],
  najem:    ['kariera','biznes','promax','start'],
  sprzedaz: ['kariera','biznes','promax','start'],
  inne:     ['kariera','biznes','promax','start'],
};

const RATE_LIMIT = 25;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function getIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',');
  return (req.headers['x-real-ip'] || fwd[fwd.length - 1] || req.socket?.remoteAddress || 'unknown')
    .trim().replace(/[^a-zA-Z0-9._:-]/g, '_').substring(0, 64);
}

// Prefix /24 dla IPv4 i /64 dla IPv6 — utrudnia rotację proxy do bypassowania limitów
function getIpPrefix(req) {
  const ip = getIp(req);
  const v4 = ip.match(/^(\d+\.\d+\.\d+)\.\d+/);
  if (v4) return 'v4_' + v4[1];
  const v6 = ip.match(/^([0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]+):/);
  if (v6) return 'v6_' + v6[1];
  return 'raw_' + ip;
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

// Atomowa rezerwacja slotu w sliding window (transakcja Firestore — bez race condition).
// Zwraca null jeśli limit przekroczony, lub funkcję rollback().
async function tryReserveSlot(uid, type, limit) {
  const ref = db.collection('users').doc(uid).collection('rateLimit').doc(type);
  const slotId = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const now = Date.now();
    const cutoff = now - RATE_WINDOW_MS;
    const arr = (doc.exists && Array.isArray(doc.data().slots)) ? doc.data().slots : [];
    const filtered = arr.filter(s => s && s.t > cutoff);
    if (filtered.length >= limit) return null;
    const id = `${now}-${Math.random().toString(36).slice(2, 10)}`;
    filtered.push({ id, t: now });
    tx.set(ref, { slots: filtered, updatedAt: Timestamp.now() }, { merge: true });
    return id;
  });
  if (!slotId) return null;
  return () => db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const slots = (doc.data().slots || []).filter(s => s && s.id !== slotId);
    tx.set(ref, { slots }, { merge: true });
  }).catch(() => {});
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt, url, docId, docName, docCat, docIcon, docCatLabel, type: freeType } = req.body;

  // ── CV i list motywacyjny — zawsze wymaga subskrypcji + rate limit 20/hr per uid ──
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
    // Rate limit: 20 wywołań AI per uid per godzinę — atomowa transakcja (bez TOCTOU)
    let rollbackAi = null;
    try {
      rollbackAi = await tryReserveSlot(uid, 'ai', 20);
      if (!rollbackAi) {
        return res.status(429).json({ error: 'Przekroczono limit AI (20/godz.). Spróbuj za chwilę.' });
      }
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
      if (data.error) {
        if (rollbackAi) rollbackAi();
        return res.status(500).json({ error: data.error.message });
      }
      const text = data.content?.[0]?.text || '';
      if (!text) {
        if (rollbackAi) rollbackAi();
        return res.status(500).json({ error: 'Pusta odpowiedź AI' });
      }
      return res.status(200).json({ text });
    } catch(e) {
      if (rollbackAi) rollbackAi();
      return res.status(500).json({ error: e.name === 'TimeoutError' ? 'Przekroczono czas — spróbuj ponownie.' : e.message });
    }
  }

  // ── Analiza umowy — 1 raz za darmo, potem wymaga pakietu ──
  if (freeType === 'analyze-contract') {
    const { contractText } = req.body;
    if (!contractText || typeof contractText !== 'string' || contractText.trim().length < 80)
      return res.status(400).json({ error: 'Tekst umowy jest zbyt krótki lub pusty' });

    // Opcjonalne sprawdzenie tokenu (użytkownik może być zalogowany)
    const contractToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    let contractUid = null;
    if (contractToken) {
      try { const decoded = await auth.verifyIdToken(contractToken); contractUid = decoded.uid; } catch {}
    }

    if (contractUid) {
      // Zalogowany — wymaga subskrypcji start lub wyższej
      try {
        const sub = await checkSubscription(contractUid);
        if (!sub || !['kariera','biznes','promax','start'].includes(sub.plan)) {
          return res.status(403).json({ error: 'contract_sub_required' });
        }
      } catch(e) {
        return res.status(503).json({ error: 'Chwilowy problem z serwerem.' });
      }
    } else {
      // Gość — jeden bezpłatny użytek per /24 IP (utrudnia rotację proxy)
      const ipKey = getIpPrefix(req);
      const freeRef = db.collection('freeContractUsage').doc(ipKey);
      try {
        await freeRef.create({ usedAt: Timestamp.now() });
      } catch(createErr) {
        if (createErr.code === 6) {
          return res.status(403).json({ error: 'contract_free_used' });
        }
        return res.status(503).json({ error: 'Chwilowy problem z serwerem.' });
      }
      // Globalny dzienny cap — chroni przed atakiem rozproszonym (rotacja proxy)
      const todayKey = new Date().toISOString().slice(0, 10);
      const globalRef = db.collection('globalLimits').doc('contract_free_' + todayKey);
      const allowed = await db.runTransaction(async (tx) => {
        const doc = await tx.get(globalRef);
        const count = doc.exists ? (doc.data().count || 0) : 0;
        if (count >= 300) return false;
        tx.set(globalRef, { count: count + 1, updatedAt: Timestamp.now() }, { merge: true });
        return true;
      }).catch(() => true); // przy błędzie transakcji — przepuść (fail-open)
      if (!allowed) {
        freeRef.delete().catch(() => {});
        return res.status(429).json({ error: 'Dzienny limit darmowych analiz wyczerpany. Załóż konto, aby kontynuować.' });
      }
    }

    const truncated = contractText.slice(0, 30000);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Brak klucza API' });

    const userPrompt = `Przeanalizuj poniższą polską umowę i zwróć wyniki jako JSON.

Zwróć TYLKO JSON, żadnego tekstu przed ani po. Format:
{
  "contractType": "nazwa typu umowy po polsku",
  "summary": "1-2 zdania podsumowania umowy",
  "score": liczba_od_0_do_100,
  "issues": [
    {
      "severity": "critical|warning|ok",
      "category": "Strony umowy|Wynagrodzenie|Czas trwania|Klauzule|Elementy formalne|Prawa stron",
      "title": "krótki tytuł",
      "description": "opis 2-3 zdania po polsku",
      "legal": "np. Art. 29 §1 KP lub null",
      "recommendation": "konkretna rekomendacja lub null jeśli severity=ok",
      "textRef": "dosłowny cytat (10-30 słów) z tekstu umowy którego dotyczy ten issue, lub null jeśli issue dotyczy brakującego elementu"
    }
  ]
}

Sprawdź następujące aspekty:
1. Kompletność danych stron (imię, adres, NIP/PESEL)
2. Wynagrodzenie (dla UoP: min. 4806 zł brutto 2026; min. stawka godz. 31,40 zł)
3. Elementy obowiązkowe (data zawarcia, zakres, czas trwania)
4. Klauzule niedozwolone lub rażąco jednostronne
5. Warunki i okres wypowiedzenia
6. Klauzule konkurencji lub poufności

Zasady oceny:
- severity="critical": poważny błąd prawny lub brakujący obowiązkowy element
- severity="warning": klauzula niekorzystna lub wymagająca doprecyzowania
- severity="ok": element poprawny (maksymalnie 3-4 takie)

Zwróć od 6 do 10 issues. Pisz po polsku. Bądź konkretny i praktyczny.

UMOWA DO ANALIZY:
${truncated}`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          system: 'Odpowiadasz wyłącznie poprawnym JSON bez żadnych dodatkowych komentarzy.',
          messages: [
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: '{' }
          ]
        }),
        signal: AbortSignal.timeout(55000)
      });
      const data = await r.json();
      if (data.error) return res.status(500).json({ error: data.error.message });
      const rawText = data.content?.[0]?.text || '';
      if (!rawText) return res.status(500).json({ error: 'Pusta odpowiedź AI' });

      let result;
      try {
        // Prefill powoduje że odpowiedź zaczyna się BEZ '{', więc dodajemy je z powrotem
        let cleaned = '{' + rawText;
        // Na wszelki wypadek: usuń otoczki markdown ```json ... ```
        cleaned = cleaned
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        // Wyodrębnij pierwszy kompletny obiekt JSON
        const match = cleaned.match(/\{[\s\S]*\}/);
        result = JSON.parse(match ? match[0] : cleaned);
        if (!Array.isArray(result.issues)) throw new Error('Brak issues');
      } catch(parseErr) {
        console.error('JSON parse error:', parseErr.message, '| raw snippet:', rawText.slice(0, 300));
        return res.status(500).json({ error: 'Błąd parsowania wyników — spróbuj ponownie' });
      }

      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({
        error: e.name === 'TimeoutError'
          ? 'Analiza trwała zbyt długo — spróbuj z krótszą umową.'
          : 'Błąd analizy: ' + e.message
      });
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
      // Brak subskrypcji — atomowe zajęcie jednorazowego slotu per IP
      // create() rzuca błąd ALREADY_EXISTS (kod 6) jeśli dokument istnieje — brak race condition
      const ip = getIp(req);
      const freeRef = db.collection('freeDocUsage').doc(ip);
      try {
        await freeRef.create({ usedAt: Timestamp.now(), uid, docName: docName || 'Dokument', docCat: cat });
        isFree = true;
      } catch(createErr) {
        // gRPC ALREADY_EXISTS = kod 6
        if (createErr.code === 6) {
          return res.status(403).json({ error: 'free_used' });
        }
        throw createErr;
      }
    } else {
      const requiredPlans = CAT_REQUIRED_PLANS[cat] || ['kariera','biznes','promax'];
      if (!requiredPlans.includes(sub.plan)) {
        return res.status(403).json({ error: 'Twój pakiet nie obejmuje tej kategorii dokumentów' });
      }
      // Start plan — serwer-side enforcement limitu 1 pobrania
      if (sub.plan === 'start' && (sub.downloadsLeft ?? 0) <= 0) {
        return res.status(403).json({ error: 'start_limit' });
      }
    }
  } catch(e) {
    console.error('Subscription check error:', e.message);
    return res.status(500).json({ error: 'Błąd weryfikacji subskrypcji' });
  }

  // ── 4. Rate limiting (tylko dla subskrybentów) — atomowa transakcja
  let rollbackUsage = null;
  if (!isFree) {
    try {
      rollbackUsage = await tryReserveSlot(uid, 'docs', RATE_LIMIT);
      if (!rollbackUsage) {
        return res.status(429).json({ error: 'Przekroczono limit generowania dokumentów (25/godz.). Spróbuj za chwilę.' });
      }
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

    // PII check — nie zapisujemy dokumentow z PESEL do Firestore (RODO).
    // User i tak otrzymuje wygenerowany text w response, tylko pomijamy persist.
    const piiDetected = hasSensitivePII(text);

    // Zapisz dokument do Firestore (subskrybenci + darmowi — żeby było widać co wygenerowano)
    try {
      if (piiDetected) {
        console.log('PII detected — skipping Firestore save for uid', uid.slice(0,8));
      } else {
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
          isFree: isFree || false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        // Dla darmowych — zaktualizuj freeDocUsage z odniesieniem do dokumentu
        if (isFree) {
          const ip = getIp(req);
          db.collection('freeDocUsage').doc(ip).update({ docRef: `users/${uid}/documents/${ref.id}`, docName: docName || 'Dokument' }).catch(() => {});
        }
      }
    } catch(e) {
      console.error('Firestore save error:', e.message);
    }

    // Email cross-sell po pierwszym wygenerowanym dokumencie (fire-and-forget)
    sendFirstDocEmail(uid, docName || 'Dokument', cat).catch(e => console.error('First-doc email:', e.message));

    return res.status(200).json(piiDetected
      ? { text, skipped: true, reason: 'pii_detected', message: 'Dokument zawiera wrażliwe dane (PESEL) — nie zapisano w Twoich dokumentach.' }
      : { text });
  } catch(e) {
    if (rollbackUsage) rollbackUsage();
    const msg = e.name === 'TimeoutError' || e.message?.includes('aborted')
      ? 'Generowanie trwa zbyt długo — spróbuj ponownie za chwilę.'
      : e.message;
    return res.status(500).json({ error: msg });
  }
}

// Powiązane dokumenty per kategoria
const RELATED = {
  hr:      [{ n: 'Umowa B2B', u: '/generator-umowy-b2b.html' }, { n: 'NDA — umowa o poufności', u: '/generator-nda.html' }, { n: 'Umowa o dzieło', u: '/generator-umowy-o-dzielo.html' }],
  najem:   [{ n: 'Protokół zdawczo-odbiorczy', u: '/protokol-zdawczo-odbiorczy.html' }, { n: 'Wypowiedzenie najmu', u: '/wypowiedzenie-najmu.html' }],
  biznes:  [{ n: 'Analiza SWOT', u: '/analiza-swot.html' }, { n: 'Umowa wspólników', u: '/umowa-wspolnikow.html' }, { n: 'Regulamin sklepu', u: '/generator-regulaminu-sklepu.html' }],
  kariera: [{ n: 'List motywacyjny', u: '/list-motywacyjny.html' }, { n: 'Popraw CV', u: '/popraw-cv.html' }, { n: 'Generator wypowiedzenia', u: '/generator-wypowiedzenia.html' }],
  sprzedaz:[{ n: 'Faktura', u: '/faktura.html' }, { n: 'Umowa B2B', u: '/generator-umowy-b2b.html' }],
  inne:    [{ n: 'Pełnomocnictwo', u: '/generator-pelnomocnictwa.html' }, { n: 'Wezwanie do zapłaty', u: '/wezwanie-do-zaplaty.html' }, { n: 'Analiza SWOT', u: '/analiza-swot.html' }],
};

async function sendFirstDocEmail(uid, docName, cat) {
  const metaRef = db.collection('userMeta').doc(uid);
  const metaSnap = await metaRef.get();
  if (!metaSnap.exists || metaSnap.data().firstDocSent) return;

  const email = metaSnap.data().email;
  if (!email) return;

  await metaRef.update({ firstDocSent: true });

  const related = (RELATED[cat] || RELATED.inne).slice(0, 3);
  const relatedRows = related.map(r =>
    `<tr><td style="padding:5px 0"><a href="https://dokumoflow.com${r.u}" style="color:#111;font-size:14px;font-weight:600;text-decoration:none">📄 ${r.n}</a></td></tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="max-width:560px;margin:40px auto;padding:0 16px">
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.07)">
    <div style="background:#111;padding:28px 32px;text-align:center">
      <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-.02em">Dokumo</span>
    </div>
    <div style="padding:36px 32px">
      <h1 style="font-size:21px;font-weight:800;color:#111;margin:0 0 10px;letter-spacing:-.02em">Twój dokument jest gotowy ✅</h1>
      <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 8px">
        Właśnie wygenerowałeś: <strong style="color:#111">${docName}</strong>.
      </p>
      <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 24px">
        Użytkownicy, którzy pobierali ten dokument, często potrzebowali też:
      </p>
      <div style="background:#f8f8f8;border-radius:14px;padding:20px 24px;margin-bottom:28px">
        <table style="width:100%;border-collapse:collapse">${relatedRows}</table>
      </div>
      <a href="https://dokumoflow.com" style="display:block;background:#111;color:#fff;text-align:center;padding:15px 24px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none">Wygeneruj kolejny dokument →</a>
      <p style="font-size:12px;color:#bbb;margin:28px 0 0;text-align:center">
        © 2026 Dokumo · <a href="https://dokumoflow.com" style="color:#bbb;text-decoration:none">dokumoflow.com</a>
      </p>
    </div>
  </div>
</div>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Dokumo <noreply@dokumoflow.com>',
      to: email,
      subject: `Twój dokument "${docName}" jest gotowy — co dalej?`,
      html,
    }),
  });
}
