import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─────────────────────────────────────────────────────────────────────────
// AI Windykator — Faza A (ukryty rollout za feature flagiem).
// Cały backend w jednej funkcji serverless; routing po parametrze `action`.
// Funkcja widoczna WYŁĄCZNIE dla userów z users/{uid}.featureFlags.dunning === true.
//
// Włączenie flagi dla testera (ręcznie w Firebase Console / Admin SDK):
//   users/{uid}  ->  { featureFlags: { dunning: true } }
//
// DEBUG: maile NIE są wysyłane, dopóki DUNNING_DEBUG_MODE === 'false'.
// ─────────────────────────────────────────────────────────────────────────

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

const DAY = 86400000;
// Wysyłka maili WŁĄCZONA. Tryb testowy (maile nie wychodzą) tylko gdy DUNNING_DEBUG_MODE === 'true'.
const DEBUG = process.env.DUNNING_DEBUG_MODE === 'true';

function err(status, message) { return Object.assign(new Error(message), { status }); }

// ── Dostęp: token + feature flag ──
async function verifyFlagged(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) throw err(401, 'Brak tokenu');
  let decoded;
  try { decoded = await auth.verifyIdToken(token); }
  catch { throw err(401, 'Nieważny token'); }
  const snap = await db.collection('users').doc(decoded.uid).get();
  const data = snap.exists ? (snap.data() || {}) : {};
  if (data?.featureFlags?.dunning !== true) throw err(403, 'feature_disabled');
  return { uid: decoded.uid, email: decoded.email || '', name: decoded.name || '', userDoc: data };
}

// ── Formatowanie ──
function formatPLN(grosze) {
  return ((grosze || 0) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}
function formatDate(ts) {
  const d = ts?.toDate?.() || (ts ? new Date(ts) : null);
  if (!d) return '—';
  return d.toLocaleDateString('pl-PL');
}
function daysOverdueOf(invoice) {
  const due = invoice.dueDate?.toMillis?.() ?? null;
  if (due == null) return 0;
  return Math.floor((Date.now() - due) / DAY);
}

// ── Auto-pobieranie danych z dokumentów (faktury / umowy zlecenie) ──

// Wyciąga pierwszy adres e-mail z tekstu (best-effort).
function extractEmail(text) {
  const m = (text || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : '';
}

// Parsuje datę z fragmentu tekstu: YYYY-MM-DD albo DD.MM.YYYY / DD-MM-YYYY / DD/MM/YYYY.
function parseLooseDate(s) {
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d) ? null : d; }
  m = s.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/);
  if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); return isNaN(d) ? null : d; }
  return null;
}

// Szuka daty płatności w pobliżu słów-kluczy (best-effort dla umów zlecenie).
function extractPaymentDate(text) {
  if (!text) return null;
  const re = /(płatn|zapłat|wynagrodzeni|termin)/gi;
  let m;
  while ((m = re.exec(text))) {
    const d = parseLooseDate(text.slice(m.index, m.index + 100));
    if (d) return d;
  }
  return null;
}

// Czytelny podgląd faktury z danych strukturalnych (fakDataJson).
// Symbol waluty.
function curSymbol(c) {
  return ({ PLN: 'zł', EUR: '€', USD: '$', GBP: '£' })[c] || (c || 'zł');
}
// Formatuje kwotę z walutą.
function fmtAmount(amount, currency) {
  if (amount == null) return '';
  return Number(amount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    + ' ' + curSymbol(currency);
}
// Suma brutto faktury z pozycji: ilosc * cenaNetto * (1 + VAT).
function fakTotal(fd) {
  if (!Array.isArray(fd.items) || !fd.items.length) return null;
  let gross = 0;
  for (const it of fd.items) {
    const netto = (Number(it.ilosc) || 0) * (Number(it.cenaNetto) || 0);
    let vatRate = 0;
    if (it.vat && it.vat !== 'zw.') vatRate = (parseFloat(it.vat) || 0) / 100;
    gross += netto * (1 + vatRate);
  }
  return gross;
}

function fakReadable(fd) {
  const L = ['Faktura ' + (fd.numer || '')];
  if (fd.dataWyst) L.push('Data wystawienia: ' + fd.dataWyst);
  if (fd.dataSprzed) L.push('Data sprzedaży: ' + fd.dataSprzed);
  if (fd.termin) L.push('Termin płatności: ' + fd.termin + ' dni od wystawienia');
  L.push('', 'Sprzedawca: ' + (fd.sNazwa || '—'));
  if (fd.sNip) L.push('NIP: ' + fd.sNip);
  L.push('', 'Nabywca: ' + (fd.nNazwa || '—'));
  if (fd.nNip) L.push('NIP: ' + fd.nNip);
  if (fd.nEmail) L.push('E-mail: ' + fd.nEmail);
  if (Array.isArray(fd.items) && fd.items.length) {
    L.push('', 'Liczba pozycji: ' + fd.items.length);
    const t = fakTotal(fd);
    if (t != null) L.push('Kwota brutto: ' + fmtAmount(t, fd.waluta));
  }
  if (fd.sKonto) L.push('Numer konta: ' + fd.sKonto);
  if (fd.uwagi) L.push('', 'Uwagi: ' + fd.uwagi);
  return L.join('\n');
}

// Termin płatności faktury = data wystawienia (lub sprzedaży) + termin w dniach.
function fakDueDate(fd) {
  const base = fd.dataWyst || fd.dataSprzed;
  if (!base) return null;
  const d = new Date(base);
  if (isNaN(d)) return null;
  const days = parseInt(fd.termin, 10);
  d.setDate(d.getDate() + (isNaN(days) ? 0 : days));
  return d;
}

// ── Szablony przypomnień (stałe, bez AI) ──
const REMINDER_LEVELS = ['przed', 'po1', 'po2', 'sad'];
const REMINDER_LEVEL_NUM = { przed: 0, po1: 1, po2: 2, sad: 3 };
const REMINDER_LABEL = { przed: 'Przed terminem', po1: 'Po terminie', po2: 'Ponaglenie', sad: 'Przedsądowe' };

// Sugeruje poziom przypomnienia na podstawie terminu płatności.
function suggestLevel(dueIso) {
  if (!dueIso) return 'przed';
  const diff = Date.now() - new Date(dueIso).getTime();
  if (diff < 0) return 'przed';
  const days = Math.floor(diff / DAY);
  if (days <= 14) return 'po1';
  if (days <= 30) return 'po2';
  return 'sad';
}

// Domyślne szablony z placeholderami: {nazwa} {termin} {kwota} {konto} {platnosc} {nadawca}
const DEFAULT_TEMPLATES = {
  przed: {
    subject: 'Przypomnienie o zbliżającym się terminie płatności — {nazwa}',
    body: 'Dzień dobry,\n\nUprzejmie przypominamy, że termin płatności dokumentu „{nazwa}" przypada na {termin}.\n\n{platnosc}\n\nProsimy o uregulowanie należności w terminie. Jeśli płatność została już zrealizowana, prosimy potraktować tę wiadomość jako bezprzedmiotową.\n\nPozdrawiamy,\n{nadawca}',
  },
  po1: {
    subject: 'Przypomnienie o zaległej płatności — {nazwa}',
    body: 'Dzień dobry,\n\nInformujemy, że minął termin płatności dokumentu „{nazwa}" (termin: {termin}), a wpłata nie została jeszcze odnotowana.\n\n{platnosc}\n\nProsimy o uregulowanie należności w najbliższym możliwym terminie. Jeśli płatność jest już w realizacji, dziękujemy i prosimy o zignorowanie tej wiadomości.\n\nPozdrawiamy,\n{nadawca}',
  },
  po2: {
    subject: 'Ponowne wezwanie do zapłaty — {nazwa}',
    body: 'Dzień dobry,\n\nPomimo wcześniejszego przypomnienia należność z dokumentu „{nazwa}" (termin płatności: {termin}) pozostaje nieuregulowana.\n\n{platnosc}\n\nProsimy o niezwłoczne dokonanie płatności. Jeśli wystąpiły przeszkody w jej realizacji, prosimy o kontakt w celu ustalenia rozwiązania.\n\nPozdrawiamy,\n{nadawca}',
  },
  sad: {
    subject: 'Przedsądowe wezwanie do zapłaty — {nazwa}',
    body: 'Dzień dobry,\n\nNiniejszym wzywamy do zapłaty zaległej należności wynikającej z dokumentu „{nazwa}" (termin płatności: {termin}), która do dnia dzisiejszego nie została uregulowana.\n\n{platnosc}\n\nWyznaczamy ostateczny termin 7 dni od otrzymania niniejszej wiadomości na uregulowanie należności. Brak wpłaty w tym terminie może skutkować skierowaniem sprawy na drogę postępowania sądowego.\n\nLiczymy na polubowne rozwiązanie sprawy.\n\n{nadawca}',
  },
};
const TEMPLATE_PLACEHOLDERS = ['{nazwa}', '{termin}', '{kwota}', '{konto}', '{platnosc}', '{nadawca}'];

// Buduje kontekst podstawień dla wzbogaconego dokumentu.
function tplCtx(e, fromName) {
  const due = e.dueDate ? new Date(e.dueDate).toLocaleDateString('pl-PL') : 'wskazany w dokumencie';
  const kwota = e.amount != null ? fmtAmount(e.amount, e.currency) : '';
  const konto = e.bankAccount || '';
  const payLines = [];
  if (kwota) payLines.push('Kwota do zapłaty: ' + kwota);
  if (konto) payLines.push('Numer konta: ' + konto);
  const platnosc = payLines.length ? 'Szczegóły płatności:\n' + payLines.join('\n') : '';
  return { nazwa: e.name || 'dokument', termin: due, kwota, konto, platnosc, nadawca: fromName || 'Zespół' };
}

// Podstawia placeholdery i czyści puste linie.
function fillTemplate(str, ctx) {
  return String(str || '')
    .replace(/\{nazwa\}/g, ctx.nazwa)
    .replace(/\{termin\}/g, ctx.termin)
    .replace(/\{kwota\}/g, ctx.kwota)
    .replace(/\{konto\}/g, ctx.konto)
    .replace(/\{platnosc\}/g, ctx.platnosc)
    .replace(/\{nadawca\}/g, ctx.nadawca)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Buduje wiadomość dla poziomu: szablon użytkownika lub domyślny, z podstawieniami.
function buildReminder(level, e, fromName, prefs) {
  const def = DEFAULT_TEMPLATES[level] || DEFAULT_TEMPLATES.po1;
  const custom = prefs?.templates?.[level];
  const tpl = (custom && (custom.subject || custom.body)) ? {
    subject: custom.subject || def.subject,
    body: custom.body || def.body,
  } : def;
  const ctx = tplCtx(e, fromName);
  return { subject: fillTemplate(tpl.subject, ctx), body: fillTemplate(tpl.body, ctx) };
}

// Wzbogaca dokument o dane biznesowe (typ, termin, e-mail) — wspólne dla listy i przypomnień.
function enrichDoc(id, x) {
  const TYPES = { faktura: { label: 'Faktura', icon: '🧾' }, zlecenie: { label: 'Umowa zlecenie', icon: '📑' } };
  const typeId = x.typeId || '';
  const meta = TYPES[typeId];
  if (!meta) return null;
  const toIso = v => v?.toDate?.()?.toISOString() || (v ? new Date(v).toISOString() : null);
  let dueDate = toIso(x.dueDate);
  let recipientEmail = x.recipientEmail || '';
  let autoDue = false, autoEmail = false;
  let amount = null, currency = '', bankAccount = '';
  let text = x.text || '';
  if (typeId === 'faktura') {
    let fd = null;
    try { fd = x.fakDataJson ? JSON.parse(x.fakDataJson) : null; } catch { fd = null; }
    if (!fd && text.startsWith('__FAK_JSON__:')) {
      try { fd = JSON.parse(text.slice(13)); } catch { fd = null; }
    }
    if (fd) {
      text = fakReadable(fd);
      if (!dueDate) { const dd = fakDueDate(fd); if (dd) { dueDate = dd.toISOString(); autoDue = true; } }
      if (!recipientEmail && fd.nEmail) { recipientEmail = fd.nEmail; autoEmail = true; }
      amount = fakTotal(fd);
      currency = fd.waluta || 'PLN';
      bankAccount = fd.sKonto || '';
    } else if (text.startsWith('__FAK_JSON__:')) {
      text = '(faktura — brak danych do podglądu)';
    }
  } else {
    if (!recipientEmail) { const e = extractEmail(text); if (e) { recipientEmail = e; autoEmail = true; } }
    if (!dueDate) { const dd = extractPaymentDate(text); if (dd) { dueDate = dd.toISOString(); autoDue = true; } }
  }
  return {
    id, name: x.name || meta.label, typeId, catLabel: meta.label, icon: meta.icon,
    text, createdAt: toIso(x.createdAt), dueDate, recipientEmail, autoDue, autoEmail,
    amount, currency, bankAccount,
    paid: x.paid === true, paidAt: toIso(x.paidAt),
    lastSentAt: toIso(x.lastSentAt), lastReminderLevel: x.lastReminderLevel || null,
  };
}

// ── Czarna lista zwrotów (Poziom 1) — walidator wyjścia AI ──
const FORBIDDEN_PHRASES_LVL1 = [
  'sąd', 'sądow',
  'komornik', 'komornicz',
  'prokuratur',
  'BIG', 'KRD', 'BIK', 'Krajow[ay] Rejestr Dłużnik',
  'wezwanie do zapłaty', 'ostateczne wezwanie',
  'odsetk',
  'kara umowna', 'kary umownej',
  'rozwiązani[eu] umow[yi]',
  'naruszeni[ae]',
  'natychmiast',
  'w przeciwnym razie',
  'nieprzekraczaln',
  'pod rygorem',
  'opublikuj[eę]',
  'ujawni[ęmc]',
];

function validateLvl1(text) {
  for (const phrase of FORBIDDEN_PHRASES_LVL1) {
    if (new RegExp(phrase, 'i').test(text)) {
      return { ok: false, violation: phrase };
    }
  }
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 10) return { ok: false, violation: 'too_long' };
  return { ok: true };
}

// ── Bezpieczny szablon awaryjny (gdy AI zawiedzie walidację) ──
function safeTemplate(invoice, fromName, daysOverdue) {
  const subject = `Przypomnienie - faktura ${invoice.number}`;
  const body =
`Dzień dobry,

Chciałbym uprzejmie przypomnieć o fakturze ${invoice.number} na kwotę ${formatPLN(invoice.amountGross)}, której termin płatności minął ${daysOverdue} ${daysOverdue === 1 ? 'dzień' : 'dni'} temu (${formatDate(invoice.dueDate)}).

Czy mógłbym prosić o sprawdzenie sprawy i informację, kiedy mogę spodziewać się płatności? Jeśli faktura nie dotarła, chętnie wyślę ją ponownie.

Pozdrawiam,
${fromName}`;
  return { subject, body };
}

// ── Generator AI — Poziom 1 (grzeczne przypomnienie) ──
const SYSTEM_PROMPT =
`Jesteś AI asystentem windykacyjnym dla polskich freelancerów i mikrofirm.
Twoje zadanie: napisać GRZECZNE PRZYPOMNIENIE o zaległej płatności faktury.

Zasady BEZWZGLĘDNE:
1. Ton: koleżeński, profesjonalny, BEZ presji ani gróźb.
2. Założenie: klient zapomniał, nie ma złej woli.
3. NIE wolno wspominać: postępowania sądowego, prokuratury, BIG, KRD, BIK,
   komornika, konsekwencji prawnych, odsetek, kar umownych.
4. NIE wolno używać słów: "wezwanie", "ostateczny termin", "natychmiast",
   "w przeciwnym razie", "naruszenie", "pod rygorem".
5. Długość: maksymalnie 6 zdań treści.
6. Język: polski, naturalny.
7. Struktura: powitanie, wskazanie faktury (numer, kwota, termin),
   łagodna prośba o sprawdzenie, otwartość na kontakt, pozdrowienia z imieniem nadawcy.
8. NIE wymyślaj faktów. Używaj tylko danych z kontekstu.

Zwróć ODPOWIEDŹ jako czysty JSON, bez markdown, bez fence'ów:
{"subject":"...","body":"..."}`;

function buildUserPrompt(invoice, fromName, tone, daysOverdue) {
  return `Wygeneruj grzeczne przypomnienie:

NADAWCA: ${fromName}
TON: ${tone || 'neutral'}

DŁUŻNIK: ${invoice.clientName || 'Klient'}

FAKTURA:
- Numer: ${invoice.number}
- Kwota brutto: ${formatPLN(invoice.amountGross)}
- Termin płatności: ${formatDate(invoice.dueDate)}
- Dni po terminie: ${daysOverdue}
- Opis: ${invoice.description || 'usługa'}

Napisz przypomnienie zgodne z zasadami systemowymi.`;
}

function parseDraftJson(raw) {
  let t = (raw || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const p = JSON.parse(t);
    if (p && typeof p.subject === 'string' && typeof p.body === 'string') return p;
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
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error('Anthropic HTTP ' + r.status);
  const data = await r.json();
  return data?.content?.[0]?.text || '';
}

// Generuje draft Poziomu 1: 2 próby AI + walidacja, w razie porażki — safe template.
async function generateDraft(invoice, fromName, tone) {
  const daysOverdue = Math.max(1, daysOverdueOf(invoice));
  const userPrompt = buildUserPrompt(invoice, fromName, tone, daysOverdue);
  let lastViolation = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callAnthropic(SYSTEM_PROMPT, userPrompt);
      const parsed = parseDraftJson(raw);
      if (!parsed) { lastViolation = 'parse_error'; continue; }
      const v = validateLvl1(parsed.subject + '\n' + parsed.body);
      if (!v.ok) { lastViolation = v.violation; continue; }
      return { subject: parsed.subject.slice(0, 200), body: parsed.body.slice(0, 4000), usedFallback: false };
    } catch (e) {
      lastViolation = 'ai_error:' + e.message;
    }
  }
  const fb = safeTemplate(invoice, fromName, daysOverdue);
  return { ...fb, usedFallback: true, fallbackReason: lastViolation };
}

// ── Wysyłka e-mail (Resend) ──
async function sendEmail({ to, subject, body, replyTo }) {
  if (DEBUG) return 'debug-mode';
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Brak RESEND_API_KEY');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      from: 'Dokumo <noreply@dokumoflow.com>',
      to,
      subject,
      text: body,
      reply_to: replyTo || undefined,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error('Resend HTTP ' + r.status);
  const data = await r.json();
  return data?.id || null;
}

// ── Audit log ──
async function logHistory(uid, entry) {
  try {
    await db.collection('users').doc(uid).collection('dunningHistory').add({
      ...entry,
      userId: uid,
      timestamp: Timestamp.now(),
    });
  } catch (e) {
    console.error('dunningHistory write failed:', e.message);
  }
}

// ── Monitor: dla jednego usera generuje propozycje Poziomu 1 ──
async function monitorUser(uid, fromName, tone) {
  const summary = { generated: 0, skipped: 0, failed: 0 };
  const invSnap = await db.collection('users').doc(uid).collection('invoices').get();

  for (const docSnap of invSnap.docs) {
    const invoice = { id: docSnap.id, ...docSnap.data() };
    const ladder = invoice.dunningLadderState || { currentLevel: 0 };

    if (!invoice.dunningEnabled) { summary.skipped++; continue; }
    if (invoice.status === 'paid' || invoice.status === 'cancelled') { summary.skipped++; continue; }
    if (ladder.isDisputed) { summary.skipped++; continue; }
    if (ladder.pausedUntil && ladder.pausedUntil.toMillis?.() > Date.now()) { summary.skipped++; continue; }
    if ((ladder.currentLevel || 0) >= 1) { summary.skipped++; continue; } // Faza A: tylko Poziom 1

    const daysOverdue = daysOverdueOf(invoice);
    if (daysOverdue < 1) { summary.skipped++; continue; }

    // Czy istnieje już pending action dla tej faktury?
    const existing = await db.collection('users').doc(uid).collection('dunningActions')
      .where('invoiceId', '==', invoice.id).where('status', '==', 'pending').limit(1).get();
    if (!existing.empty) { summary.skipped++; continue; }

    // Oznacz fakturę jako przeterminowaną (informacyjnie)
    if (invoice.status !== 'overdue') {
      await docSnap.ref.update({ status: 'overdue', updatedAt: Timestamp.now() }).catch(() => {});
    }

    if (!invoice.clientEmail) {
      await db.collection('users').doc(uid).collection('dunningActions').add({
        invoiceId: invoice.id, invoiceNumber: invoice.number,
        clientName: invoice.clientName || '', clientEmail: '',
        amountGross: invoice.amountGross || 0, daysOverdue,
        proposedLevel: 1, status: 'failed', error: 'no_email',
        generatedAt: Timestamp.now(),
      });
      await logHistory(uid, { invoiceId: invoice.id, level: 1, action: 'failed',
        metadata: { daysOverdue, amountGross: invoice.amountGross || 0, toEmail: '' } });
      summary.failed++;
      continue;
    }

    try {
      const draft = await generateDraft(invoice, fromName, tone);
      await db.collection('users').doc(uid).collection('dunningActions').add({
        invoiceId: invoice.id, invoiceNumber: invoice.number,
        clientName: invoice.clientName || '', clientEmail: invoice.clientEmail,
        amountGross: invoice.amountGross || 0, daysOverdue,
        proposedLevel: 1,
        proposedDraft: {
          subject: draft.subject, body: draft.body,
          toEmail: invoice.clientEmail, fromName,
        },
        usedFallback: draft.usedFallback || false,
        status: 'pending',
        generatedAt: Timestamp.now(),
      });
      await logHistory(uid, { invoiceId: invoice.id, level: 1,
        action: draft.usedFallback ? 'generated_fallback' : 'generated',
        draftText: draft.subject + '\n\n' + draft.body,
        metadata: { daysOverdue, amountGross: invoice.amountGross || 0, toEmail: invoice.clientEmail } });
      summary.generated++;
    } catch (e) {
      await logHistory(uid, { invoiceId: invoice.id, level: 1, action: 'generation_failed',
        metadata: { daysOverdue, amountGross: invoice.amountGross || 0, toEmail: invoice.clientEmail || '', error: e.message } });
      summary.failed++;
    }
  }
  return summary;
}

// ─────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dokumoflow.com');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query?.action || req.body?.action || '').toString();

  try {
    // ── Cron (opcjonalny): monitor wszystkich flagged userów ──
    if (action === 'monitor' && req.headers['x-cron-secret']) {
      if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Bad cron secret' });
      }
      const usersSnap = await db.collection('users').where('featureFlags.dunning', '==', true).limit(200).get();
      let totals = { users: 0, generated: 0, skipped: 0, failed: 0 };
      for (const u of usersSnap.docs) {
        const d = u.data() || {};
        const fromName = d?.dunningPreferences?.fromName || 'Zespół';
        const tone = d?.dunningPreferences?.tone || 'neutral';
        const s = await monitorUser(u.id, fromName, tone);
        totals.users++; totals.generated += s.generated; totals.skipped += s.skipped; totals.failed += s.failed;
      }
      return res.status(200).json({ ok: true, debug: DEBUG, ...totals });
    }

    // ── Wszystkie pozostałe akcje: wymagają flagi ──
    const { uid, email, name, userDoc } = await verifyFlagged(req);
    const fromName = userDoc?.dunningPreferences?.fromName || name || (email ? email.split('@')[0] : 'Zespół');
    const tone = userDoc?.dunningPreferences?.tone || 'neutral';
    const col = (n) => db.collection('users').doc(uid).collection(n);

    // ── GET: lista propozycji ──
    if (req.method === 'GET' && action === 'list') {
      const snap = await col('dunningActions').where('status', '==', 'pending').limit(100).get();
      const actions = snap.docs.map(d => {
        const x = d.data();
        return {
          id: d.id, invoiceId: x.invoiceId, invoiceNumber: x.invoiceNumber,
          clientName: x.clientName, clientEmail: x.clientEmail,
          amountGross: x.amountGross, daysOverdue: x.daysOverdue,
          proposedLevel: x.proposedLevel, usedFallback: x.usedFallback || false,
          draft: x.proposedDraft || null,
          generatedAt: x.generatedAt?.toDate?.()?.toISOString() || null,
        };
      }).sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''));
      return res.status(200).json({ actions, debug: DEBUG });
    }

    // ── GET: lista faktur ──
    if (req.method === 'GET' && action === 'invoices') {
      const snap = await col('invoices').orderBy('createdAt', 'desc').limit(100).get();
      const invoices = snap.docs.map(d => {
        const x = d.data();
        return {
          id: d.id, number: x.number, clientName: x.clientName, clientEmail: x.clientEmail,
          amountGross: x.amountGross, status: x.status,
          issueDate: x.issueDate?.toDate?.()?.toISOString() || null,
          dueDate: x.dueDate?.toDate?.()?.toISOString() || null,
          daysOverdue: daysOverdueOf(x),
          dunningLevel: x.dunningLadderState?.currentLevel || 0,
        };
      });
      return res.status(200).json({ invoices });
    }

    // ── GET: dokumenty biznesowe — TYLKO faktury i umowy zlecenie ──
    if (req.method === 'GET' && action === 'documents') {
      const snap = await db.collection('users').doc(uid).collection('documents')
        .orderBy('createdAt', 'desc').limit(200).get();
      const documents = [];
      for (const d of snap.docs) {
        const e = enrichDoc(d.id, d.data());
        if (e) documents.push(e);
      }
      let remindersSent = null;
      try {
        remindersSent = (await db.collection('users').doc(uid).collection('dunningHistory')
          .where('action', '==', 'reminder_sent').count().get()).data().count;
      } catch { remindersSent = null; }
      return res.status(200).json({ documents, remindersSent, debug: DEBUG });
    }

    // ── GET: ustawienia nadawcy i szablony ──
    if (req.method === 'GET' && action === 'settings') {
      const prefs = userDoc?.dunningPreferences || {};
      return res.status(200).json({
        settings: { fromName: prefs.fromName || '', templates: prefs.templates || {} },
        defaults: DEFAULT_TEMPLATES,
        placeholders: TEMPLATE_PLACEHOLDERS,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Metoda niedozwolona' });

    // ── POST: utwórz testową fakturę ──
    if (action === 'invoice-create') {
      const b = req.body || {};
      if (!b.number || !b.clientName) return res.status(400).json({ error: 'Wymagane: number, clientName' });
      const amountGross = Math.round((parseFloat(b.amountZl) || 0) * 100);
      if (amountGross <= 0) return res.status(400).json({ error: 'Nieprawidłowa kwota' });
      const ref = col('invoices').doc();
      await ref.set({
        number: String(b.number).slice(0, 60),
        clientName: String(b.clientName).slice(0, 200),
        clientEmail: (b.clientEmail || '').toString().slice(0, 200).trim(),
        description: (b.description || '').toString().slice(0, 1000),
        amountGross,
        currency: 'PLN',
        issueDate: b.issueDate ? Timestamp.fromDate(new Date(b.issueDate)) : Timestamp.now(),
        dueDate: b.dueDate ? Timestamp.fromDate(new Date(b.dueDate)) : Timestamp.now(),
        status: 'sent',
        dunningEnabled: true,
        dunningLadderState: { currentLevel: 0, isDisputed: false },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return res.status(200).json({ ok: true, id: ref.id });
    }

    // ── POST: monitor (dla zalogowanego usera) ──
    if (action === 'monitor') {
      const s = await monitorUser(uid, fromName, tone);
      return res.status(200).json({ ok: true, debug: DEBUG, ...s });
    }

    // ── POST: wygeneruj draft ponownie ("Inny ton") ──
    if (action === 'draft') {
      const { invoiceId, regenerateActionId } = req.body || {};
      if (!invoiceId) return res.status(400).json({ error: 'Brak invoiceId' });
      const invSnap = await col('invoices').doc(invoiceId).get();
      if (!invSnap.exists) return res.status(404).json({ error: 'Faktura nie istnieje' });
      const invoice = { id: invSnap.id, ...invSnap.data() };
      const draft = await generateDraft(invoice, fromName, req.body?.tone || tone);

      if (regenerateActionId) {
        const aRef = col('dunningActions').doc(regenerateActionId);
        const aSnap = await aRef.get();
        if (aSnap.exists && aSnap.data().status === 'pending') {
          await aRef.update({
            'proposedDraft.subject': draft.subject,
            'proposedDraft.body': draft.body,
            usedFallback: draft.usedFallback || false,
          });
        }
      }
      await logHistory(uid, { invoiceId, level: 1, action: 'regenerated',
        draftText: draft.subject + '\n\n' + draft.body,
        metadata: { daysOverdue: daysOverdueOf(invoice), amountGross: invoice.amountGross || 0, toEmail: invoice.clientEmail || '' } });
      return res.status(200).json({ ok: true, draft });
    }

    // ── POST: wyślij (po akceptacji) ──
    if (action === 'send') {
      const { actionId, finalSubject, finalBody, finalToEmail } = req.body || {};
      if (!actionId) return res.status(400).json({ error: 'Brak actionId' });
      const aRef = col('dunningActions').doc(actionId);
      const aSnap = await aRef.get();
      if (!aSnap.exists) return res.status(404).json({ error: 'Akcja nie istnieje' });
      const act = aSnap.data();
      if (act.status !== 'pending') return res.status(409).json({ error: 'Akcja nie jest oczekująca' });

      const subject = (finalSubject || act.proposedDraft?.subject || '').toString().slice(0, 200);
      const body = (finalBody || act.proposedDraft?.body || '').toString().slice(0, 4000);
      const toEmail = (finalToEmail || act.proposedDraft?.toEmail || '').toString().trim();
      if (!toEmail) return res.status(400).json({ error: 'Brak adresu e-mail' });

      // Re-walidacja czarnej listy (user mógł edytować)
      const v = validateLvl1(subject + '\n' + body);
      if (!v.ok) return res.status(400).json({ error: 'Treść zawiera niedozwolony zwrot: ' + v.violation });

      const edited = (finalSubject !== undefined || finalBody !== undefined || finalToEmail !== undefined);
      let messageId = null;
      try {
        messageId = await sendEmail({ to: toEmail, subject, body, replyTo: email });
      } catch (e) {
        await aRef.update({ status: 'failed', error: e.message, reviewedAt: Timestamp.now() });
        await logHistory(uid, { invoiceId: act.invoiceId, level: 1, action: 'failed',
          metadata: { daysOverdue: act.daysOverdue || 0, amountGross: act.amountGross || 0, toEmail, error: e.message } });
        return res.status(502).json({ error: 'Wysyłka nie powiodła się: ' + e.message });
      }

      await aRef.update({
        status: edited ? 'edited_sent' : 'sent',
        finalSentText: subject + '\n\n' + body,
        sentMessageId: messageId,
        reviewedAt: Timestamp.now(),
        reviewedBy: uid,
      });
      await col('invoices').doc(act.invoiceId).update({
        'dunningLadderState.currentLevel': 1,
        'dunningLadderState.lastActionAt': Timestamp.now(),
        updatedAt: Timestamp.now(),
      }).catch(() => {});
      await logHistory(uid, { invoiceId: act.invoiceId, level: 1,
        action: edited ? 'edited' : 'sent',
        sentText: subject + '\n\n' + body,
        metadata: { daysOverdue: act.daysOverdue || 0, amountGross: act.amountGross || 0, toEmail, messageId } });
      return res.status(200).json({ ok: true, messageId, debug: DEBUG });
    }

    // ── POST: pomiń propozycję ──
    if (action === 'skip') {
      const { actionId, reason } = req.body || {};
      if (!actionId) return res.status(400).json({ error: 'Brak actionId' });
      const aRef = col('dunningActions').doc(actionId);
      const aSnap = await aRef.get();
      if (!aSnap.exists) return res.status(404).json({ error: 'Akcja nie istnieje' });
      await aRef.update({ status: 'skipped', reviewedAt: Timestamp.now(), reviewedBy: uid });
      await logHistory(uid, { invoiceId: aSnap.data().invoiceId, level: 1, action: 'skipped',
        metadata: { reason: reason || '', amountGross: aSnap.data().amountGross || 0,
                    daysOverdue: aSnap.data().daysOverdue || 0, toEmail: aSnap.data().clientEmail || '' } });
      return res.status(200).json({ ok: true });
    }

    // ── POST: odłóż fakturę (snooze) ──
    if (action === 'snooze') {
      const { invoiceId, untilDays, reason } = req.body || {};
      if (!invoiceId) return res.status(400).json({ error: 'Brak invoiceId' });
      const days = Math.max(1, Math.min(180, parseInt(untilDays) || 7));
      const until = Timestamp.fromMillis(Date.now() + days * DAY);
      await col('invoices').doc(invoiceId).update({
        'dunningLadderState.pausedUntil': until,
        'dunningLadderState.pausedReason': (reason || '').toString().slice(0, 300),
        updatedAt: Timestamp.now(),
      });
      const pend = await col('dunningActions').where('invoiceId', '==', invoiceId).where('status', '==', 'pending').get();
      for (const d of pend.docs) await d.ref.update({ status: 'skipped', reviewedAt: Timestamp.now() });
      await logHistory(uid, { invoiceId, level: 0, action: 'snoozed',
        metadata: { untilDays: days, reason: reason || '' } });
      return res.status(200).json({ ok: true, pausedUntil: until.toDate().toISOString() });
    }

    // ── POST: oznacz fakturę jako zapłaconą ──
    if (action === 'mark-paid') {
      const { invoiceId } = req.body || {};
      if (!invoiceId) return res.status(400).json({ error: 'Brak invoiceId' });
      await col('invoices').doc(invoiceId).update({
        status: 'paid', paidAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
      const pend = await col('dunningActions').where('invoiceId', '==', invoiceId).where('status', '==', 'pending').get();
      for (const d of pend.docs) await d.ref.update({ status: 'skipped', reviewedAt: Timestamp.now() });
      await logHistory(uid, { invoiceId, level: 0, action: 'marked_paid', metadata: {} });
      return res.status(200).json({ ok: true });
    }

    // ── POST: ustaw/zmień termin i odbiorcę dokumentu ──
    if (action === 'set-deadline') {
      const { docId, dueDate, recipientEmail } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      const update = { updatedAt: Timestamp.now() };
      if (dueDate !== undefined) {
        update.dueDate = dueDate ? Timestamp.fromDate(new Date(dueDate)) : null;
      }
      if (recipientEmail !== undefined) {
        update.recipientEmail = (recipientEmail || '').toString().slice(0, 200).trim();
      }
      try {
        await db.collection('users').doc(uid).collection('documents').doc(docId).update(update);
      } catch (e) {
        return res.status(404).json({ error: 'Dokument nie istnieje' });
      }
      return res.status(200).json({ ok: true });
    }

    // ── POST: wyślij dokument e-mailem (z podglądem treści) ──
    if (action === 'send-document') {
      const { docId, toEmail, note } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      const dEmail = (toEmail || '').toString().trim();
      if (!dEmail) return res.status(400).json({ error: 'Brak adresu e-mail' });

      const dRef = db.collection('users').doc(uid).collection('documents').doc(docId);
      const dSnap = await dRef.get();
      if (!dSnap.exists) return res.status(404).json({ error: 'Dokument nie istnieje' });
      const doc = dSnap.data();
      const docName = doc.name || 'Dokument';
      const noteText = (note || '').toString().slice(0, 1000);
      const body = (noteText ? noteText + '\n\n――――――\n\n' : '')
        + (doc.text || '(dokument nie zawiera treści tekstowej)');

      let messageId = null;
      try {
        messageId = await sendEmail({ to: dEmail, subject: docName, body, replyTo: email });
      } catch (e) {
        return res.status(502).json({ error: 'Wysyłka nie powiodła się: ' + e.message });
      }

      await dRef.update({ lastSentAt: Timestamp.now(), recipientEmail: dEmail }).catch(() => {});
      await logHistory(uid, {
        invoiceId: docId, level: 0, action: 'document_sent',
        metadata: { toEmail: dEmail, messageId, docName },
      });
      return res.status(200).json({ ok: true, messageId, debug: DEBUG });
    }

    // ── POST: podgląd szablonu przypomnienia (stała treść, bez AI) ──
    if (action === 'reminder-preview') {
      const { docId, level } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      const dSnap = await db.collection('users').doc(uid).collection('documents').doc(docId).get();
      if (!dSnap.exists) return res.status(404).json({ error: 'Dokument nie istnieje' });
      const e = enrichDoc(docId, dSnap.data());
      if (!e) return res.status(400).json({ error: 'Nieobsługiwany typ dokumentu' });
      const suggested = suggestLevel(e.dueDate);
      const lvl = REMINDER_LEVELS.includes(level) ? level : suggested;
      const tpl = buildReminder(lvl, e, fromName, userDoc?.dunningPreferences);
      return res.status(200).json({
        ...tpl, level: lvl, suggested, toEmail: e.recipientEmail, paid: e.paid,
        levels: REMINDER_LEVELS.map(l => ({ id: l, label: REMINDER_LABEL[l] })),
      });
    }

    // ── POST: wyślij przypomnienie wg szablonu ──
    if (action === 'send-reminder') {
      const { docId, level, subject, body, toEmail } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      const dEmail = (toEmail || '').toString().trim();
      if (!dEmail) return res.status(400).json({ error: 'Brak adresu e-mail' });
      const lvl = REMINDER_LEVELS.includes(level) ? level : 'po1';

      const dRef = db.collection('users').doc(uid).collection('documents').doc(docId);
      const dSnap = await dRef.get();
      if (!dSnap.exists) return res.status(404).json({ error: 'Dokument nie istnieje' });
      const e = enrichDoc(docId, dSnap.data());
      if (!e) return res.status(400).json({ error: 'Nieobsługiwany typ dokumentu' });
      if (e.paid) return res.status(409).json({ error: 'Dokument oznaczony jako zapłacony' });

      const tpl = buildReminder(lvl, e, fromName, userDoc?.dunningPreferences);
      const finalSubject = (subject || tpl.subject).toString().slice(0, 200);
      const finalBody = (body || tpl.body).toString().slice(0, 5000);

      let messageId = null;
      try {
        messageId = await sendEmail({ to: dEmail, subject: finalSubject, body: finalBody, replyTo: email });
      } catch (err) {
        return res.status(502).json({ error: 'Wysyłka nie powiodła się: ' + err.message });
      }

      await dRef.update({
        lastSentAt: Timestamp.now(), recipientEmail: dEmail, lastReminderLevel: lvl,
      }).catch(() => {});
      await logHistory(uid, {
        invoiceId: docId, level: REMINDER_LEVEL_NUM[lvl], action: 'reminder_sent',
        sentText: finalSubject + '\n\n' + finalBody,
        metadata: { toEmail: dEmail, messageId, template: lvl },
      });
      return res.status(200).json({ ok: true, messageId, debug: DEBUG, level: lvl });
    }

    // ── POST: oznacz dokument jako zapłacony / cofnij ──
    if (action === 'mark-doc-paid') {
      const { docId, paid } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      const isPaid = paid !== false;
      try {
        await db.collection('users').doc(uid).collection('documents').doc(docId).update({
          paid: isPaid,
          paidAt: isPaid ? Timestamp.now() : null,
          updatedAt: Timestamp.now(),
        });
      } catch (e) {
        return res.status(404).json({ error: 'Dokument nie istnieje' });
      }
      await logHistory(uid, {
        invoiceId: docId, level: 0,
        action: isPaid ? 'doc_marked_paid' : 'doc_marked_unpaid', metadata: {},
      });
      return res.status(200).json({ ok: true, paid: isPaid });
    }

    // ── POST: historia akcji dla dokumentu ──
    if (action === 'doc-history') {
      const { docId } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      const snap = await db.collection('users').doc(uid).collection('dunningHistory')
        .where('invoiceId', '==', docId).limit(50).get();
      const entries = snap.docs.map(d => {
        const x = d.data();
        return {
          action: x.action,
          level: x.level,
          timestamp: x.timestamp?.toDate?.()?.toISOString() || null,
          template: x.metadata?.template || null,
          toEmail: x.metadata?.toEmail || null,
        };
      }).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      return res.status(200).json({ entries });
    }

    // ── POST: zapisz ustawienia nadawcy i szablony ──
    if (action === 'save-settings') {
      const b = req.body || {};
      const prefs = { fromName: (b.fromName || '').toString().slice(0, 120).trim() };
      const templates = {};
      const inTpl = b.templates || {};
      for (const lvl of REMINDER_LEVELS) {
        const t = inTpl[lvl];
        if (!t) continue;
        const subject = (t.subject || '').toString().slice(0, 300);
        const body = (t.body || '').toString().slice(0, 5000);
        const def = DEFAULT_TEMPLATES[lvl];
        // Jeśli identyczne z domyślnym — nie zapisujemy (szablon będzie podążał za domyślnym).
        if (subject === def.subject && body === def.body) continue;
        if (subject || body) templates[lvl] = { subject, body };
      }
      prefs.templates = templates;
      await db.collection('users').doc(uid).set({ dunningPreferences: prefs }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Nieznana akcja: ' + action });

  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
