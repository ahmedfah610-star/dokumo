import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { bump } from '../lib/analytics.js';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

// Zwiększamy limit body — załączniki (PDF/obraz) przychodzą jako base64.
// supportsResponseStreaming: odpowiedzi czatu płyną strumieniem (NDJSON).
export const config = {
  supportsResponseStreaming: true,
  api: { bodyParser: { sizeLimit: '8mb' } },
};

const FILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
// 3 MB — po zakodowaniu base64 (~4 MB) mieści się pod limitem ciała żądania Vercel (4.5 MB).
const FILE_MAX_BYTES = 3 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────
// Asystent Prawny Dokumo — AI chat o polskim prawie.
// Routing po action (query lub body).
//
// Actions:
//   POST  action=chat    → { message, chatId?, history? } → AI reply + acts + suggestions
//   GET   action=history → lista chatów zalogowanego użytkownika
//   DELETE action=clear  → usuń czat (requires auth)
//
// Rate limits (dzienne, reset o północy UTC):
//   Anonymous (IP): 5 zapytań/dzień
//   Zalogowany bez sub: 20/dzień
//   Aktywna subskrypcja: 100/dzień
// ─────────────────────────────────────────────────────────────────────────

// Mapy: typeId → strona generatora
const DOCUMENT_MAP = {
  uop:           { url: 'generator-umowy-o-prace.html',        label: 'Umowa o pracę',              icon: '📋' },
  wypowiedzenie: { url: 'generator-wypowiedzenia.html',         label: 'Wypowiedzenie umowy',         icon: '📝' },
  urlop:         { url: 'generator-wniosku-o-urlop.html',       label: 'Wniosek o urlop',            icon: '🏖️' },
  swiadectwo:    { url: 'generator-swiadectwa-pracy.html',      label: 'Świadectwo pracy',           icon: '📜' },
  zlecenie:      { url: 'generator-umowy-zlecenie.html',        label: 'Umowa zlecenie',             icon: '🤝' },
  dzielo:        { url: 'generator-umowy-o-dzielo.html',        label: 'Umowa o dzieło',             icon: '🎨' },
  b2b:           { url: 'generator-umowy-b2b.html',            label: 'Umowa B2B',                  icon: '💼' },
  nda:           { url: 'generator-nda.html',                   label: 'Umowa NDA',                  icon: '🔒' },
  pelnomocnictwo:{ url: 'generator-pelnomocnictwa.html',        label: 'Pełnomocnictwo',             icon: '✍️' },
  najmu:         { url: 'umowa-najmu.html',                     label: 'Umowa najmu',                icon: '🏠' },
  protokol:      { url: 'protokol-zdawczo-odbiorczy.html',      label: 'Protokół zdawczo-odbiorczy', icon: '📋' },
  spolnikow:     { url: 'umowa-wspolnikow.html',                label: 'Umowa spółki',               icon: '🏢' },
  regulamin:     { url: 'generator-regulaminu-sklepu.html',     label: 'Regulamin sklepu',           icon: '📋' },
  rodo:          { url: 'generator-polityki-prywatnosci.html',  label: 'Polityka prywatności',       icon: '🔐' },
  zwroty:        { url: 'generator-polityki-zwrotow.html',      label: 'Polityka zwrotów',           icon: '↩️' },
  sprzedaz:      { url: 'generator-umowy-sprzedazy.html',       label: 'Umowa sprzedaży',            icon: '💰' },
  wezwanie:      { url: 'wezwanie-do-zaplaty.html',             label: 'Wezwanie do zapłaty',        icon: '⚠️' },
  cv:            { url: 'kreator-cv.html',                      label: 'Kreator CV',                 icon: '📄' },
  letter:        { url: 'list-motywacyjny.html',                label: 'List motywacyjny',           icon: '✉️' },
  faktura:       { url: 'faktura.html',                         label: 'Faktura',                    icon: '🧾' },
  analiza:       { url: 'analiza-umowy.html',                   label: 'Analiza umowy AI',           icon: '🔍' },
};

const VALID_TYPES = Object.keys(DOCUMENT_MAP);

// ── Pomocnicze ──────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

// Darmowa pula ŁĄCZNA (na zawsze) — atomowa konsumpcja przez transakcję.
// Zwraca { allowed, used } gdzie used = liczba wykorzystanych po tej próbie.
async function consumeFreeQuery(usageDocId, max) {
  const ref = db.collection('legalChatUsage').doc(usageDocId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const used = (snap.exists && snap.data().freeUsed) || 0;
      if (used >= max) return { allowed: false, used };
      tx.set(ref, { freeUsed: used + 1, updatedAt: new Date() }, { merge: true });
      return { allowed: true, used: used + 1 };
    });
  } catch {
    return { allowed: true, used: 0 }; // fail-open na błędach Firestore
  }
}

// ── Anthropic ───────────────────────────────────────────────────────────

// Wspólny blok formatu — identyczny dla obu trybów, żeby nie rozjechał parser.
const OUTPUT_FORMAT_BLOCK =
`ZWIĘZŁOŚĆ: pisz gęsto i oszczędnie. NIE zostawiaj pustych linii między zdaniami, nie dawaj nagłówka do każdego zdania, nie rozbijaj krótkiej odpowiedzi na wiele akapitów. Używaj list tylko gdy naprawdę porządkują treść. Maks. jeden nagłówek "##" na odpowiedź (poza obowiązkową "### 📚 Podstawa prawna").

DOSTĘPNE typeId (używaj wyłącznie tych):
uop, wypowiedzenie, urlop, swiadectwo, zlecenie, dzielo, b2b, nda, pelnomocnictwo, najmu, protokol, spolnikow, regulamin, rodo, zwroty, sprzedaz, wezwanie, cv, letter, faktura, analiza

FORMAT WYJŚCIA — NAJPIERW pełna odpowiedź w czystym Markdown. POTEM w NOWEJ linii separator "===DOKUMO_META===" i JEDNA linia JSON z metadanymi:
===DOKUMO_META===
{"suggestions":["typeId"],"eliKeywords":["kodeks pracy"],"followups":["Krótkie pytanie kontynuujące?"],"saosQuery":"fraza do orzeczeń","docParams":{}}

Zasady metadanych:
- suggestions: max 3 typeId dokumentów, które użytkownik mógłby wygenerować w Dokumo (pusta tablica gdy brak sensownych).
- eliKeywords: max 2 krótkie frazy do wyszukania ustaw w Dzienniku Ustaw (np. "kodeks pracy", "podatek dochodowy"). Pusta tablica gdy brak.
- followups: 2-3 krótkie (max 70 znaków) pytania kontynuujące, które użytkownik mógłby naturalnie zadać jako następne — pisane z perspektywy użytkownika (np. "A co jeśli pracuję na pół etatu?"). Zawsze podaj.
- saosQuery: krótka fraza (3-6 słów) do wyszukiwarki orzeczeń sądowych, TYLKO gdy orzecznictwo realnie pomoże (spór, roszczenie, odszkodowanie, interpretacja przepisu). Pomiń przy prostych pytaniach informacyjnych i o stawki podatkowe.
- docParams: TYLKO gdy suggestions zawiera "wezwanie" lub "letter" I użytkownik podał w rozmowie konkretne dane. Wyciągnij je z rozmowy:
  dla "wezwanie": {"dluz_nazwa":"dłużnik","dluz_adres":"","kwota":"np. 5 000 zł","nr_dok":"nr faktury/umowy","data_wymagalnosci":"RRRR-MM-DD","wierz_nazwa":"wierzyciel"}
  dla "letter": {"position":"stanowisko","company":"firma","about":"umiejętności kandydata"}
  Pomiń pola, których nie znasz. Pomiń cały docParams, gdy użytkownik nie podał żadnych konkretów.
NIGDY nie umieszczaj separatora ani JSON-a wewnątrz treści odpowiedzi — tylko na samym końcu.`;

const SYSTEM_PROMPT_PRAWNY =
`Jesteś Asystentem Prawnym Dokumo — AI specjalizującym się w polskim prawie cywilnym, prawie pracy i prowadzeniu działalności gospodarczej.

ZASADY BEZWZGLĘDNE:
1. Odpowiadaj WYŁĄCZNIE po polsku, poprawną polszczyzną (bez literówek i kalek językowych).
2. Bądź ZWIĘZŁY i konkretny — maksymalnie ok. 350 słów. Lepiej krótko i trafnie niż długo i ogólnikowo. Odpowiadaj dokładnie na zadane pytanie, nie rozpisuj się o wszystkim wokół tematu.
3. Podawaj konkretne podstawy prawne: numery artykułów i nazwy ustaw (np. "art. 30 § 1 Kodeksu pracy", "art. 8 ust. 2a ustawy o systemie ubezpieczeń społecznych"). Podawaj tylko przepisy, których jesteś pewien.
4. Nie wymyślaj przepisów ani stawek. Jeśli nie masz pewności co do aktualnego brzmienia lub kwoty, napisz to wprost i odeślij do isap.sejm.gov.pl.
5. Nie udzielaj porad w konkretnych sprawach sądowych — odsyłaj do adwokata/radcy prawnego.
6. Jeśli użytkownik prosi o analizę tekstu umowy/dokumentu — wskaż potencjalne ryzyka i klauzule wymagające uwagi.

STRUKTURA odpowiedzi (Markdown):
- Krótka, merytoryczna odpowiedź (nagłówki ##/###, listy -, pogrubienie **).
- Na końcu ZAWSZE sekcja "### 📚 Podstawa prawna" z wypunktowaną listą KONKRETNYCH przepisów, na których opierasz odpowiedź (art. + nazwa ustawy). Jeśli nie opierasz się na konkretnym przepisie — napisz to szczerze.
- Ostatnia linijka to ZAWSZE disclaimer: "⚠️ To informacja ogólna, nie porada prawna. W złożonych sprawach skonsultuj się z prawnikiem."

` + OUTPUT_FORMAT_BLOCK;

const SYSTEM_PROMPT_PODATKOWY =
`Jesteś Asystentem Podatkowym Dokumo — AI specjalizującym się w polskim prawie podatkowym i rozliczeniach: PIT, CIT, VAT, ZUS, składka zdrowotna, ryczałt, podatek liniowy, skala podatkowa, JDG, koszty uzyskania przychodu, KSeF, faktury, amortyzacja.

ZASADY BEZWZGLĘDNE:
1. Odpowiadaj WYŁĄCZNIE po polsku, poprawną polszczyzną (bez literówek i kalek językowych).
2. Bądź ZWIĘZŁY i konkretny — maksymalnie ok. 350 słów. Odpowiadaj dokładnie na zadane pytanie.
3. Podawaj konkretne podstawy prawne: numery artykułów i nazwy ustaw (np. "art. 22 ustawy o PIT", "art. 43 ustawy o VAT") oraz stawki/limity — ale TYLKO gdy jesteś pewien aktualnej wartości.
4. Stawki, progi i limity podatkowe zmieniają się co roku. Jeśli nie masz pewności co do aktualnej kwoty (np. limit ryczałtu, kwota wolna, próg VAT), NAPISZ to wprost i odeślij do podatki.gov.pl lub isap.sejm.gov.pl. Nigdy nie zgaduj liczb.
5. Nie zastępujesz księgowego ani doradcy podatkowego — przy złożonych rozliczeniach odsyłaj do specjalisty.
6. Jeśli użytkownik prosi o analizę dokumentu (faktura, PIT, umowa) — wskaż istotne kwestie podatkowe i potencjalne ryzyka.

STRUKTURA odpowiedzi (Markdown):
- Krótka, merytoryczna odpowiedź (nagłówki ##/###, listy -, pogrubienie **).
- Na końcu ZAWSZE sekcja "### 📚 Podstawa prawna" z wypunktowaną listą KONKRETNYCH przepisów (art. + nazwa ustawy). Jeśli opierasz się na stawce, która mogła się zmienić — zaznacz to.
- Ostatnia linijka to ZAWSZE disclaimer: "⚠️ To informacja ogólna, nie porada podatkowa. W indywidualnych sprawach skonsultuj się z księgowym lub doradcą podatkowym."

` + OUTPUT_FORMAT_BLOCK;

const SYSTEM_PROMPTS = { prawny: SYSTEM_PROMPT_PRAWNY, podatkowy: SYSTEM_PROMPT_PODATKOWY };
function systemPromptFor(mode) {
  return SYSTEM_PROMPTS[mode] || SYSTEM_PROMPT_PRAWNY;
}

async function callClaude(messages, systemPrompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Brak ANTHROPIC_API_KEY');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system: systemPrompt || SYSTEM_PROMPT_PRAWNY,
      messages,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error('Anthropic HTTP ' + r.status);
  const data = await r.json();
  return data?.content?.[0]?.text || '';
}

// Wariant streamujący: woła onText(delta, całośćDoTejPory) dla każdego
// fragmentu tekstu i zwraca pełną odpowiedź po zakończeniu strumienia.
async function callClaudeStream(messages, systemPrompt, onText) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Brak ANTHROPIC_API_KEY');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system: systemPrompt || SYSTEM_PROMPT_PRAWNY,
      messages,
      stream: true,
    }),
    signal: AbortSignal.timeout(55000),
  });
  if (!r.ok) throw new Error('Anthropic HTTP ' + r.status);
  let raw = '', buf = '';
  const decoder = new TextDecoder();
  for await (const chunk of r.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.type === 'content_block_delta' && ev.delta && typeof ev.delta.text === 'string') {
        raw += ev.delta.text;
        try { onText(ev.delta.text, raw); } catch { /* ignore callback errors */ }
      } else if (ev.type === 'error') {
        throw new Error(ev.error?.message || 'Błąd strumienia AI');
      }
    }
  }
  return raw;
}

// Parser odporny na obcięcie: treść to zawsze czysty Markdown przed
// separatorem "===DOKUMO_META===". Metadane (JSON) idą po separatorze —
// jeśli odpowiedź zostanie ucięta, tracimy tylko metadane, nie treść.
const META_SEP = '===DOKUMO_META===';
function parseClaudeResponse(raw) {
  const t = (raw || '').trim();
  const idx = t.indexOf(META_SEP);
  let reply = idx >= 0 ? t.slice(0, idx).trim() : t;
  let metaStr = idx >= 0 ? t.slice(idx + META_SEP.length).trim() : '';
  metaStr = metaStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Zabezpieczenie: gdyby model mimo wszystko zwrócił stary format JSON
  // (cała odpowiedź jako {"reply":...}) i nie ma separatora — spróbuj odczytać.
  if (idx < 0 && reply.startsWith('{') && reply.includes('"reply"')) {
    try {
      const p = JSON.parse(reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
      if (p && typeof p.reply === 'string') {
        reply = p.reply;
        metaStr = JSON.stringify({ suggestions: p.suggestions, eliKeywords: p.eliKeywords });
      }
    } catch { /* zostaw reply jak jest */ }
  }

  let suggestions = [], eliKeywords = [], followups = [], docParams = null, saosQuery = null;
  if (metaStr) {
    try {
      const m = JSON.parse(metaStr);
      suggestions = (Array.isArray(m.suggestions) ? m.suggestions : [])
        .filter(s => VALID_TYPES.includes(s)).slice(0, 3);
      eliKeywords = (Array.isArray(m.eliKeywords) ? m.eliKeywords : [])
        .filter(k => typeof k === 'string' && k.trim()).slice(0, 2);
      followups = (Array.isArray(m.followups) ? m.followups : [])
        .filter(q => typeof q === 'string' && q.trim() && q.length <= 120).slice(0, 3);
      if (typeof m.saosQuery === 'string' && m.saosQuery.trim() && m.saosQuery.length <= 80) {
        saosQuery = m.saosQuery.trim();
      }
      // docParams: sanityzacja twarda — wartości trafiają do URL-i i formularzy
      if (m.docParams && typeof m.docParams === 'object' && !Array.isArray(m.docParams)) {
        const clean = {};
        for (const [k, v] of Object.entries(m.docParams)) {
          if (typeof v !== 'string' || !v.trim()) continue;
          if (!/^[a-z_]{2,30}$/.test(k)) continue;
          clean[k] = v.replace(/[<>"'&`]/g, '').slice(0, 160).trim();
        }
        if (Object.keys(clean).length) docParams = clean;
      }
    } catch { /* ignore metadane */ }
  }

  if (!reply) reply = 'Przepraszam, nie udało się przygotować odpowiedzi. Spróbuj przeformułować pytanie.';
  return { reply: reply.slice(0, 6000), suggestions, eliKeywords, followups, docParams, saosQuery };
}

// ── Prefill: buduje URL generatora z danymi wyciągniętymi z rozmowy ─────
function buildSuggestionUrl(typeId, baseUrl, dp) {
  if (!dp) return baseUrl;
  try {
    if (typeId === 'letter') {
      const qs = new URLSearchParams();
      for (const k of ['position', 'company', 'about']) if (dp[k]) qs.set(k, dp[k]);
      const s = qs.toString();
      return s ? baseUrl + '?' + s : baseUrl;
    }
    if (typeId === 'wezwanie') {
      const allow = ['wierz_nazwa', 'dluz_nazwa', 'dluz_adres', 'kwota', 'nr_dok', 'data_wymagalnosci'];
      const obj = {};
      for (const k of allow) if (dp[k]) obj[k] = dp[k];
      if (!Object.keys(obj).length) return baseUrl;
      return baseUrl + '?prefill=' + Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
    }
  } catch { /* fallthrough */ }
  return baseUrl;
}

// ── ELI: wyszukiwanie aktów prawnych ───────────────────────────────────

async function searchEliActs(keywords) {
  const results = [];
  for (const kw of keywords.slice(0, 2)) {
    try {
      const url = `https://api.sejm.gov.pl/eli/acts/search?title=${encodeURIComponent(kw)}&limit=4&sort=promulgationDate`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const data = await r.json();
      for (const item of (data.items || []).slice(0, 4)) {
        if (results.length >= 6) break;
        if (results.some(x => x.eli === item.address)) continue;
        results.push({
          eli: item.address || null,
          title: (item.title || '').slice(0, 200),
          type: item.type || '',
          date: item.announcementDate || item.entryIntoForce || null,
          inForce: item.inForce === 'IN_FORCE',
          url: item.address
            ? `https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=${item.address}`
            : null,
        });
      }
    } catch (e) {
      console.error('ELI search error:', e.message);
    }
  }
  return results;
}

// ── SAOS: wyszukiwanie orzeczeń sądowych (api.saos.org.pl, publiczne) ───

const SAOS_COURT_LABELS = {
  COMMON: 'Sąd',
  SUPREME: 'SN',
  ADMINISTRATIVE: 'NSA/WSA',
  CONSTITUTIONAL_TRIBUNAL: 'TK',
  NATIONAL_APPEAL_CHAMBER: 'KIO',
};

async function searchSaosJudgments(query) {
  try {
    const url = 'https://www.saos.org.pl/api/search/judgments?all=' + encodeURIComponent(query) + '&pageSize=3';
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.items || []).slice(0, 3).map(it => ({
      caseNumber: it.courtCases?.[0]?.caseNumber || '',
      court: (it.division?.court?.name || '').slice(0, 80),
      courtLabel: SAOS_COURT_LABELS[it.courtType] || 'Sąd',
      date: it.judgmentDate || null,
      url: 'https://www.saos.org.pl/judgments/' + it.id,
    })).filter(j => j.caseNumber);
  } catch (e) {
    console.error('SAOS search error:', e.message);
    return [];
  }
}

// ── Firestore: historia chatów ─────────────────────────────────────────

async function saveChatMessage(uid, chatId, role, content) {
  const chatRef = db.collection('users').doc(uid).collection('legalChats').doc(chatId);
  const msgRef = chatRef.collection('messages').doc();
  await msgRef.set({ role, content: content.slice(0, 4000), createdAt: Timestamp.now() });
  // Zaktualizuj metadane czatu (upsert)
  const preview = content.replace(/[#*`\n]/g, ' ').slice(0, 80);
  await chatRef.set({
    updatedAt: Timestamp.now(),
    preview: role === 'assistant' ? preview : undefined,
  }, { merge: true });
}

async function getOrCreateChatId(uid, chatId, firstMessage, mode) {
  if (chatId) return chatId;
  const ref = db.collection('users').doc(uid).collection('legalChats').doc();
  // Tytuł rozmowy = temat pierwszego pytania użytkownika (skrócony).
  const title = (firstMessage || 'Nowa rozmowa')
    .replace(/\s+/g, ' ').trim().slice(0, 70) || 'Nowa rozmowa';
  await ref.set({ createdAt: Timestamp.now(), updatedAt: Timestamp.now(), title, preview: '', mode: mode || 'prawny' });
  return ref.id;
}

// ── Handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dokumoflow.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query?.action || req.body?.action || '').toString();

  // ── Opcjonalna autoryzacja ──────────────────────────────────────────
  let uid = null;
  let subPlan = null;
  let isAdmin = false;
  const rawToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (rawToken) {
    try {
      const decoded = await auth.verifyIdToken(rawToken);
      uid = decoded.uid;
      // Administratorzy (ta sama lista co w api/admin.js) — dostęp bez limitu
      const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      isAdmin = !!decoded.email && ADMIN_EMAILS.includes(decoded.email.toLowerCase());
      // Sprawdź subskrypcję (potrzebny konkretny plan — asystent to ekskluzyw Pro Max)
      const subSnap = await db.collection('users').doc(uid).collection('subscription').doc('current').get();
      if (subSnap.exists) {
        const exp = subSnap.data().expiresAt?.toDate?.();
        if (exp && exp > new Date()) subPlan = subSnap.data().plan || null;
      }
    } catch { uid = null; }
  }

  // Model dostępu: 5 darmowych pytań ŁĄCZNIE (na zawsze), potem wyłącznie Pro Max.
  const FREE_LIFETIME = 5;
  const unlimited = isAdmin || subPlan === 'promax';
  const usageDocId = uid ? uid.replace(/[\/:.]/g, '_') : null;

  // ── GET quota — stan darmowej puli bez zużywania pytania ────────────
  if (req.method === 'GET' && action === 'quota') {
    if (!uid) return res.status(401).json({ error: 'Wymagane logowanie' });
    if (unlimited) return res.status(200).json({ unlimited: true });
    let freeUsed = 0;
    try {
      const snap = await db.collection('legalChatUsage').doc(usageDocId).get();
      if (snap.exists) freeUsed = snap.data().freeUsed || 0;
    } catch { /* fail-open */ }
    return res.status(200).json({
      unlimited: false,
      freeLeft: Math.max(0, FREE_LIFETIME - freeUsed),
      freeMax: FREE_LIFETIME,
      needsPromax: freeUsed >= FREE_LIFETIME,
    });
  }

  // ── GET history ─────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'history') {
    if (!uid) return res.status(401).json({ error: 'Wymagane logowanie' });
    const snap = await db.collection('users').doc(uid).collection('legalChats')
      .orderBy('updatedAt', 'desc').limit(30).get();
    const chats = snap.docs.map(d => ({
      id: d.id,
      title: d.data().title || d.data().preview || 'Rozmowa',
      preview: d.data().preview || '',
      mode: d.data().mode || 'prawny',
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));
    return res.status(200).json({ chats });
  }

  // ── GET messages for a chat ─────────────────────────────────────────
  if (req.method === 'GET' && action === 'messages') {
    if (!uid) return res.status(401).json({ error: 'Wymagane logowanie' });
    const chatId = (req.query.chatId || '').toString();
    if (!chatId) return res.status(400).json({ error: 'Brak chatId' });
    const chatRef = db.collection('users').doc(uid).collection('legalChats').doc(chatId);
    const [chatSnap, snap] = await Promise.all([
      chatRef.get(),
      chatRef.collection('messages').orderBy('createdAt').limit(100).get(),
    ]);
    const messages = snap.docs.map(d => ({
      id: d.id, role: d.data().role, content: d.data().content,
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
    }));
    return res.status(200).json({ messages, mode: (chatSnap.exists && chatSnap.data().mode) || 'prawny' });
  }

  // ── DELETE clear chat ───────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'clear') {
    if (!uid) return res.status(401).json({ error: 'Wymagane logowanie' });
    const chatId = (req.query.chatId || req.body?.chatId || '').toString();
    if (!chatId) return res.status(400).json({ error: 'Brak chatId' });
    // Usuń wiadomości (batch)
    const msgs = await db.collection('users').doc(uid).collection('legalChats')
      .doc(chatId).collection('messages').limit(200).get();
    const batch = db.batch();
    msgs.docs.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('users').doc(uid).collection('legalChats').doc(chatId));
    await batch.commit();
    return res.status(200).json({ ok: true });
  }

  // ── POST chat ───────────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).end();
  if (action !== 'chat') return res.status(400).json({ error: 'Nieznana akcja' });

  const { message, chatId: reqChatId, history, file, mode } = req.body || {};
  const hasMessage = typeof message === 'string' && message.trim().length > 0;
  const chatMode = (mode === 'podatkowy') ? 'podatkowy' : 'prawny';

  // ── Walidacja załącznika (opcjonalny) ──
  let fileBlock = null;   // blok document/image dla Claude
  let fileText = null;    // treść pliku .txt (doklejamy do promptu)
  let fileNote = '';      // adnotacja do zapisu/tytułu
  if (file && typeof file === 'object' && file.data && file.mediaType) {
    const approxBytes = Math.floor(String(file.data).length * 0.75);
    if (approxBytes > FILE_MAX_BYTES) {
      return res.status(413).json({ error: 'Plik zbyt duży (max 3 MB).' });
    }
    const mt = String(file.mediaType);
    if (mt === 'application/pdf') {
      fileBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } };
    } else if (FILE_IMAGE_TYPES.includes(mt)) {
      fileBlock = { type: 'image', source: { type: 'base64', media_type: mt, data: file.data } };
    } else if (mt === 'text/plain') {
      try { fileText = Buffer.from(file.data, 'base64').toString('utf8').slice(0, 20000); }
      catch { return res.status(400).json({ error: 'Nie udało się odczytać pliku tekstowego.' }); }
    } else {
      return res.status(415).json({ error: 'Nieobsługiwany typ pliku. Wgraj PDF, obraz (JPG/PNG) lub plik tekstowy (.txt).' });
    }
    fileNote = ' 📎 ' + (typeof file.name === 'string' ? file.name.slice(0, 120) : 'dokument');
  }

  // Wymagane logowanie — niezalogowani nie dostają odpowiedzi.
  if (!uid) {
    return res.status(401).json({ error: 'login_required' });
  }

  if (!hasMessage && !fileBlock && !fileText) {
    return res.status(400).json({ error: 'Brak treści pytania lub załącznika' });
  }
  if (hasMessage && message.length > 8000) {
    return res.status(400).json({ error: 'Pytanie zbyt długie (max 8000 znaków)' });
  }

  // Dostęp: Pro Max / admin bez limitu; pozostali mają 5 darmowych pytań łącznie.
  let quotaInfo;
  if (unlimited) {
    quotaInfo = { unlimited: true };
  } else {
    const c = await consumeFreeQuery(usageDocId, FREE_LIFETIME);
    if (!c.allowed) {
      bump(db, 'chat_limit_hit', { mode: chatMode });
      return res.status(403).json({
        error: 'promax_required',
        freeMax: FREE_LIFETIME, freeLeft: 0, needsPromax: true,
      });
    }
    quotaInfo = { unlimited: false, freeMax: FREE_LIFETIME, freeLeft: Math.max(0, FREE_LIFETIME - c.used) };
  }
  bump(db, 'chat_question', { mode: chatMode });

  // Buduj historię wiadomości dla Claude
  const claudeHistory = [];
  if (Array.isArray(history)) {
    for (const m of history.slice(-8)) { // max 8 poprzednich wiadomości
      if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
        claudeHistory.push({ role: m.role, content: m.content.slice(0, 4000) });
      }
    }
  }
  // Tekst pytania: użyj wpisanego, a przy samym załączniku bez pytania — domyślne polecenie.
  const userText = hasMessage
    ? message.trim()
    : 'Przeanalizuj załączony dokument: wypunktuj najważniejsze postanowienia oraz wskaż potencjalne ryzyka lub niejasności.';

  // Zbuduj treść ostatniej wiadomości użytkownika (string lub bloki z załącznikiem).
  let userContent;
  if (fileBlock) {
    userContent = [fileBlock, { type: 'text', text: userText }];
  } else if (fileText) {
    userContent = userText + '\n\nTREŚĆ DOKUMENTU:\n' + fileText;
  } else {
    userContent = userText;
  }
  claudeHistory.push({ role: 'user', content: userContent });

  // Do zapisu/tytułu używamy tekstu + adnotacji o pliku (base64 nie zapisujemy).
  const savedUserMsg = (userText + fileNote).slice(0, 4000);

  // Wspólny finisher: ELI + zapis Firestore + zbudowanie extras.
  async function buildExtras(parsed) {
    let savedChatId = reqChatId;
    const [relatedActs, relatedJudgments] = await Promise.all([
      parsed.eliKeywords.length ? searchEliActs(parsed.eliKeywords) : Promise.resolve([]),
      parsed.saosQuery ? searchSaosJudgments(parsed.saosQuery) : Promise.resolve([]),
      (async () => {
        try {
          const cid = await getOrCreateChatId(uid, reqChatId, savedUserMsg, chatMode);
          savedChatId = cid;
          await saveChatMessage(uid, cid, 'user', savedUserMsg);
          await saveChatMessage(uid, cid, 'assistant', parsed.reply);
        } catch (e) { console.error('legal-chat save error:', e.message); }
      })(),
    ]);
    const suggestionObjects = parsed.suggestions
      .map(s => {
        if (!DOCUMENT_MAP[s]) return null;
        const url = buildSuggestionUrl(s, DOCUMENT_MAP[s].url, parsed.docParams);
        return { typeId: s, ...DOCUMENT_MAP[s], url, prefilled: url !== DOCUMENT_MAP[s].url };
      })
      .filter(Boolean);
    return {
      suggestions: suggestionObjects,
      relatedActs,
      relatedJudgments,
      followups: parsed.followups || [],
      chatId: savedChatId || null,
      mode: chatMode,
      ...quotaInfo,
    };
  }

  // ── Ścieżka streamująca (NDJSON): meta → delty tekstu → extras → done ──
  if (req.body.stream === true) {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    const send = (o) => res.write(JSON.stringify(o) + '\n');
    send({ t: 'meta', mode: chatMode, ...quotaInfo });

    // Filtr: nie wypuszczamy do klienta separatora metadanych ani niczego po nim.
    let shown = 0;
    let raw = '';
    try {
      raw = await callClaudeStream(claudeHistory, systemPromptFor(chatMode), (_delta, soFar) => {
        const idx = soFar.indexOf(META_SEP);
        const visEnd = idx >= 0 ? idx : Math.max(shown, soFar.length - META_SEP.length);
        if (visEnd > shown) {
          send({ t: 'd', x: soFar.slice(shown, visEnd) });
          shown = visEnd;
        }
      });
    } catch (e) {
      console.error('legal-chat stream error:', e.message);
      send({ t: 'err', error: 'Chwilowy problem z AI. Spróbuj ponownie.' });
      return res.end();
    }
    const parsed = parseClaudeResponse(raw);
    // Dopchnij końcówkę widocznego tekstu wstrzymaną przez filtr separatora.
    const sepIdx = raw.indexOf(META_SEP);
    const visTotal = sepIdx >= 0 ? sepIdx : raw.length;
    if (visTotal > shown) send({ t: 'd', x: raw.slice(shown, visTotal) });
    try {
      const extras = await buildExtras(parsed);
      send({ t: 'extras', ...extras });
    } catch (e) {
      console.error('legal-chat extras error:', e.message);
    }
    send({ t: 'done' });
    return res.end();
  }

  // ── Ścieżka klasyczna (JSON) ──
  let parsed;
  try {
    const raw = await callClaude(claudeHistory, systemPromptFor(chatMode));
    parsed = parseClaudeResponse(raw);
  } catch (e) {
    console.error('legal-chat claude error:', e.message);
    return res.status(503).json({ error: 'Chwilowy problem z AI. Spróbuj ponownie.' });
  }

  const extras = await buildExtras(parsed);
  return res.status(200).json({ reply: parsed.reply, ...extras });
}
