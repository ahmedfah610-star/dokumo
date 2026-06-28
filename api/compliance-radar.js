import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─────────────────────────────────────────────────────────────────────────
// Radar zgodności prawnej — Faza A (ukryty rollout za feature flagiem).
// Codziennie sprawdza nowe akty prawne (Dziennik Ustaw, api.sejm.gov.pl/eli)
// i oznacza dokumenty użytkownika, których typ może wymagać przeglądu.
//
// Włączenie flagi dla testera (ręcznie w Firebase Console / Admin SDK):
//   users/{uid}  ->  { featureFlags: { complianceRadar: true } }
//
// Ważne: NIE używamy collectionGroup() po documents — iterujemy userów
// (jak w dunning.js), więc nie wymaga to żadnego nowego indeksu Firestore.
//
// DEBUG: maile NIE są wysyłane, dopóki COMPLIANCE_RADAR_DEBUG_MODE !== 'true'
// (czyli domyślnie wysyłka jest WŁĄCZONA — ustaw zmienną na 'true', żeby
// testować bez realnej wysyłki).
// ─────────────────────────────────────────────────────────────────────────

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

const DEBUG = process.env.COMPLIANCE_RADAR_DEBUG_MODE === 'true';
const ELI_BASE = 'https://api.sejm.gov.pl/eli/acts/DU';

// ── Mapa: typeId dokumentu -> słowa kluczowe sygnalizujące zmianę prawa,
// która może go dotyczyć. Tylko typy z realnym ryzykiem zgodności — CV,
// list motywacyjny, biznesplan, SWOT, protokół nie mają jednoznacznego
// odniesienia do konkretnej ustawy, więc są poza zakresem (unikamy szumu).
const TYPE_LAW_AREAS = {
  uop: ['kodeks pracy', 'prawo pracy', 'wynagrodzeni', 'minimaln[ey] wynagrodzeni', 'czas pracy', 'urlop'],
  wypowiedzenie: ['kodeks pracy', 'wypowiedzeni[ae] umowy o pracę', 'okres wypowiedzenia'],
  urlop: ['kodeks pracy', 'urlop', 'czas pracy'],
  swiadectwo: ['kodeks pracy', 'świadectwo pracy'],
  zlecenie: ['umow[ay] zleceni', 'składk[ai] (?:zus|zdrowotn)', 'minimaln[ae] stawk[ai] godzinow'],
  dzielo: ['umow[ay] o dzieł', 'kodeks cywilny'],
  b2b: ['działalność gospodarcz', 'jednoosobow[ae] działalność', 'składk[ai] zdrowotn', 'ryczałt', 'cit\\b', 'pit\\b'],
  nda: ['tajemnic[ay] przedsiębiorstwa', 'ochron[ae] danych osobowych', 'rodo'],
  pelnomocnictwo: ['pełnomocnictw', 'opłat[ae] skarbow'],
  najmu: ['najem lokal', 'ochron[ae] praw lokatorów', 'najmu'],
  wypowiedzenie_najmu: ['najem lokal', 'ochron[ae] praw lokatorów'],
  protokol: ['najem lokal'],
  spolnikow: ['kodeks spółek handlowych', 'spółk[ai] z ograniczoną', 'spółk[ai] cywilna'],
  regulamin: ['praw[ai] konsument', 'sprzedaż[yu]? konsumenck', 'odstąpieni[ae] od umowy', 'handel elektroniczny'],
  zwroty: ['praw[ai] konsument', 'odstąpieni[ae] od umowy', 'rękojmi'],
  rodo: ['ochron[ae] danych osobowych', '\\brodo\\b'],
  sprzedaz: ['praw[ai] konsument', 'kodeks cywilny', 'rękojmi'],
  wezwanie: ['odsetk[i]? ustawow', 'postępowani[ae] cywiln', 'przedawnieni'],
};

function err(status, code) { const e = new Error(code); e.status = status; return e; }

// ── Pobiera akty z Dziennika Ustaw opublikowane po `sinceIso`, ze statusem
// "obowiązujący". `promulgation` to data ogłoszenia w DU — to jest moment,
// w którym zmiana faktycznie zaczyna obowiązywać/jest wiążąca, więc to ona
// (nie announcementDate, czyli data podpisania aktu) jest właściwym filtrem.
async function fetchNewActs(sinceIso) {
  const since = new Date(sinceIso);
  const years = new Set([new Date().getFullYear()]);
  if (since.getFullYear() < new Date().getFullYear()) years.add(since.getFullYear());

  const all = [];
  for (const year of years) {
    try {
      const r = await fetch(`${ELI_BASE}/${year}`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const data = await r.json();
      for (const item of (data.items || [])) {
        if (item.status !== 'obowiązujący') continue;
        if (!item.promulgation) continue;
        if (new Date(item.promulgation) <= since) continue;
        all.push(item);
      }
    } catch (e) {
      console.error('fetchNewActs error for year', year, e.message);
    }
  }
  return all;
}

// ── Pierwszy przesiew: dopasowanie tytułu aktu do typów dokumentów po słowach kluczowych ──
function matchTypeIds(title) {
  const t = (title || '').toLowerCase();
  const matched = [];
  for (const [typeId, keywords] of Object.entries(TYPE_LAW_AREAS)) {
    if (keywords.some(kw => new RegExp(kw, 'i').test(t))) matched.push(typeId);
  }
  return matched;
}

// ── Walidator tonu podsumowania AI — nigdy stanowczych twierdzeń prawnych ──
const FORBIDDEN_PHRASES_RADAR = [
  'musisz', 'jest nielegaln', 'jest niezgodn[ey] z prawem', 'natychmiast',
  'pod rygorem', 'zobowiązany jest', 'niezwłocznie', 'to nie jest legalne',
];
function validateRadarTone(text) {
  for (const phrase of FORBIDDEN_PHRASES_RADAR) {
    if (new RegExp(phrase, 'i').test(text)) return { ok: false, violation: phrase };
  }
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 4) return { ok: false, violation: 'too_long' };
  return { ok: true };
}

const RADAR_SYSTEM_PROMPT =
`Jesteś asystentem prawnym ostrzegającym o zmianach w polskim prawie, które MOGĄ
dotyczyć danego typu dokumentu (np. umowy, regulaminu).

Zasady BEZWZGLĘDNE:
1. To NIE jest porada prawna. Pisz wyłącznie w trybie hipotetycznym/ostrzegawczym:
   "może wpływać", "warto sprawdzić", "zalecamy przegląd" — NIGDY stanowczych
   twierdzeń typu "jest nielegalne", "musisz", "natychmiast", "pod rygorem".
2. NIE wymyślaj szczegółów ustawy — opieraj się tylko na podanym tytule aktu.
3. Jeśli tytuł aktu jest zbyt ogólny / wątpliwe, czy realnie dotyczy tego typu
   dokumentu — ustaw "relevant": false.
4. Długość podsumowania: maksymalnie 2 zdania, po polsku.

Zwróć ODPOWIEDŹ jako czysty JSON, bez markdown, bez fence'ów:
{"relevant": true/false, "summary": "..."}`;

function parseRadarJson(raw) {
  let t = (raw || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const p = JSON.parse(t);
    if (p && typeof p.relevant === 'boolean' && typeof p.summary === 'string') return p;
  } catch { /* ignore */ }
  return null;
}

async function callAnthropic(systemPrompt, userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Brak ANTHROPIC_API_KEY');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error('Anthropic HTTP ' + r.status);
  const data = await r.json();
  return data?.content?.[0]?.text || '';
}

// ── Klasyfikacja aktu przez AI: czy realnie dotyczy danego typu, hedged summary ──
async function classifyAct(act, typeIds) {
  const userPrompt = `AKT PRAWNY: "${act.title}"\nTyp: ${act.type}\nData ogłoszenia: ${act.promulgation}\n\nTypy dokumentów potencjalnie dotknięte (po słowach kluczowych): ${typeIds.join(', ')}\n\nOceń i podsumuj zgodnie z zasadami systemowymi.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callAnthropic(RADAR_SYSTEM_PROMPT, userPrompt);
      const parsed = parseRadarJson(raw);
      if (!parsed) continue;
      if (!parsed.relevant) return { relevant: false };
      const v = validateRadarTone(parsed.summary);
      if (!v.ok) continue;
      return { relevant: true, summary: parsed.summary.slice(0, 500) };
    } catch (e) {
      console.error('classifyAct AI error:', e.message);
    }
  }
  // Bezpieczny fallback: ostrzeżenie ogólne, bez twierdzeń, gdy AI zawiedzie.
  return { relevant: true, summary: `Opublikowano nowy akt prawny ("${act.title}"), który może dotyczyć tego typu dokumentu — zalecamy przegląd.` };
}

async function sendEmail({ to, subject, body }) {
  if (DEBUG) return 'debug-mode';
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Brak RESEND_API_KEY');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ from: 'Dokumo <noreply@dokumoflow.com>', to, subject, text: body }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error('Resend HTTP ' + r.status);
  const data = await r.json();
  return data?.id || null;
}

// ── Krok 1: pobierz nowe akty, dopasuj słowami kluczowymi, sklasyfikuj AI, zapisz alert ──
async function detectNewAlerts() {
  const controlRef = db.collection('system').doc('complianceRadar');
  const controlSnap = await controlRef.get();
  const lastSync = controlSnap.exists && controlSnap.data().lastSync
    ? controlSnap.data().lastSync.toDate().toISOString()
    : new Date(Date.now() - 30 * 86400000).toISOString();

  const acts = await fetchNewActs(lastSync);
  let newestPromulgation = lastSync;
  const alerts = [];

  for (const act of acts) {
    if (act.promulgation > newestPromulgation) newestPromulgation = act.promulgation;
    const typeIds = matchTypeIds(act.title);
    if (!typeIds.length) continue;

    const docId = (act.ELI || `${act.publisher}-${act.year}-${act.pos}`).replace(/[\/\\]/g, '_');
    const alertRef = db.collection('complianceAlerts').doc(docId);
    const existing = await alertRef.get();
    if (existing.exists) continue; // już przetworzony w poprzednim biegu

    const cls = await classifyAct(act, typeIds);
    const record = {
      eli: act.ELI || null,
      title: act.title,
      type: act.type,
      promulgation: act.promulgation,
      typeIds,
      relevant: cls.relevant,
      summary: cls.summary || null,
      createdAt: Timestamp.now(),
    };
    await alertRef.set(record);
    if (cls.relevant) alerts.push(record);
  }

  await controlRef.set({ lastSync: Timestamp.fromDate(new Date(newestPromulgation)) }, { merge: true });
  return alerts;
}

// ── Krok 2: dla każdego flagowanego użytkownika, dopasuj alerty do jego dokumentów ──
async function flagUserDocuments(uid, ownerEmail, alerts) {
  const snap = await db.collection('users').doc(uid).collection('documents').limit(500).get();
  const flaggedForEmail = [];

  for (const d of snap.docs) {
    const x = d.data();
    if (!x.typeId) continue;
    const existingFlags = Array.isArray(x.complianceFlags) ? x.complianceFlags : [];
    const existingElis = new Set(existingFlags.map(f => f.eli));
    const newFlags = [];

    for (const alert of alerts) {
      if (!alert.typeIds.includes(x.typeId)) continue;
      if (existingElis.has(alert.eli)) continue;
      newFlags.push({ eli: alert.eli, title: alert.title, summary: alert.summary, flaggedAt: Timestamp.now() });
    }
    if (!newFlags.length) continue;

    await d.ref.update({
      complianceFlags: [...existingFlags, ...newFlags],
      complianceNeedsReview: true,
    });
    flaggedForEmail.push({ name: x.name || 'Dokument', flags: newFlags });
  }

  if (flaggedForEmail.length && ownerEmail) {
    const lines = flaggedForEmail.map(f =>
      `• „${f.name}" — ${f.flags.map(fl => fl.summary || fl.title).join(' ')}`
    ).join('\n\n');
    const subject = `Radar zgodności: ${flaggedForEmail.length} ${flaggedForEmail.length === 1 ? 'dokument może wymagać przeglądu' : 'dokumentów może wymagać przeglądu'}`;
    const body =
`Dzień dobry,

Wykryliśmy zmiany w przepisach, które mogą dotyczyć niektórych Twoich dokumentów w Dokumo. To nie jest porada prawna — zalecamy samodzielny przegląd lub konsultację ze specjalistą.

${lines}

Przejrzyj dokumenty: https://dokumoflow.com/moje-dokumenty.html

Pozdrawiamy,
Zespół Dokumo`;
    try {
      await sendEmail({ to: ownerEmail, subject, body });
    } catch (e) {
      console.error('compliance-radar email error for', uid, e.message);
    }
  }

  return flaggedForEmail.length;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dokumoflow.com');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query?.action || req.body?.action || '').toString();

  try {
    // Vercel Cron przekazuje "Authorization: Bearer <CRON_SECRET>" gdy zmienna jest ustawiona.
    // Akceptujemy też custom header "x-cron-secret" (dla zewnętrznych cron-job.org itp.).
    const cronSecret = process.env.CRON_SECRET;
    const cronAuthed = cronSecret && (
      req.headers.authorization === 'Bearer ' + cronSecret ||
      req.headers['x-cron-secret'] === cronSecret
    );
    if (action !== 'check' || !cronAuthed) {
      throw err(404, 'not_found');
    }

    const alerts = await detectNewAlerts();
    let usersChecked = 0, docsFlagged = 0;

    if (alerts.length) {
      const usersSnap = await db.collection('users').where('featureFlags.complianceRadar', '==', true).limit(500).get();
      for (const u of usersSnap.docs) {
        try {
          const auser = await auth.getUser(u.id);
          if (!auser.email) continue;
          docsFlagged += await flagUserDocuments(u.id, auser.email, alerts);
          usersChecked++;
        } catch (e) { /* skip */ }
      }
    }

    return res.status(200).json({ ok: true, debug: DEBUG, newAlerts: alerts.length, usersChecked, docsFlagged });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Błąd radaru zgodności' });
  }
}
