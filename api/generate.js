import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { hasSensitivePII } from '../lib/pii.js';
import { bump } from '../lib/analytics.js';
import { maPrawaNabyte } from '../lib/plany.js';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

// Dozwolone kategorie dokumentów
const ALLOWED_CATS = new Set(['hr','kariera','biznes','najem','sprzedaz','inne']);

// Wymagane plany per kategoria (egzekwowane po stronie serwera).
// Start nie jest już najtańszą furtką do całego katalogu — daje wyłącznie
// dokumenty osobiste i pracownicze. Kariera i Biznes są równoległe, nie
// zagnieżdżone: Kariera nie ma dokumentów sklepowych, Biznes nie ma CV ani
// listu motywacyjnego. Pro Max jako jedyny łączy oba światy.
const CAT_REQUIRED_PLANS = {
  kariera:  ['start', 'kariera', 'promax'],              // CV, list, wypowiedzenie, urlop, świadectwo
  hr:       ['kariera', 'biznes', 'promax'],             // umowy: o pracę, zlecenie, dzieło, B2B, NDA
  najem:    ['kariera', 'biznes', 'promax'],
  sprzedaz: ['kariera', 'biznes', 'promax'],
  inne:     ['kariera', 'biznes', 'promax'],             // pełnomocnictwo, wezwanie do zapłaty
  biznes:   ['biznes', 'promax'],                        // sklep, faktury, biznesplan, SWOT, wspólnicy
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

// Miesięczny limit generowań dokumentów wg planu (Start ma osobny model — pula 5 pobrań).
const GEN_LIMITS = { kariera: 30, biznes: 30, promax: 100 };

// Atomowa rezerwacja jednego generowania w bieżącym miesiącu kalendarzowym.
// Zwraca { ok:true, rollback } albo { ok:false } gdy limit wyczerpany.
async function reserveMonthlyGen(uid, limit) {
  const ref = db.collection('genUsage').doc(uid);
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  try {
    const reserved = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const count = data.month === month ? (data.count || 0) : 0;
      if (count >= limit) return false;
      tx.set(ref, { month, count: count + 1, updatedAt: Timestamp.now() }, { merge: true });
      return true;
    });
    if (!reserved) return { ok: false };
    return {
      ok: true,
      rollback: () => db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data().month !== month) return;
        const count = Math.max(0, (snap.data().count || 0) - 1);
        tx.set(ref, { count }, { merge: true });
      }).catch(() => {}),
    };
  } catch {
    return { ok: true, rollback: () => {} }; // fail-open na błędach Firestore
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt, url, docId, docName, docCat, docIcon, docCatLabel, type: freeType, systemPrompt, continueFrom } = req.body;

  // ── CV i list motywacyjny — zawsze wymaga subskrypcji + rate limit 20/hr per uid ──
  if (freeType === 'cv' || freeType === 'letter') {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Wymagane logowanie' });
    let uid;
    try { const decoded = await auth.verifyIdToken(token); uid = decoded.uid; }
    catch { return res.status(401).json({ error: 'Nieprawidłowy token' }); }
    if (!prompt || typeof prompt !== 'string' || prompt.length > 15000)
      return res.status(400).json({ error: 'Brak lub zbyt długie zapytanie' });
    let cvPlan = null;
    try {
      const sub = await checkSubscription(uid);
      // CV i list motywacyjny to dokumenty Kariery (Biznes ich nie obejmuje)
      if (!sub || !['kariera','promax','start'].includes(sub.plan)) {
        bump(db, 'paywall_hit', { source: freeType === 'cv' ? 'cv' : 'letter' });
        return res.status(403).json({ error: 'subscription_required' });
      }
      cvPlan = sub.plan;
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
    // Miesięczny limit generowań wg planu (Start pomija — ma model 1 pobrania)
    let rollbackGen = null;
    if (GEN_LIMITS[cvPlan]) {
      const g = await reserveMonthlyGen(uid, GEN_LIMITS[cvPlan]);
      if (!g.ok) {
        if (rollbackAi) rollbackAi();
        bump(db, 'paywall_hit', { source: 'gen_limit' });
        return res.status(403).json({ error: 'gen_limit', limit: GEN_LIMITS[cvPlan] });
      }
      rollbackGen = g.rollback;
    }
    const releaseCv = () => { if (rollbackAi) rollbackAi(); if (rollbackGen) { rollbackGen(); rollbackGen = null; } };
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { releaseCv(); return res.status(500).json({ error: 'Brak klucza API' }); }
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
        releaseCv();
        return res.status(500).json({ error: data.error.message });
      }
      const text = data.content?.[0]?.text || '';
      if (!text) {
        releaseCv();
        return res.status(500).json({ error: 'Pusta odpowiedź AI' });
      }
      bump(db, 'generate', { type: freeType });
      return res.status(200).json({ text });
    } catch(e) {
      releaseCv();
      return res.status(500).json({ error: e.name === 'TimeoutError' ? 'Przekroczono czas — spróbuj ponownie.' : e.message });
    }
  }

  // ── Analiza umowy — wymaga logowania i aktywnej subskrypcji ──
  if (freeType === 'analyze-contract') {
    const { contractText } = req.body;
    if (!contractText || typeof contractText !== 'string' || contractText.trim().length < 80)
      return res.status(400).json({ error: 'Tekst umowy jest zbyt krótki lub pusty' });

    const contractToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!contractToken) return res.status(401).json({ error: 'Wymagane logowanie' });
    let contractUid;
    try { contractUid = (await auth.verifyIdToken(contractToken)).uid; }
    catch { return res.status(401).json({ error: 'Nieprawidłowy token' }); }

    try {
      const sub = await checkSubscription(contractUid);
      if (!sub || !['kariera','biznes','promax','start'].includes(sub.plan)) {
        bump(db, 'paywall_hit', { source: 'contract' });
        return res.status(403).json({ error: 'contract_sub_required' });
      }
    } catch(e) {
      return res.status(503).json({ error: 'Chwilowy problem z serwerem.' });
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

NAJPIERW ustal typ umowy i dobierz kryteria WYŁĄCZNIE właściwe dla tego typu:
- umowa o pracę: elementy art. 29 §1 KP, min. wynagrodzenie 4806 zł brutto (2026), okres wypowiedzenia wg art. 36 KP;
- umowa zlecenie/o świadczenie usług: min. stawka godzinowa 31,40 zł (2026), ewidencja godzin, wypowiedzenie art. 746 KC;
- umowa B2B: znamiona stosunku pracy (art. 22 §1 KP — podporządkowanie, sztywne godziny), NIP stron, termin płatności;
- umowa o dzieło: rezultat (art. 627 KC), odbiór, prawa autorskie i pola eksploatacji;
- sprzedaż/najem/NDA/inne: kryteria właściwe danej instytucji KC.
NIE stosuj wymogów Kodeksu pracy do umów cywilnoprawnych i odwrotnie.

Sprawdź zawsze: kompletność danych stron, elementy obowiązkowe (data, przedmiot, wynagrodzenie/cena), klauzule rażąco jednostronne lub niedozwolone, zasady zakończenia umowy, poufność/konkurencję jeśli występują.

Zasady oceny:
- severity="critical": poważny błąd prawny lub brakujący obowiązkowy element
- severity="warning": klauzula niekorzystna lub wymagająca doprecyzowania
- severity="ok": element poprawny (maksymalnie 3-4 takie)

RUBRYKA score (stosuj dokładnie): zacznij od 100; odejmij 20 za każdy issue "critical" i 7 za każdy "warning"; wynik ogranicz do przedziału 5-98. Dzięki temu ta sama umowa zawsze dostaje tę samą ocenę.

W polu "legal" podawaj wyłącznie artykuły, których jesteś pewien — jeśli nie masz pewności, wpisz null. Zwróć od 6 do 10 issues. Pisz po polsku. Bądź konkretny i praktyczny.

UMOWA DO ANALIZY:
${truncated}`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          // Analiza prawna umowy — płatna funkcja o wysokiej stawce błędu; mocniejszy model
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 6000,
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

  // ── Analiza/poprawa CV (popraw-cv.html) — DARMOWA, bez subskrypcji ──
  // Narzędzie lead-generacyjne: sama analiza jest bezpłatna (płatność dopiero
  // za pobranie poprawionego CV w kreatorze). Działa też bez konta.
  // Ochrona przed nadużyciem: limit 3/godz. per uid (gdy zalogowany) lub per IP.
  if (freeType === 'analyze-cv') {
    if (!prompt || typeof prompt !== 'string' || prompt.length > 15000)
      return res.status(400).json({ error: 'Brak lub zbyt długie zapytanie' });

    // Rozpoznaj usera opcjonalnie — sam token nie jest wymagany
    const cvToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    let limiterKey = null;
    if (cvToken) {
      try { limiterKey = (await auth.verifyIdToken(cvToken)).uid; } catch { limiterKey = null; }
    }
    if (!limiterKey) limiterKey = 'ip_' + getIpPrefix(req);

    let rollbackAi = null;
    try {
      rollbackAi = await tryReserveSlot(limiterKey, 'cvAnalyze', 3);
      if (!rollbackAi) return res.status(429).json({ error: 'Przekroczono limit analiz CV (3/godz.). Spróbuj później.' });
    } catch { /* fail-open na błędach Firestore */ }

    const cvApiKey = process.env.ANTHROPIC_API_KEY;
    if (!cvApiKey) { if (rollbackAi) rollbackAi(); return res.status(500).json({ error: 'Brak klucza API' }); }
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': cvApiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000,
          system: 'Piszesz wyłącznie po polsku. Zwracasz wyłącznie poprawny JSON, bez markdown i bez backticks.',
          messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(30000)
      });
      const data = await r.json();
      if (data.error) { if (rollbackAi) rollbackAi(); return res.status(500).json({ error: data.error.message }); }
      const text = data.content?.[0]?.text || '';
      if (!text) { if (rollbackAi) rollbackAi(); return res.status(500).json({ error: 'Pusta odpowiedź AI' }); }
      bump(db, 'generate', { type: 'analyze-cv' });
      return res.status(200).json({ text });
    } catch(e) {
      if (rollbackAi) rollbackAi();
      return res.status(500).json({ error: e.name === 'TimeoutError' ? 'Przekroczono czas — spróbuj ponownie.' : e.message });
    }
  }

  // ── PODGLĄD (preview) — tani, krótki, REALNY fragment dokumentu ──
  // Zalogowany user bez subskrypcji dostaje wstęp (nagłówek + §1-§2) wygenerowany
  // przez AI na niskim max_tokens. Dalsze paragrafy NIE są generowane, a serwer
  // dodatkowo twardo obcina wszystko od §3 w górę — pełny dokument (deliverable)
  // fizycznie nie opuszcza serwera, więc nie ma czego skopiować. Bez zapisu,
  // bez limitu generowań, z rate-limitem chroniącym przed spamem.
  if (req.body.preview === true) {
    const pToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!pToken) return res.status(401).json({ error: 'Wymagane logowanie' });
    let pUid;
    try { pUid = (await auth.verifyIdToken(pToken)).uid; }
    catch { return res.status(401).json({ error: 'Nieprawidłowy token' }); }
    if (!prompt || typeof prompt !== 'string' || prompt.length > 20000)
      return res.status(400).json({ error: 'Brak lub zbyt długie zapytanie' });
    let pRollback = null;
    try {
      pRollback = await tryReserveSlot(pUid, 'preview', 8); // 8 podglądów / godz. / uid
      if (!pRollback) return res.status(429).json({ error: 'Za dużo podglądów — spróbuj za chwilę.' });
    } catch { /* fail-open na błędach Firestore */ }
    const pApiKey = process.env.ANTHROPIC_API_KEY;
    if (!pApiKey) { if (pRollback) pRollback(); return res.status(500).json({ error: 'Brak klucza API' }); }
    const pSafe = 'Piszesz wyłącznie po polsku. Zero markdown, zero gwiazdek, zero emoji.';
    const pClient = (typeof systemPrompt === 'string' && systemPrompt.trim()) ? systemPrompt.trim().slice(0, 8000) : '';
    const pSystem = pClient ? (pClient + '\n\n' + pSafe) : pSafe;
    const pInstruction = '\n\nTRYB PODGLĄDU (instrukcja nadrzędna): To krótki podgląd, NIE finalny dokument. ZIGNORUJ regułę o missing_fields — NIGDY nie zwracaj JSON ani informacji o brakujących danych. Wygeneruj WYŁĄCZNIE nagłówek dokumentu oraz paragrafy §1 i §2 w gotowej formie; każdą brakującą daną zastąp wykropkowaniem "…………………". Po §2 ZAKOŃCZ — nie generuj §3 ani dalszych paragrafów, nie dodawaj podpisów ani komentarzy.';
    try {
      const pr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': pApiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, system: pSystem, messages: [{ role: 'user', content: prompt + pInstruction }] }),
        signal: AbortSignal.timeout(25000)
      });
      const pData = await pr.json();
      if (pData.error) { if (pRollback) pRollback(); return res.status(500).json({ error: pData.error.message }); }
      let pText = pData.content?.[0]?.text || '';
      if (!pText) { if (pRollback) pRollback(); return res.status(500).json({ error: 'Pusta odpowiedź AI' }); }
      // Gdyby model mimo instrukcji zwrócił JSON missing_fields — nie wysyłaj śmieci;
      // zwolnij slot i zwróć puste, by klient pokazał podgląd strukturalny.
      if (/["']?error["']?\s*:\s*["']?missing_fields/i.test(pText)) {
        if (pRollback) pRollback();
        return res.status(200).json({ preview: true, text: '' });
      }
      // Twardy backstop serwerowy: gdyby model zignorował instrukcję i poszedł dalej,
      // obetnij wszystko od §3 (deliverable nie może wyjść do niepłacącego klienta).
      const cut = pText.search(/§\s*3\b|§3|Paragraf\s*3|Artyku[łl]\s*3/i);
      if (cut > 60) pText = pText.slice(0, cut).trim();
      return res.status(200).json({ preview: true, text: pText });
    } catch (e) {
      if (pRollback) pRollback();
      return res.status(500).json({ error: e.name === 'TimeoutError' ? 'Podgląd trwał zbyt długo.' : e.message });
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

  // ── 3. Wymagana aktywna subskrypcja — każdy dokument jest płatny ──
  const isFree = false; // brak darmowego slotu; utrzymane dla zgodności downstream
  let subPlan = null;
  try {
    const sub = await checkSubscription(uid);
    if (!sub) {
      bump(db, 'paywall_hit', { source: 'no_sub' });
      return res.status(403).json({ error: 'subscription_required' });
    }
    const requiredPlans = CAT_REQUIRED_PLANS[cat] || ['kariera', 'biznes', 'promax'];
    // Start kupiony przed 4.09.2026 obejmował cały katalog — zakres opłacony
    // wcześniej zostaje do końca ważności pakietu (lib/plany.js).
    if (!requiredPlans.includes(sub.plan) && !maPrawaNabyte(sub)) {
      bump(db, 'paywall_hit', { source: 'plan_mismatch' });
      return res.status(403).json({ error: 'Twój pakiet nie obejmuje tej kategorii dokumentów' });
    }
    // Start plan — serwer-side enforcement limitu 1 pobrania
    if (sub.plan === 'start' && (sub.downloadsLeft ?? 0) <= 0) {
      bump(db, 'paywall_hit', { source: 'start_limit' });
      return res.status(403).json({ error: 'start_limit' });
    }
    subPlan = sub.plan;
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
    // Filtr po nazwie hosta nie chronił przed nazwą DNS wskazującą na adres
    // wewnętrzny — teraz rozwiązujemy nazwę i sprawdzamy adresy (lib/ssrf.js).
    const { urlDoPobrania } = await import('../lib/ssrf.js');
    const spr = await urlDoPobrania(url);
    if (!spr.ok) return res.status(400).json({ error: spr.powod });
    const parsedUrl = spr.url;
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
        const sprRedirect = await urlDoPobrania(destUrl.href);
        if (!sprRedirect.ok) return res.status(400).json({ error: sprRedirect.powod });
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

  if (!prompt) { if (rollbackUsage) rollbackUsage(); return res.status(400).json({ error: 'Brak zapytania' }); }
  if (typeof prompt !== 'string' || prompt.length > 20000) { if (rollbackUsage) rollbackUsage(); return res.status(400).json({ error: 'Zapytanie zbyt długie' }); }

  // ── Miesięczny limit generowań wg planu (Start pomija — model 1 pobrania) ──
  if (GEN_LIMITS[subPlan]) {
    const g = await reserveMonthlyGen(uid, GEN_LIMITS[subPlan]);
    if (!g.ok) {
      if (rollbackUsage) rollbackUsage();
      bump(db, 'paywall_hit', { source: 'gen_limit' });
      return res.status(403).json({ error: 'gen_limit', limit: GEN_LIMITS[subPlan] });
    }
    // Dopnij rollback generowania do istniejącego rollbacku rate-limitu.
    const _rb = rollbackUsage;
    rollbackUsage = () => { if (_rb) _rb(); g.rollback(); };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { if (rollbackUsage) rollbackUsage(); return res.status(500).json({ error: 'Brak klucza ANTHROPIC_API_KEY' }); }

  const safeSystemPrompt = [
    'Piszesz wyłącznie po polsku. Przestrzegaj polskiej interpunkcji i ortografii. Zero markdown, zero gwiazdek, zero emoji, chyba że instrukcja wyraźnie nakazuje inaczej.',
    'DANE, KTÓRYCH NIE PODANO: nigdy ich nie wymyślaj. Jeśli w danych wejściowych występuje token „[brak]" lub pole jest puste, a dokument wymaga tej informacji do ważności — zwróć JSON missing_fields zgodnie z instrukcją. Dla danych drugorzędnych (miejscowość, numer rachunku, adres sądu) pozostaw w dokumencie pole do ręcznego uzupełnienia w postaci wykropkowania: „…………………………". Nigdy nie przepisuj tokenu „[brak]" do treści dokumentu.',
    'NAGŁÓWEK: jeśli nie podano miejscowości lub daty zawarcia, użyj formy „…………………, dnia ………………… r." — to standard wzorów do ręcznego uzupełnienia, nie placeholder.',
    'KWOTY: każdą kwotę pieniężną zapisuj cyfrowo i słownie, np. 5 000,00 zł (słownie: pięć tysięcy złotych 00/100).',
    'Cytuj wyłącznie przepisy, których jesteś pewien; nie wymyślaj numerów artykułów.',
  ].join('\n');

  // System prompt generatora (zasady prawne + jakościowe) budowany po stronie klienta.
  // Łączymy: najpierw szczegółowe zasady dokumentu, na końcu twarde guardraile serwera
  // (język/format/dane), których klient nie może nadpisać. Limit długości chroni przed nadużyciem.
  const clientSystem = (typeof systemPrompt === 'string' && systemPrompt.trim())
    ? systemPrompt.trim().slice(0, 8000)
    : '';
  const combinedSystem = clientSystem ? (clientSystem + '\n\n' + safeSystemPrompt) : safeSystemPrompt;

  // Tryb kontynuacji: user widział podgląd (§1-§2), zapłacił i wraca do dokumentu.
  // Zamiast generować od zera, doklejamy zapisany początek i każemy AI dokończyć
  // od §3 — zachowana spójność z tym, co user już widział, i mniej tokenów.
  const contRaw = (typeof continueFrom === 'string' && continueFrom.trim().length > 30)
    ? continueFrom.trim() : '';
  // Do promptu podajemy OGON (ostatnie 6000 znaków) — model kontynuuje od realnego
  // końca, nawet przy długim dokumencie. Pełny początek (contRaw) doklejamy sami
  // przy zapisie, więc historia zawiera kompletny dokument, nie tylko dogenerowany ogon.
  const cont = contRaw ? contRaw.slice(-6000) : '';
  let effPrompt = cont
    ? (prompt + '\n\nMASZ JUŻ GOTOWY POCZĄTEK TEGO DOKUMENTU:\n"""\n' + cont + '\n"""\nKontynuuj DOKŁADNIE TEN SAM dokument OD MIEJSCA, W KTÓRYM URWAŁ SIĘ POWYŻSZY TEKST, aż do końca (z podpisami). Zachowaj spójność, styl, numerację paragrafów i dane. NIE powtarzaj już napisanych fragmentów — kontynuuj od następnego zdania lub paragrafu.')
    : prompt;

  // ── Wyliczenia pieniężne robimy PO STRONIE SERWERA ──
  // Model nie ma dostępu do kursów NBP ani do tabeli stawek odsetek, więc
  // proszony o przeliczenie potrafi podać kwotę zmyśloną — w piśmie
  // windykacyjnym to poważny błąd. Liczymy dokładnie i podajemy gotowy wynik,
  // z zakazem samodzielnego przeliczania.
  if (req.body?.wyliczenia && typeof req.body.wyliczenia === 'object') {
    try {
      const w = req.body.wyliczenia;
      const kwota = Number(w.kwota);
      const termin = String(w.terminPlatnosci || '').slice(0, 10);
      if (kwota > 0 && /^\d{4}-\d{2}-\d{2}$/.test(termin)) {
        const { obliczOdsetki, rekompensata } = await import('../lib/windykacja.js');
        const dzis = new Date().toISOString().slice(0, 10);
        const odDnia = new Date(Date.parse(termin + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
        const rodzaj = w.rodzaj === 'cywilne' ? 'cywilne' : 'handlowe';
        const ods = obliczOdsetki(kwota, odDnia, dzis, rodzaj);
        // Kwoty podajemy w zapisie polskim, żeby model przepisał je 1:1 do pisma
        // zamiast przeformatowywać (a przy okazji gubić grosze).
        const zl = n => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d),)/g, ' ') + ' zł';
        // pozycje mają zakres [od, do) — do pisma podajemy dzień poprzedzający,
        // inaczej okresy zachodziłyby na siebie o jeden dzień.
        const dzienWczesniej = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
        const linie = ['\n\nWYLICZENIA — użyj DOKŁADNIE tych kwot i dat, NIE przeliczaj ich samodzielnie:'];
        if (ods.ok) {
          linie.push(`Należność główna: ${zl(ods.kwotaGlowna)}.`);
          linie.push(`Odsetki za opóźnienie naliczone od ${odDnia} do ${dzienWczesniej(dzis)} włącznie (${ods.dniOpoznienia} dni): ${zl(ods.odsetki)}.`);
          linie.push('Rozbicie na okresy obowiązywania stawek:');
          ods.pozycje.forEach(p => linie.push(`  ${p.od} – ${dzienWczesniej(p.do)}: stawka ${String(p.proc).replace('.', ',')}%, ${p.dni} dni, ${zl(p.kwota)}.`));
          linie.push(`Podstawa odsetek: ${ods.podstawa}.`);
        }
        if (rodzaj === 'handlowe') {
          const rek = await rekompensata(kwota, termin);
          if (rek.pln != null) {
            linie.push(`Rekompensata za koszty odzyskiwania należności (art. 10 ust. 1 ustawy o przeciwdziałaniu nadmiernym opóźnieniom): ${rek.eur} EUR, co po średnim kursie NBP z dnia ${rek.kursData} (${String(rek.kurs).replace('.', ',')} zł/EUR) daje ${zl(rek.pln)}.`);
            if (ods.ok) linie.push(`ŁĄCZNIE do zapłaty: ${zl(ods.razem + rek.pln)}.`);
          } else {
            // Kurs niedostępny — lepiej podać samo EUR niż pozwolić modelowi zgadywać.
            linie.push(`Rekompensata: ${rek.eur} EUR. Kursu NBP nie udało się pobrać — podaj kwotę wyłącznie w euro i dodaj, że przeliczenia dokonuje się po średnim kursie NBP z ostatniego dnia roboczego miesiąca poprzedzającego miesiąc wymagalności. NIE podawaj kwoty w złotych.`);
          }
        }
        if (linie.length > 1) effPrompt += linie.join('\n');
      }
    } catch (e) { console.error('Wyliczenia windykacyjne:', e.message); }
  }

  // Zapis wygenerowanego dokumentu do historii (PII → pomijamy). Zwraca piiDetected.
  async function persistDoc(fullText){
    const piiDetected = hasSensitivePII(fullText);
    try {
      if (!piiDetected) {
        const ref = db.collection('users').doc(uid).collection('documents').doc();
        await ref.set({ id: ref.id, typeId: docId || 'unknown', name: docName || 'Dokument',
          text: fullText, cat, icon: docIcon || '📄', catLabel: docCatLabel || 'Inne',
          status: 'generated', isFree: isFree || false, createdAt: new Date(), updatedAt: new Date() });
      } else { console.log('PII detected — skipping Firestore save for uid', uid.slice(0,8)); }
    } catch(e){ console.error('Firestore save error:', e.message); }
    sendFirstDocEmail(uid, docName || 'Dokument', cat).catch(e => console.error('First-doc email:', e.message));
    return piiDetected;
  }

  // ── Streaming: dokument leci na żywo. Gdy strumień urwie się (limit tokenów
  // lub timeout Vercela), klient ma już to, co przyszło + sygnał incomplete
  // i może kliknąć „Dokończ dokument" (kontynuacja przez continueFrom). ──
  if (req.body.stream === true) {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    const send = (o) => { try { res.write(JSON.stringify(o) + '\n'); } catch(e){} };
    let full = '', stopReason = null;
    try {
      const sr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 8000, system: combinedSystem, messages: [{ role: 'user', content: effPrompt }], stream: true }),
        signal: AbortSignal.timeout(55000)
      });
      if (!sr.ok) { if (rollbackUsage) rollbackUsage(); send({ t: 'done', incomplete: true, error: 'HTTP ' + sr.status }); return res.end(); }
      let buf = ''; const dec = new TextDecoder();
      for await (const chunk of sr.body) {
        buf += dec.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let ev; try { ev = JSON.parse(payload); } catch(e){ continue; }
          if (ev.type === 'content_block_delta' && ev.delta && typeof ev.delta.text === 'string') { full += ev.delta.text; send({ t: 'd', x: ev.delta.text }); }
          else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) { stopReason = ev.delta.stop_reason; }
          else if (ev.type === 'error') { if (rollbackUsage) rollbackUsage(); send({ t: 'done', incomplete: true, error: (ev.error && ev.error.message) || 'stream error' }); return res.end(); }
        }
      }
    } catch(e) {
      // timeout/abort — klient ma już 'full' (deltas), pokaże je + „Dokończ".
      // Nie liczymy tego jako pełne generowanie: user dokończy osobnym wywołaniem,
      // które policzy się raz. Zwracamy slot rate-limitu i miesięczny licznik.
      if (rollbackUsage) rollbackUsage();
      send({ t: 'done', incomplete: true, reason: e.name === 'TimeoutError' ? 'timeout' : 'error' });
      return res.end();
    }
    const incomplete = stopReason === 'max_tokens';
    // Zapisujemy każdy KOMPLETNY dokument. Przy kontynuacji (preview→pay→resume
    // albo „Dokończ" po timeoucie) serwer ma tylko dogenerowany ogon, więc sklejamy
    // pełny początek (contRaw) z ogonem — inaczej dokument nie trafiłby do historii.
    let pii = false;
    if (!incomplete) {
      const fullDoc = contRaw ? (contRaw.replace(/\s+$/, '') + '\n\n' + full.replace(/^\s+/, '')) : full;
      try { pii = await persistDoc(fullDoc); } catch(e){}
    } else if (rollbackUsage) {
      // Limit tokenów — dokument niedokończony. Zwracamy generowanie; policzy się
      // dopiero to, które faktycznie dokończy dokument (przycisk „Dokończ").
      rollbackUsage();
    }
    bump(db, 'generate', { type: docId || 'doc', tier: isFree ? 'free' : 'sub' });
    send({ t: 'done', incomplete, pii });
    return res.end();
  }

  try {
    const r = await fetch(
      'https://api.anthropic.com/v1/messages',
      { method:'POST', headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
        // Dokumenty prawne to rdzeń płatnego produktu — generuje je najmocniejszy
        // model (Sonnet), nie Haiku. Wolumen jest niski (limity 30-100/mies./user),
        // a koszt błędu w umowie wysoki.
        body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:8000, system: combinedSystem, messages:[{role:'user',content:effPrompt}] }),
        signal: AbortSignal.timeout(57000) }
    );
    const data = await r.json();
    if (data.error) {
      if (rollbackUsage) rollbackUsage();
      return res.status(500).json({ error: data.error.message });
    }
    let text = data.content?.[0]?.text || '';
    if (!text) {
      if (rollbackUsage) rollbackUsage();
      return res.status(500).json({ error: 'Pusta odpowiedź AI' });
    }
    // Sklej pełny zapisany początek z dogenerowaną resztą w jeden kompletny dokument.
    if (contRaw) text = contRaw.replace(/\s+$/, '') + '\n\n' + text.replace(/^\s+/, '');

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

    bump(db, 'generate', { type: docId || 'doc', tier: isFree ? 'free' : 'sub' });
    return res.status(200).json(piiDetected
      ? { text, skipped: true, reason: 'pii_detected', message: 'Dokument zawiera wrażliwe dane (PESEL, nr dowodu, paszportu lub karty płatniczej) — nie zapisano w Twoich dokumentach.' }
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
