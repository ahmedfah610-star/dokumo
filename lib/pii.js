// Wykrywanie wrażliwych danych osobowych (PII) w treści dokumentów.
// Używane do blokowania zapisu dokumentów zawierających PESEL do Firestore.

// Walidacja PESEL: checksuma + zakodowana data urodzenia.
// Format: YY MM DD XXX X(plec) X(checksuma).
// Miesiąc koduje stulecie: 01-12 (1900), 21-32 (2000), 41-52 (2100), 61-72 (2200), 81-92 (1800).
// Bez walidacji daty rozne losowe numery telefonow przypadkiem przechodza checksumie.
function isValidPesel(s) {
  if (!/^\d{11}$/.test(s)) return false;
  // Checksuma
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(s[i], 10) * w[i];
  if ((10 - (sum % 10)) % 10 !== parseInt(s[10], 10)) return false;
  // Walidacja miesiaca + dnia (eliminuje false-positivy typu numer telefonu)
  const yy = parseInt(s.slice(0, 2), 10);
  const mm = parseInt(s.slice(2, 4), 10);
  const dd = parseInt(s.slice(4, 6), 10);
  if (dd < 1 || dd > 31) return false;
  // Stulecia: 1900-1999=mm+0, 2000-2099=mm+20, 2100-2199=mm+40, 2200-2299=mm+60, 1800-1899=mm+80
  const validMonths = new Set();
  for (const offset of [0, 20, 40, 60, 80]) {
    for (let m = 1; m <= 12; m++) validMonths.add(m + offset);
  }
  if (!validMonths.has(mm)) return false;
  return true;
}

// Sprawdza czy podany string zawiera PESEL (z walidacją checksumy — eliminuje
// false-positivy typu 11-cyfrowe numery telefonów czy losowe liczby).
function containsPesel(text) {
  if (typeof text !== 'string' || !text) return false;
  // Pattern: cyfra + (cyfra/space/myslnik){9,16} + cyfra
  // Pokrywa formaty "12345678901", "123 456 78 901", "12345-67-89-012"
  const matches = text.match(/\d[\d\s\-]{9,16}\d/g);
  if (!matches) return false;
  for (const m of matches) {
    const digits = m.replace(/[\s\-]/g, '');
    if (digits.length === 11 && isValidPesel(digits)) return true;
  }
  return false;
}

// ── DOWOD OSOBISTY PL ────────────────────────────────────────────
// Format: 3 wielkie litery + 6 cyfr, pierwsza cyfra to checksum.
// Wagi: 7, 3, 1, 9, 7, 3, 1, 7, 3 (po konwersji liter na liczby A=10, B=11, ...)
function isValidDowod(s) {
  if (!/^[A-Z]{3}\d{6}$/.test(s)) return false;
  const weights = [7, 3, 1, 9, 7, 3, 1, 7, 3];
  const chars = s.split('');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    if (i === 3) continue; // pomin pole checksum
    const c = chars[i];
    const val = /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : parseInt(c, 10);
    const wi = i < 3 ? i : i - 1;
    sum += val * weights[wi];
  }
  return sum % 10 === parseInt(chars[3], 10);
}

function containsDowod(text) {
  if (typeof text !== 'string' || !text) return false;
  const matches = text.match(/\b[A-Z]{3}\d{6}\b/g);
  if (!matches) return false;
  return matches.some(isValidDowod);
}

// ── PASZPORT PL ───────────────────────────────────────────────────
// Format: 2 wielkie litery + 7 cyfr, trzecia cyfra (pozycja 3) to checksum.
// Wagi: 7, 3, 9, 1, 7, 3, 1, 7, 3
function isValidPassport(s) {
  if (!/^[A-Z]{2}\d{7}$/.test(s)) return false;
  const weights = [7, 3, 9, 1, 7, 3, 1, 7, 3];
  const chars = s.split('');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    if (i === 2) continue;
    const c = chars[i];
    const val = /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : parseInt(c, 10);
    sum += val * weights[i];
  }
  return sum % 10 === parseInt(chars[2], 10);
}

function containsPassport(text) {
  if (typeof text !== 'string' || !text) return false;
  const matches = text.match(/\b[A-Z]{2}\d{7}\b/g);
  if (!matches) return false;
  return matches.some(isValidPassport);
}

// ── NUMER KARTY KREDYTOWEJ (Luhn) ─────────────────────────────────
// 13-19 cyfr, walidacja Luhn algorithm. Eliminuje false-positivy.
function isValidCardLuhn(s) {
  if (!/^\d{13,19}$/.test(s)) return false;
  let sum = 0;
  let alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = parseInt(s[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function containsCard(text) {
  if (typeof text !== 'string' || !text) return false;
  // Format: 4 grupy po 4 cyfry oddzielone spacja/myslnikiem, lub 13-19 cyfr ciagiem
  const matches = text.match(/\b(?:\d[ \-]?){12,18}\d\b/g);
  if (!matches) return false;
  for (const m of matches) {
    const digits = m.replace(/[\s\-]/g, '');
    if (isValidCardLuhn(digits)) return true;
  }
  return false;
}

// Sprawdza wartosc (string lub obiekt) na obecnosc wrażliwych danych:
// PESEL, dowod osobisty, paszport, numer karty.
// Dla obiektow rekursywnie sprawdza wszystkie wartosci string.
export function hasSensitivePII(value) {
  if (value == null) return false;
  if (typeof value === 'string') {
    return containsPesel(value) || containsDowod(value) || containsPassport(value) || containsCard(value);
  }
  if (Array.isArray(value)) {
    for (const v of value) if (hasSensitivePII(v)) return true;
    return false;
  }
  if (typeof value === 'object') {
    for (const k of Object.keys(value)) if (hasSensitivePII(value[k])) return true;
    return false;
  }
  return false;
}

// Pomocnik: sprawdza string ktory moze byc JSON-em (cvDataJson itp.)
export function hasSensitivePIIInJson(maybeJsonStr) {
  if (typeof maybeJsonStr !== 'string' || !maybeJsonStr) return false;
  // Najpierw szybki test na surowym stringu
  if (containsPesel(maybeJsonStr)) return true;
  // Potem parse + recursive scan (dla JSON-ow gdzie cyfry sa zbite z polami)
  try {
    const parsed = JSON.parse(maybeJsonStr);
    return hasSensitivePII(parsed);
  } catch {
    return false;
  }
}

export { containsPesel, isValidPesel };
