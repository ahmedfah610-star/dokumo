import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

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

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress || 'unknown';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

// Rate limit oparty o Firestore — trwały między cold startami
async function checkAndIncrementLimit(key, max) {
  const ref = db.collection('legalChatUsage').doc(key.replace(/[\/:.]/g, '_'));
  const today = todayKey();
  try {
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};
    if (data.date !== today) {
      await ref.set({ date: today, count: 1 });
      return { allowed: true, used: 1, max };
    }
    if (data.count >= max) return { allowed: false, used: data.count, max };
    await ref.update({ count: data.count + 1 });
    return { allowed: true, used: data.count + 1, max };
  } catch {
    return { allowed: true, used: 0, max }; // fail-open na błędach Firestore
  }
}

// ── Anthropic ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
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

DOSTĘPNE typeId (używaj wyłącznie tych):
uop, wypowiedzenie, urlop, swiadectwo, zlecenie, dzielo, b2b, nda, pelnomocnictwo, najmu, protokol, spolnikow, regulamin, rodo, zwroty, sprzedaz, wezwanie, cv, letter, faktura, analiza

FORMAT WYJŚCIA — NAJPIERW pełna odpowiedź w czystym Markdown. POTEM w NOWEJ linii separator "===DOKUMO_META===" i JEDNA linia JSON z metadanymi:
===DOKUMO_META===
{"suggestions":["typeId"],"eliKeywords":["kodeks pracy"]}

Zasady metadanych:
- suggestions: max 3 typeId dokumentów, które użytkownik mógłby wygenerować w Dokumo (pusta tablica gdy brak sensownych).
- eliKeywords: max 2 krótkie frazy do wyszukania ustaw w Dzienniku Ustaw (np. "kodeks pracy", "systemie ubezpieczeń społecznych"). Pusta tablica gdy brak.
NIGDY nie umieszczaj separatora ani JSON-a wewnątrz treści odpowiedzi — tylko na samym końcu.`;

async function callClaude(messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Brak ANTHROPIC_API_KEY');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error('Anthropic HTTP ' + r.status);
  const data = await r.json();
  return data?.content?.[0]?.text || '';
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

  let suggestions = [], eliKeywords = [];
  if (metaStr) {
    try {
      const m = JSON.parse(metaStr);
      suggestions = (Array.isArray(m.suggestions) ? m.suggestions : [])
        .filter(s => VALID_TYPES.includes(s)).slice(0, 3);
      eliKeywords = (Array.isArray(m.eliKeywords) ? m.eliKeywords : [])
        .filter(k => typeof k === 'string' && k.trim()).slice(0, 2);
    } catch { /* ignore metadane */ }
  }

  if (!reply) reply = 'Przepraszam, nie udało się przygotować odpowiedzi. Spróbuj przeformułować pytanie.';
  return { reply: reply.slice(0, 6000), suggestions, eliKeywords };
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

async function getOrCreateChatId(uid, chatId) {
  if (chatId) return chatId;
  const ref = db.collection('users').doc(uid).collection('legalChats').doc();
  await ref.set({ createdAt: Timestamp.now(), updatedAt: Timestamp.now(), preview: '' });
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
  let hasSub = false;
  const rawToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (rawToken) {
    try {
      const decoded = await auth.verifyIdToken(rawToken);
      uid = decoded.uid;
      // Sprawdź subskrypcję
      const subSnap = await db.collection('users').doc(uid).collection('subscription').doc('current').get();
      if (subSnap.exists) {
        const exp = subSnap.data().expiresAt?.toDate?.();
        hasSub = exp && exp > new Date();
      }
    } catch { uid = null; }
  }

  // ── GET history ─────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'history') {
    if (!uid) return res.status(401).json({ error: 'Wymagane logowanie' });
    const snap = await db.collection('users').doc(uid).collection('legalChats')
      .orderBy('updatedAt', 'desc').limit(30).get();
    const chats = snap.docs.map(d => ({
      id: d.id,
      preview: d.data().preview || '',
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));
    return res.status(200).json({ chats });
  }

  // ── GET messages for a chat ─────────────────────────────────────────
  if (req.method === 'GET' && action === 'messages') {
    if (!uid) return res.status(401).json({ error: 'Wymagane logowanie' });
    const chatId = (req.query.chatId || '').toString();
    if (!chatId) return res.status(400).json({ error: 'Brak chatId' });
    const snap = await db.collection('users').doc(uid).collection('legalChats')
      .doc(chatId).collection('messages').orderBy('createdAt').limit(100).get();
    const messages = snap.docs.map(d => ({
      id: d.id, role: d.data().role, content: d.data().content,
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
    }));
    return res.status(200).json({ messages });
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

  const { message, chatId: reqChatId, history } = req.body || {};
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Brak treści pytania' });
  }
  if (message.length > 8000) {
    return res.status(400).json({ error: 'Pytanie zbyt długie (max 8000 znaków)' });
  }

  // Rate limit
  const limitKey = uid || ('ip:' + getClientIp(req));
  const limitMax = hasSub ? 100 : (uid ? 20 : 5);
  const rl = await checkAndIncrementLimit(limitKey, limitMax);
  if (!rl.allowed) {
    return res.status(429).json({
      error: `Wykorzystano dzienny limit ${limitMax} zapytań. Limit odnawia się o północy (UTC).`,
      queriesLeft: 0, queriesMax: limitMax,
    });
  }

  // Buduj historię wiadomości dla Claude
  const claudeHistory = [];
  if (Array.isArray(history)) {
    for (const m of history.slice(-8)) { // max 8 poprzednich wiadomości
      if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
        claudeHistory.push({ role: m.role, content: m.content.slice(0, 4000) });
      }
    }
  }
  claudeHistory.push({ role: 'user', content: message.trim() });

  // Wywołaj Claude
  let parsed;
  try {
    const raw = await callClaude(claudeHistory);
    parsed = parseClaudeResponse(raw);
  } catch (e) {
    console.error('legal-chat claude error:', e.message);
    return res.status(503).json({ error: 'Chwilowy problem z AI. Spróbuj ponownie.' });
  }

  // Zapis do Firestore i wyszukanie aktów prawnych równolegle
  let savedChatId = reqChatId;
  const [relatedActs] = await Promise.all([
    parsed.eliKeywords.length ? searchEliActs(parsed.eliKeywords) : Promise.resolve([]),
    uid ? (async () => {
      try {
        const cid = await getOrCreateChatId(uid, reqChatId);
        savedChatId = cid;
        await saveChatMessage(uid, cid, 'user', message.trim());
        await saveChatMessage(uid, cid, 'assistant', parsed.reply);
      } catch (e) { console.error('legal-chat save error:', e.message); }
    })() : Promise.resolve(),
  ]);

  // Mapuj suggestions na pełne obiekty
  const suggestionObjects = parsed.suggestions
    .map(s => DOCUMENT_MAP[s] ? { typeId: s, ...DOCUMENT_MAP[s] } : null)
    .filter(Boolean);

  return res.status(200).json({
    reply: parsed.reply,
    suggestions: suggestionObjects,
    relatedActs,
    chatId: savedChatId || null,
    queriesLeft: rl.max - rl.used,
    queriesMax: rl.max,
  });
}
