import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes } from 'crypto';

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

// Bumpujemy limit body do 6 MB — endpoint OCR przyjmuje pliki w base64.
export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };

// ── OCR: ekstrakcja pól z dokumentu (PDF lub obraz) przez Anthropic ──
async function callAnthropicOCR({ base64Data, mediaType, fields }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Brak ANTHROPIC_API_KEY');

  const fieldsList = fields.map(f => `- ${f.key}: ${f.label}`).join('\n');
  const systemPrompt = `Jesteś precyzyjnym systemem ekstrakcji danych z dokumentów. Wyciągasz konkretne pola z dokumentu i zwracasz je jako JSON.

ZASADY:
- Zwróć WYŁĄCZNIE poprawny JSON, bez markdown, bez fence'ów
- Dla każdego pola: value (dokładnie tak jak w dokumencie, albo pusty string jeśli brak) i confidence (0-100 — Twoja pewność)
- Nie zmyślaj. Brak danych = pusty string z confidence 0
- Normalizuj: PESEL 11 cyfr bez spacji. NIP 10 cyfr bez kresek. Telefon: same cyfry, opcjonalnie z +48. IBAN bez spacji
- Daty: format ISO YYYY-MM-DD gdy możliwe
- Język dokumentu: polski

FORMAT WYJŚCIA (ścisły JSON):
{"fields":{"klucz_pola_1":{"value":"...","confidence":95},"klucz_pola_2":{"value":"","confidence":0}}}`;

  const userPrompt = `Wyciągnij te pola z dokumentu:
${fieldsList}

Zwróć JSON ze WSZYSTKIMI wypisanymi kluczami.`;

  let docContent;
  if (mediaType === 'application/pdf') {
    docContent = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } };
  } else if (mediaType.startsWith('image/')) {
    docContent = { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } };
  } else {
    throw new Error('Nieobsługiwany typ pliku: ' + mediaType);
  }

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: [docContent, { type: 'text', text: userPrompt }] }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) {
    let detail = '';
    try { detail = await r.text(); } catch {}
    throw new Error('Anthropic HTTP ' + r.status + (detail ? ': ' + detail.slice(0, 200) : ''));
  }
  const data = await r.json();
  const raw = data?.content?.[0]?.text || '';
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
}

function err(status, message) { return Object.assign(new Error(message), { status }); }

// ─────────────────────────────────────────────────────────────────────────
// Rate limiting — in-memory sliding window per Lambda instance.
// Best-effort: cold starts resetuja licznik, ale 1 instancja tlumi 99% spamu
// z jednego zrodla. Dla OCR (kosztowne wywolania Anthropic) dodatkowo
// twardy lifetime cap przez Firestore (ocrUsedFree dla free).
// ─────────────────────────────────────────────────────────────────────────
const _rateMap = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = _rateMap.get(key) || [];
  const recent = arr.filter(t => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  _rateMap.set(key, recent);
  if (_rateMap.size > 5000) {
    for (const [k, v] of _rateMap.entries()) {
      const r = v.filter(t => now - t < windowMs);
      if (r.length === 0) _rateMap.delete(k);
      else _rateMap.set(k, r);
    }
  }
  return true;
}
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return (Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
function rateLimitResponse(res, retryAfterSec) {
  res.setHeader('Retry-After', String(retryAfterSec));
  return res.status(429).json({ error: 'Zbyt wiele zapytan. Sprobuj ponownie za chwile.' });
}

// ── Dostęp: token + feature flag ──
async function verifyFlagged(req) {
  const ip = getClientIp(req);
  if (!rateLimit('auth-attempt:' + ip, 30, 60 * 1000)) {
    throw err(429, 'Zbyt wiele prob uwierzytelnienia. Sprobuj za chwile.');
  }
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) throw err(401, 'Brak tokenu');
  let decoded;
  try { decoded = await auth.verifyIdToken(token); }
  catch { throw err(401, 'Nieważny token'); }
  // Per-user request rate limit (after auth succeeds)
  if (!rateLimit('user-req:' + decoded.uid, 180, 60 * 1000)) {
    throw err(429, 'Zbyt wiele zapytan. Sprobuj za minute.');
  }
  const snap = await db.collection('users').doc(decoded.uid).get();
  const data = snap.exists ? (snap.data() || {}) : {};
  if (data?.featureFlags?.dunning !== true) throw err(403, 'feature_disabled');
  return { uid: decoded.uid, email: decoded.email || '', name: decoded.name || '', userDoc: data };
}

// ── Dostęp do Skanera dokumentów: ProMax bez limitu, free 3 darmowe ──
const OCR_FREE_LIMIT = 3;
async function getOcrAccess(uid) {
  const subSnap = await db.collection('users').doc(uid).collection('subscription').doc('current').get();
  if (subSnap.exists) {
    const data = subSnap.data() || {};
    const expMs = data.expiresAt?.toMillis?.() ?? (data.expiresAt ? new Date(data.expiresAt).getTime() : null);
    const active = !data.cancelled && (!expMs || expMs > Date.now());
    if (active && data.plan === 'promax') {
      return { tier: 'promax', limit: null, used: 0 };
    }
  }
  const uSnap = await db.collection('users').doc(uid).get();
  const used = (uSnap.exists ? (uSnap.data() || {}) : {}).ocrUsedFree || 0;
  return { tier: 'free', limit: OCR_FREE_LIMIT, used };
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
    body: 'Dzień dobry,\n\nUprzejmie przypominamy, że termin płatności dokumentu „{nazwa}" przypada na {termin}.\n\n{platnosc}\n\nProsimy o uregulowanie należności w terminie. Jeśli płatność została już zrealizowana, prosimy potraktować tę wiadomość jako bezprzedmiotową.\n\nMożesz potwierdzić odbiór tej wiadomości lub zadać pytanie pod linkiem: {link}\n\nPozdrawiamy,\n{nadawca}',
  },
  po1: {
    subject: 'Przypomnienie o zaległej płatności — {nazwa}',
    body: 'Dzień dobry,\n\nInformujemy, że minął termin płatności dokumentu „{nazwa}" (termin: {termin}), a wpłata nie została jeszcze odnotowana.\n\n{platnosc}\n\nProsimy o uregulowanie należności w najbliższym możliwym terminie. Jeśli płatność jest już w realizacji, dziękujemy i prosimy o zignorowanie tej wiadomości.\n\nMożesz potwierdzić odbiór wiadomości lub zadać pytanie tutaj: {link}\n\nPozdrawiamy,\n{nadawca}',
  },
  po2: {
    subject: 'Ponowne wezwanie do zapłaty — {nazwa}',
    body: 'Dzień dobry,\n\nPomimo wcześniejszego przypomnienia należność z dokumentu „{nazwa}" (termin płatności: {termin}) pozostaje nieuregulowana.\n\n{platnosc}\n\nProsimy o niezwłoczne dokonanie płatności. Jeśli wystąpiły przeszkody w jej realizacji, prosimy o kontakt w celu ustalenia rozwiązania.\n\nPotwierdź odbiór wiadomości lub napisz do nas tutaj: {link}\n\nPozdrawiamy,\n{nadawca}',
  },
  sad: {
    subject: 'Przedsądowe wezwanie do zapłaty — {nazwa}',
    body: 'Dzień dobry,\n\nNiniejszym wzywamy do zapłaty zaległej należności wynikającej z dokumentu „{nazwa}" (termin płatności: {termin}), która do dnia dzisiejszego nie została uregulowana.\n\n{platnosc}\n\nWyznaczamy ostateczny termin 7 dni od otrzymania niniejszej wiadomości na uregulowanie należności. Brak wpłaty w tym terminie może skutkować skierowaniem sprawy na drogę postępowania sądowego.\n\nPotwierdzenie odbioru oraz ewentualne pytania można złożyć pod linkiem: {link}\n\nLiczymy na polubowne rozwiązanie sprawy.\n\n{nadawca}',
  },
};
const TEMPLATE_PLACEHOLDERS = ['{nazwa}', '{termin}', '{kwota}', '{konto}', '{platnosc}', '{link}', '{nadawca}'];

// Buduje kontekst podstawień dla wzbogaconego dokumentu.
function tplCtx(e, fromName, linkUrl) {
  const due = e.dueDate ? new Date(e.dueDate).toLocaleDateString('pl-PL') : 'wskazany w dokumencie';
  const kwota = e.amount != null ? fmtAmount(e.amount, e.currency) : '';
  const konto = e.bankAccount || '';
  const payLines = [];
  if (kwota) payLines.push('Kwota do zapłaty: ' + kwota);
  if (konto) payLines.push('Numer konta: ' + konto);
  const platnosc = payLines.length ? 'Szczegóły płatności:\n' + payLines.join('\n') : '';
  return {
    nazwa: e.name || 'dokument',
    termin: due, kwota, konto, platnosc,
    link: linkUrl || '',
    nadawca: fromName || 'Zespół',
  };
}

// Podstawia placeholdery i czyści puste linie. Linie zawierające tylko pusty
// placeholder {link} są usuwane — żeby przy braku linku nie zostawała wisząca etykieta.
function fillTemplate(str, ctx) {
  let out = String(str || '')
    .replace(/\{nazwa\}/g, ctx.nazwa)
    .replace(/\{termin\}/g, ctx.termin)
    .replace(/\{kwota\}/g, ctx.kwota)
    .replace(/\{konto\}/g, ctx.konto)
    .replace(/\{platnosc\}/g, ctx.platnosc)
    .replace(/\{nadawca\}/g, ctx.nadawca);
  if (ctx.link) {
    out = out.replace(/\{link\}/g, ctx.link);
  } else {
    // Usuń całe linie ze wzmianką "link"/"tutaj"/"pod linkiem" + pusty {link}
    out = out.replace(/^.*\{link\}.*$\n?/gm, '');
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// Buduje wiadomość dla poziomu: szablon użytkownika lub domyślny, z podstawieniami.
function buildReminder(level, e, fromName, prefs, linkUrl) {
  const def = DEFAULT_TEMPLATES[level] || DEFAULT_TEMPLATES.po1;
  const custom = prefs?.templates?.[level];
  const tpl = (custom && (custom.subject || custom.body)) ? {
    subject: custom.subject || def.subject,
    body: custom.body || def.body,
  } : def;
  const ctx = tplCtx(e, fromName, linkUrl);
  return { subject: fillTemplate(tpl.subject, ctx), body: fillTemplate(tpl.body, ctx) };
}

// Zwraca publiczny link dokumentu — generuje token jeśli go jeszcze nie ma.
async function ensurePublicLink(docRef, docData) {
  if (docData.publicToken) {
    return 'https://dokumoflow.com/faktura-link.html?t=' + docData.publicToken;
  }
  const token = randomBytes(18).toString('base64url');
  await docRef.update({ publicToken: token, publicTokenCreatedAt: Timestamp.now() });
  docData.publicToken = token;
  return 'https://dokumoflow.com/faktura-link.html?t=' + token;
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
    // Fallback dla ręcznie dodanych faktur (bez fakDataJson) — bezpośrednie pola
    if (amount == null && typeof x.amount === 'number') amount = x.amount;
    if (!currency && x.currency) currency = x.currency;
    if (!bankAccount && x.bankAccount) bankAccount = x.bankAccount;
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
    selfReminderDays: Array.isArray(x.selfReminderDays) ? x.selfReminderDays : [],
    source: x.source || 'generated',
    publicToken: x.publicToken || null,
    publicUrl: x.publicToken ? 'https://dokumoflow.com/faktura-link.html?t=' + x.publicToken : null,
    publicOpens: x.publicOpens || 0,
    publicLastSeen: toIso(x.publicLastSeen),
    publicConfirmedAt: toIso(x.publicConfirmedAt),
    publicQuestion: x.publicQuestion ? {
      message: x.publicQuestion.message || '',
      at: x.publicQuestion.at?.toDate?.()?.toISOString() || null,
    } : null,
    hasUnreadQuestion: (() => {
      const qAt = x.publicQuestion?.at?.toMillis?.() ?? null;
      const qSeen = x.publicQuestionSeenAt?.toMillis?.() ?? null;
      return qAt != null && (qSeen == null || qAt > qSeen);
    })(),
    hasUnreadConfirmation: (() => {
      const cAt = x.publicConfirmedAt?.toMillis?.() ?? null;
      const cSeen = x.publicConfirmedSeenAt?.toMillis?.() ?? null;
      return cAt != null && (cSeen == null || cAt > cSeen);
    })(),
  };
}

// ── Umowy: typy, ekstrakcja terminu zakończenia, szablon przedłużenia ──
const CONTRACT_TYPES = {
  b2b: { label: 'Umowa B2B', icon: '💼' },
  zlecenie: { label: 'Umowa zlecenie', icon: '📑' },
  uop: { label: 'Umowa o pracę', icon: '📋' },
};

// Best-effort ekstrakcja daty zakończenia umowy z treści.
function extractEndDate(text) {
  if (!text) return null;
  const span = text.match(/\bod\b[\s\S]{0,40}?\bdo\b([\s\S]{0,30})/i);
  if (span) { const d = parseLooseDate(span[1]); if (d) return d; }
  const re = /(obowiązuje do|zawart[aey][^.]{0,40}do|termin\w* (?:zakończenia|obowiązywania)|data zakończenia|do dnia|na czas określony)/gi;
  let m;
  while ((m = re.exec(text))) {
    const d = parseLooseDate(text.slice(m.index, m.index + 120));
    if (d) return d;
  }
  return null;
}

// Wzbogaca umowę o termin zakończenia i e-mail (stałe pola lub best-effort z treści).
function enrichContract(id, x) {
  const meta = CONTRACT_TYPES[x.typeId || ''];
  if (!meta) return null;
  const toIso = v => v?.toDate?.()?.toISOString() || (v ? new Date(v).toISOString() : null);
  const text = x.text || '';
  let endDate = toIso(x.contractEndDate);
  let recipientEmail = x.recipientEmail || '';
  let autoEnd = false, autoEmail = false;
  if (!endDate) { const d = extractEndDate(text); if (d) { endDate = d.toISOString(); autoEnd = true; } }
  if (!recipientEmail) { const e = extractEmail(text); if (e) { recipientEmail = e; autoEmail = true; } }
  return {
    id, name: x.name || meta.label, typeId: x.typeId, catLabel: meta.label, icon: meta.icon,
    text, createdAt: toIso(x.createdAt), endDate, recipientEmail, autoEnd, autoEmail,
    lastSentAt: toIso(x.lastSentAt),
    selfReminderDays: Array.isArray(x.selfReminderDays) ? x.selfReminderDays : [],
    source: x.source || 'generated',
  };
}

// Szablon e-maila z propozycją przedłużenia umowy.
const EXTEND_DEFAULT = {
  subject: 'Propozycja przedłużenia umowy — {nazwa}',
  body: 'Dzień dobry,\n\nZwracamy uwagę, że umowa „{nazwa}" zbliża się do terminu zakończenia ({termin}). Zależy nam na dalszej współpracy i chcielibyśmy zaproponować jej przedłużenie na kolejny okres.\n\nProsimy o informację, czy są Państwo zainteresowani kontynuacją — chętnie ustalimy szczegóły i warunki.\n\nPozdrawiamy,\n{nadawca}',
};

function buildExtend(e, fromName) {
  const term = e.endDate ? new Date(e.endDate).toLocaleDateString('pl-PL') : 'wskazany w umowie';
  const ctx = { nazwa: e.name || 'umowa', termin: term, kwota: '', konto: '', platnosc: '', link: '', nadawca: fromName || 'Zespół' };
  return { subject: fillTemplate(EXTEND_DEFAULT.subject, ctx), body: fillTemplate(EXTEND_DEFAULT.body, ctx) };
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

// ── Samoprzypomnienia: dla każdego dokumentu z selfReminderDays wysyła mail do
// właściciela, gdy do terminu pozostaje dokładnie N dni. Idempotentne dzięki
// selfReminderSent (lista dni, na które już wysłano).
async function processSelfReminders(uid, ownerEmail) {
  if (!ownerEmail) return 0;
  const snap = await db.collection('users').doc(uid).collection('documents').limit(500).get();
  let sent = 0;
  for (const d of snap.docs) {
    const x = d.data();
    const days = Array.isArray(x.selfReminderDays) ? x.selfReminderDays : [];
    if (!days.length) continue;
    if (x.paid) continue;
    const deadlineMs = x.dueDate?.toMillis?.() ?? x.contractEndDate?.toMillis?.() ?? null;
    if (deadlineMs == null) continue;
    const diffDays = Math.ceil((deadlineMs - Date.now()) / DAY);
    const sentArr = Array.isArray(x.selfReminderSent) ? x.selfReminderSent : [];
    for (const N of days) {
      if (diffDays !== N) continue;
      if (sentArr.includes(N)) continue;
      const isContract = !!x.contractEndDate;
      const dStr = new Date(deadlineMs).toLocaleDateString('pl-PL');
      const docName = x.name || (isContract ? 'umowa' : 'dokument');
      const subject = isContract
        ? `Przypomnienie: „${docName}" — termin zakończenia za ${N} dni (${dStr})`
        : `Przypomnienie: „${docName}" — termin płatności za ${N} dni (${dStr})`;
      const body =
`To samoprzypomnienie z Twojego panelu biznesu w Dokumo.

Dokument: ${docName}
${isContract ? 'Termin zakończenia' : 'Termin płatności'}: ${dStr}
Pozostało: ${N} ${N === 1 ? 'dzień' : 'dni'}

Otwórz panel: https://dokumoflow.com/panel-biznes.html`;
      try {
        await sendEmail({ to: ownerEmail, subject, body });
        await d.ref.update({ selfReminderSent: [...sentArr, N] });
        sentArr.push(N);
        await logHistory(uid, {
          invoiceId: d.id, level: 0, action: 'self_reminder_sent',
          metadata: { daysBefore: N, toEmail: ownerEmail },
        });
        sent++;
      } catch (e) {
        console.error('self-reminder send failed:', e.message);
      }
    }
  }
  return sent;
}

// ── Monitor: dla jednego usera generuje propozycje Poziomu 1 ──
async function monitorUser(uid, fromName, tone) {
  const summary = { generated: 0, skipped: 0, failed: 0 };
  const invSnap = await db.collection('users').doc(uid).collection('invoices').limit(500).get();
  const pendingSnap = await db.collection('users').doc(uid).collection('dunningActions')
    .where('status', '==', 'pending').get();
  const pendingInvoiceIds = new Set(pendingSnap.docs.map((d) => d.data().invoiceId));

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
    if (pendingInvoiceIds.has(invoice.id)) { summary.skipped++; continue; }

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

    // ── Cron: codzienne samoprzypomnienia (wysyłka do właścicieli kont) ──
    // Vercel Cron przekazuje "Authorization: Bearer <CRON_SECRET>" gdy zmienna jest ustawiona.
    // Akceptujemy też custom header "x-cron-secret" (dla zewnętrznych cron-job.org itp.).
    const cronSecret = process.env.CRON_SECRET;
    const cronAuthed = cronSecret && (
      req.headers.authorization === 'Bearer ' + cronSecret ||
      req.headers['x-cron-secret'] === cronSecret
    );
    if (action === 'self-reminder-check' && cronAuthed) {
      const usersSnap = await db.collection('users').where('featureFlags.dunning', '==', true).limit(500).get();
      let processed = 0, totalSent = 0;
      for (const u of usersSnap.docs) {
        try {
          const auser = await auth.getUser(u.id);
          if (!auser.email) continue;
          totalSent += await processSelfReminders(u.id, auser.email);
          processed++;
        } catch (e) { /* skip */ }
      }
      return res.status(200).json({ ok: true, processed, sent: totalSent });
    }

    // ── Akcje publiczne (link tokenowy): bez auth, tylko weryfikacja tokenu ──
    if (action === 'public-invoice' || action === 'public-confirm' || action === 'public-question') {
      const ip = getClientIp(req);
      // Per-IP brake: GET (public-invoice) 120/min, write actions znacznie mniej
      const isWrite = action === 'public-confirm' || action === 'public-question';
      const limit = isWrite ? 10 : 120;
      const win = isWrite ? 60 * 60 * 1000 : 60 * 1000;
      if (!rateLimit('pub-ip:' + ip, limit, win)) return rateLimitResponse(res, isWrite ? 600 : 30);
      const t = (req.query?.t || req.body?.t || '').toString();
      if (!t || t.length < 12) return res.status(400).json({ error: 'Brak tokenu' });
      // Per-token rate limit (chroni przed enumeracja klikow)
      if (!rateLimit('pub-tok:' + t, isWrite ? 5 : 60, win)) return rateLimitResponse(res, isWrite ? 600 : 60);
      const snap = await db.collectionGroup('documents').where('publicToken', '==', t).limit(1).get();
      if (snap.empty) return res.status(404).json({ error: 'Nieprawidłowy lub wygasły link' });
      const docSnap = snap.docs[0];
      const data = docSnap.data();
      const ownerUid = docSnap.ref.parent.parent.id;

      if (action === 'public-invoice') {
        // bumper: liczba otworzeń + ostatni dostęp (fire-and-forget)
        docSnap.ref.update({
          publicOpens: (data.publicOpens || 0) + 1,
          publicLastSeen: Timestamp.now(),
        }).catch(() => {});
        let fromName = '';
        try {
          const us = await db.collection('users').doc(ownerUid).get();
          fromName = us.data()?.dunningPreferences?.fromName || '';
        } catch { /* ignore */ }
        const enriched = enrichDoc(docSnap.id, data);
        return res.status(200).json({
          ok: true,
          invoice: {
            name: enriched?.name || data.name || 'Dokument',
            amount: enriched?.amount ?? (typeof data.amount === 'number' ? data.amount : null),
            currency: enriched?.currency || data.currency || 'PLN',
            dueDate: enriched?.dueDate || data.dueDate?.toDate?.()?.toISOString() || null,
            bankAccount: enriched?.bankAccount || data.bankAccount || '',
            fromName,
            confirmed: !!data.publicConfirmedAt,
            confirmedAt: data.publicConfirmedAt?.toDate?.()?.toISOString() || null,
            hasQuestion: !!data.publicQuestion,
          },
        });
      }

      if (action === 'public-confirm') {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Wymagana metoda POST' });
        if (data.publicConfirmedAt) return res.status(200).json({ ok: true, alreadyConfirmed: true });
        await docSnap.ref.update({ publicConfirmedAt: Timestamp.now() });
        await logHistory(ownerUid, {
          invoiceId: docSnap.id, level: 0, action: 'link_confirmed',
          metadata: { docName: data.name || '' },
        });
        return res.status(200).json({ ok: true });
      }

      if (action === 'public-question') {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Wymagana metoda POST' });
        const msg = (req.body?.message || '').toString().slice(0, 2000).trim();
        if (!msg) return res.status(400).json({ error: 'Brak treści pytania' });
        await docSnap.ref.update({ publicQuestion: { message: msg, at: Timestamp.now() } });
        await logHistory(ownerUid, {
          invoiceId: docSnap.id, level: 0, action: 'link_question',
          metadata: { docName: data.name || '', preview: msg.slice(0, 200) },
        });
        return res.status(200).json({ ok: true });
      }
    }

    // ── Skaner dokumentów (OCR) — dostępny dla wszystkich zalogowanych, limit 3 dla free ──
    if (action === 'ocr-extract') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Wymagana metoda POST' });
      // Per-IP brake przed weryfikacja tokenu - chroni przed credential stuffing
      const ip = getClientIp(req);
      if (!rateLimit('ocr-ip:' + ip, 30, 60 * 60 * 1000)) return rateLimitResponse(res, 600);
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
      if (!token) return res.status(401).json({ error: 'Zaloguj się, aby korzystać ze skanera' });
      let decoded;
      try { decoded = await auth.verifyIdToken(token); }
      catch { return res.status(401).json({ error: 'Nieważny token logowania' }); }
      const uid = decoded.uid;
      // Per-uid limit: chroni nawet Pro Max przed skryptowym drenazem Anthropic
      // (30/godz, 100/dzien sliding window)
      if (!rateLimit('ocr-uid-h:' + uid, 30, 60 * 60 * 1000)) return rateLimitResponse(res, 600);
      if (!rateLimit('ocr-uid-d:' + uid, 100, 24 * 60 * 60 * 1000)) return rateLimitResponse(res, 3600);

      const { file, mediaType, fields } = req.body || {};
      if (!file || !mediaType) return res.status(400).json({ error: 'Brak pliku' });
      if (!Array.isArray(fields) || fields.length === 0) return res.status(400).json({ error: 'Wybierz przynajmniej 1 pole' });
      if (fields.length > 20) return res.status(400).json({ error: 'Maks. 20 pól na dokument' });
      const cleanFields = fields
        .filter(f => f && typeof f.key === 'string' && typeof f.label === 'string')
        .map(f => ({ key: f.key.slice(0, 60), label: f.label.slice(0, 120) }))
        .slice(0, 20);
      if (!cleanFields.length) return res.status(400).json({ error: 'Nieprawidłowe pola' });

      const access = await getOcrAccess(uid);
      if (access.tier === 'free' && access.used >= access.limit) {
        return res.status(402).json({
          error: 'limit_exceeded',
          message: `Wykorzystano ${access.used}/${access.limit} darmowych skanów. Pro Max odblokowuje bez limitu.`,
          used: access.used,
          limit: access.limit,
          tier: 'free',
          upgradeUrl: '/subskrypcja.html',
        });
      }

      try {
        const result = await callAnthropicOCR({ base64Data: file, mediaType, fields: cleanFields });
        let newUsed = access.used;
        if (access.tier === 'free') {
          await db.collection('users').doc(uid).set({
            ocrUsedFree: FieldValue.increment(1),
          }, { merge: true });
          newUsed = access.used + 1;
        }
        return res.status(200).json({
          ok: true,
          ...result,
          tier: access.tier,
          used: access.tier === 'free' ? newUsed : null,
          limit: access.limit,
          remaining: access.tier === 'free' ? Math.max(0, access.limit - newUsed) : null,
        });
      } catch (e) {
        return res.status(500).json({ error: 'Skan nie powiódł się: ' + e.message });
      }
    }

    // ── Pozostałe akcje (AI Windykator): wymagają flagi ──
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

    // ── GET: umowy (B2B, zlecenie, o pracę) z terminem zakończenia ──
    if (req.method === 'GET' && action === 'contracts') {
      const snap = await db.collection('users').doc(uid).collection('documents')
        .orderBy('createdAt', 'desc').limit(200).get();
      const contracts = [];
      for (const d of snap.docs) {
        const c = enrichContract(d.id, d.data());
        if (c) contracts.push(c);
      }
      return res.status(200).json({ contracts, debug: DEBUG });
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
      const { docId, dueDate, recipientEmail, selfReminderDays } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      const update = { updatedAt: Timestamp.now() };
      if (dueDate !== undefined) {
        update.dueDate = dueDate ? Timestamp.fromDate(new Date(dueDate)) : null;
      }
      if (recipientEmail !== undefined) {
        update.recipientEmail = (recipientEmail || '').toString().slice(0, 200).trim();
      }
      if (Array.isArray(selfReminderDays)) {
        update.selfReminderDays = selfReminderDays.filter(d => Number.isInteger(d) && d >= 0 && d <= 60).slice(0, 8);
        update.selfReminderSent = []; // reset historii wysyłek przy zmianie ustawień
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
      const dRef = db.collection('users').doc(uid).collection('documents').doc(docId);
      const dSnap = await dRef.get();
      if (!dSnap.exists) return res.status(404).json({ error: 'Dokument nie istnieje' });
      const data = dSnap.data();
      const e = enrichDoc(docId, data);
      if (!e) return res.status(400).json({ error: 'Nieobsługiwany typ dokumentu' });
      const suggested = suggestLevel(e.dueDate);
      const lvl = REMINDER_LEVELS.includes(level) ? level : suggested;
      const linkUrl = await ensurePublicLink(dRef, data);
      e.publicToken = data.publicToken; e.publicUrl = linkUrl;
      const tpl = buildReminder(lvl, e, fromName, userDoc?.dunningPreferences, linkUrl);
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
      const data = dSnap.data();
      const e = enrichDoc(docId, data);
      if (!e) return res.status(400).json({ error: 'Nieobsługiwany typ dokumentu' });
      if (e.paid) return res.status(409).json({ error: 'Dokument oznaczony jako zapłacony' });

      const linkUrl = await ensurePublicLink(dRef, data);
      e.publicToken = data.publicToken; e.publicUrl = linkUrl;
      const tpl = buildReminder(lvl, e, fromName, userDoc?.dunningPreferences, linkUrl);
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

    // ── POST: ustaw termin zakończenia / e-mail dla umowy ──
    if (action === 'set-contract') {
      const { docId, endDate, recipientEmail, selfReminderDays } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      const update = { updatedAt: Timestamp.now() };
      if (endDate !== undefined) {
        update.contractEndDate = endDate ? Timestamp.fromDate(new Date(endDate)) : null;
      }
      if (recipientEmail !== undefined) {
        update.recipientEmail = (recipientEmail || '').toString().slice(0, 200).trim();
      }
      if (Array.isArray(selfReminderDays)) {
        update.selfReminderDays = selfReminderDays.filter(d => Number.isInteger(d) && d >= 0 && d <= 60).slice(0, 8);
        update.selfReminderSent = [];
      }
      try {
        await db.collection('users').doc(uid).collection('documents').doc(docId).update(update);
      } catch (e) {
        return res.status(404).json({ error: 'Dokument nie istnieje' });
      }
      return res.status(200).json({ ok: true });
    }

    // ── POST: podgląd e-maila o przedłużenie umowy ──
    if (action === 'extend-preview') {
      const { docId } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      const dSnap = await db.collection('users').doc(uid).collection('documents').doc(docId).get();
      if (!dSnap.exists) return res.status(404).json({ error: 'Dokument nie istnieje' });
      const c = enrichContract(docId, dSnap.data());
      if (!c) return res.status(400).json({ error: 'Nieobsługiwany typ dokumentu' });
      const tpl = buildExtend(c, fromName);
      return res.status(200).json({ ...tpl, toEmail: c.recipientEmail });
    }

    // ── POST: wyślij e-mail z propozycją przedłużenia ──
    if (action === 'send-extend') {
      const { docId, subject, body, toEmail } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      const dEmail = (toEmail || '').toString().trim();
      if (!dEmail) return res.status(400).json({ error: 'Brak adresu e-mail' });

      const dRef = db.collection('users').doc(uid).collection('documents').doc(docId);
      const dSnap = await dRef.get();
      if (!dSnap.exists) return res.status(404).json({ error: 'Dokument nie istnieje' });
      const c = enrichContract(docId, dSnap.data());
      if (!c) return res.status(400).json({ error: 'Nieobsługiwany typ dokumentu' });

      const tpl = buildExtend(c, fromName);
      const finalSubject = (subject || tpl.subject).toString().slice(0, 200);
      const finalBody = (body || tpl.body).toString().slice(0, 5000);

      let messageId = null;
      try {
        messageId = await sendEmail({ to: dEmail, subject: finalSubject, body: finalBody, replyTo: email });
      } catch (err) {
        return res.status(502).json({ error: 'Wysyłka nie powiodła się: ' + err.message });
      }

      await dRef.update({ lastSentAt: Timestamp.now(), recipientEmail: dEmail }).catch(() => {});
      await logHistory(uid, {
        invoiceId: docId, level: 0, action: 'extension_sent',
        sentText: finalSubject + '\n\n' + finalBody,
        metadata: { toEmail: dEmail, messageId },
      });
      return res.status(200).json({ ok: true, messageId, debug: DEBUG });
    }

    // ── POST: dodaj własną fakturę / umowę ręcznie ──
    if (action === 'add-doc') {
      const KIND = {
        faktura: { typeId: 'faktura', catLabel: 'Faktura', icon: '🧾', cat: 'biznes' },
        zlecenie: { typeId: 'zlecenie', catLabel: 'Umowa zlecenie', icon: '📑', cat: 'hr' },
        b2b: { typeId: 'b2b', catLabel: 'Umowa B2B', icon: '💼', cat: 'hr' },
        uop: { typeId: 'uop', catLabel: 'Umowa o pracę', icon: '📋', cat: 'hr' },
      };
      const b = req.body || {};
      const meta = KIND[b.kind];
      if (!meta) return res.status(400).json({ error: 'Nieprawidłowy typ dokumentu' });
      if (!b.name) return res.status(400).json({ error: 'Brak nazwy dokumentu' });
      try {
        const cntSnap = await db.collection('users').doc(uid).collection('documents').count().get();
        if (cntSnap.data().count >= 500) return res.status(429).json({ error: 'Limit dokumentów osiągnięty' });
      } catch { /* ignore */ }
      const payload = {
        typeId: meta.typeId, catLabel: meta.catLabel, icon: meta.icon, cat: meta.cat,
        name: String(b.name).slice(0, 200),
        text: (b.text || '').toString().slice(0, 500000),
        source: 'manual',
        status: 'generated',
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      };
      if (b.recipientEmail) payload.recipientEmail = b.recipientEmail.toString().slice(0, 200).trim();
      if (b.kind === 'faktura') {
        if (b.dueDate) payload.dueDate = Timestamp.fromDate(new Date(b.dueDate));
        const amt = parseFloat(b.amount);
        if (!isNaN(amt) && amt > 0) payload.amount = amt;
        if (b.currency) payload.currency = String(b.currency).slice(0, 6);
        else if (!isNaN(amt) && amt > 0) payload.currency = 'PLN';
        if (b.bankAccount) payload.bankAccount = b.bankAccount.toString().slice(0, 100);
      } else {
        if (b.endDate) payload.contractEndDate = Timestamp.fromDate(new Date(b.endDate));
      }
      if (Array.isArray(b.selfReminderDays)) {
        payload.selfReminderDays = b.selfReminderDays.filter(d => Number.isInteger(d) && d >= 0 && d <= 60).slice(0, 8);
      }
      const ref = await db.collection('users').doc(uid).collection('documents').add(payload);
      return res.status(200).json({ ok: true, id: ref.id });
    }

    // ── POST: uruchom samoprzypomnienia dla bieżącego użytkownika (ręczny test) ──
    if (action === 'self-reminder-check') {
      if (!email) return res.status(400).json({ error: 'Brak e-maila konta' });
      const sent = await processSelfReminders(uid, email);
      return res.status(200).json({ ok: true, sent });
    }

    // ── POST: oznacz zdarzenia dokumentu (potwierdzenie, pytanie) jako przeczytane ──
    if (action === 'ack-doc-events') {
      const { docId } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      try {
        await db.collection('users').doc(uid).collection('documents').doc(docId).update({
          publicQuestionSeenAt: Timestamp.now(),
          publicConfirmedSeenAt: Timestamp.now(),
        });
      } catch { /* doc moze nie istniec - silent */ }
      return res.status(200).json({ ok: true });
    }

    // ── POST: wygeneruj (lub odbierz istniejący) publiczny link do dokumentu ──
    if (action === 'link') {
      const { docId } = req.body || {};
      if (!docId) return res.status(400).json({ error: 'Brak docId' });
      const dRef = db.collection('users').doc(uid).collection('documents').doc(docId);
      const dSnap = await dRef.get();
      if (!dSnap.exists) return res.status(404).json({ error: 'Dokument nie istnieje' });
      let token = dSnap.data().publicToken;
      if (!token) {
        token = randomBytes(18).toString('base64url');
        await dRef.update({ publicToken: token, publicTokenCreatedAt: Timestamp.now() });
      }
      return res.status(200).json({
        ok: true,
        token,
        url: 'https://dokumoflow.com/faktura-link.html?t=' + token,
      });
    }

    return res.status(400).json({ error: 'Nieznana akcja: ' + action });

  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
