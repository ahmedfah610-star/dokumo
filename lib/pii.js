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

// Sprawdza wartosc (string lub obiekt) na obecnosc wrażliwych danych.
// Dla obiektow rekursywnie sprawdza wszystkie wartosci string.
export function hasSensitivePII(value) {
  if (value == null) return false;
  if (typeof value === 'string') return containsPesel(value);
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
