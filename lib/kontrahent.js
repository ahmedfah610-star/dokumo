// ─────────────────────────────────────────────────────────────────────────
// Agent Weryfikacji Kontrahenta — logika (nie liczy się do limitu funkcji).
//
// Sprawdza firmę w oficjalnych rejestrach i zwraca ocenę ryzyka + dowód
// należytej staranności. Źródła:
//   • Biała Lista VAT (wl-api.mf.gov.pl) — status VAT, rachunki, KRS, REGON,
//     daty rejestracji/wykreślenia oraz requestId (urzędowy identyfikator
//     zapytania, który jest dowodem sprawdzenia w razie kontroli).
//   • VIES (ec.europa.eu) — ważność numeru VAT UE dla transakcji unijnych.
//
// DLACZEGO to ma znaczenie prawne: zapłata na rachunek spoza Białej Listy przy
// transakcji ≥15 000 zł oznacza brak kosztu podatkowego i solidarną
// odpowiedzialność za VAT kontrahenta. Sprawdzenie w dniu zapłaty chroni.
// ─────────────────────────────────────────────────────────────────────────

const WL_BASE = 'https://wl-api.mf.gov.pl/api';
const VIES_BASE = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms';
const PROG_PLATNOSCI = 15000; // próg z art. 19 Prawa przedsiębiorców

export function cleanNip(nip) {
  return String(nip || '').replace(/[\s\-.]/g, '');
}
export function validNip(nip) {
  const c = cleanNip(nip);
  if (!/^\d{10}$/.test(c)) return false;
  // suma kontrolna NIP
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((a, wi, i) => a + wi * Number(c[i]), 0);
  return sum % 11 === Number(c[9]);
}
export function cleanAccount(acc) {
  return String(acc || '').replace(/[\s\-]/g, '').toUpperCase().replace(/^PL/, '');
}
function titleCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}
function daysBetween(iso, now = Date.now()) {
  const t = Date.parse(iso);
  return isNaN(t) ? null : Math.floor((now - t) / 86400000);
}

// ── Pobranie podmiotu z Białej Listy na wskazany dzień ──
export async function fetchBialaLista(nip, dateIso) {
  const date = dateIso || new Date().toISOString().slice(0, 10);
  const r = await fetch(`${WL_BASE}/search/nip/${cleanNip(nip)}?date=${date}`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
  if (r.status === 404) return { found: false, date };
  if (!r.ok) {
    const err = new Error('Biała Lista niedostępna (' + r.status + ')');
    err.upstream = true; throw err;
  }
  const data = await r.json();
  const s = data?.result?.subject;
  if (!s) return { found: false, date };
  return {
    found: true, date,
    requestId: data?.result?.requestId || null,   // urzędowy dowód sprawdzenia
    subject: s,
  };
}

// ── VIES: ważność numeru VAT UE (nie blokuje wyniku, gdy usługa nie odpowiada) ──
export async function fetchVies(countryCode, vatNumber) {
  try {
    const r = await fetch(`${VIES_BASE}/${countryCode}/vat/${vatNumber}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return { available: false };
    const d = await r.json();
    return { available: true, valid: !!d.isValid, name: d.name || '', address: d.address || '' };
  } catch (_) { return { available: false }; }
}

// ── Ocena ryzyka: zamienia surowe dane rejestrowe na czytelne sygnały ──
export function ocenRyzyko(subject, opts = {}) {
  const { kwota = null, rachunek = null } = opts;
  const flags = [];
  const add = (poziom, kod, tytul, opis) => flags.push({ poziom, kod, tytul, opis });

  const status = subject.statusVat || 'Nieznany';

  if (subject.removalDate) {
    add('krytyczny', 'wykreslony', 'Wykreślony z rejestru VAT',
      `Podmiot został wykreślony ${subject.removalDate}${subject.removalBasis ? ' (' + subject.removalBasis + ')' : ''}. Nie odliczysz VAT z jego faktury.`);
  }
  if (status === 'Niezarejestrowany') {
    add('krytyczny', 'brak_vat', 'Nie jest czynnym podatnikiem VAT',
      'Podmiot nie figuruje jako zarejestrowany podatnik VAT. Faktura z VAT od takiego podmiotu nie daje prawa do odliczenia.');
  } else if (status === 'Zwolniony') {
    add('uwaga', 'vat_zwolniony', 'Podatnik zwolniony z VAT',
      'To nie jest błąd, ale taki podmiot nie powinien wystawiać faktur z naliczonym VAT.');
  } else if (status === 'Czynny') {
    add('ok', 'vat_czynny', 'Czynny podatnik VAT', 'Podmiot jest zarejestrowany jako czynny podatnik VAT.');
  }

  const konta = Array.isArray(subject.accountNumbers) ? subject.accountNumbers : [];
  if (!konta.length) {
    add('uwaga', 'brak_rachunku', 'Brak rachunku na Białej Liście',
      `Podmiot nie ma zgłoszonego rachunku. Przy płatności ≥ ${PROG_PLATNOSCI.toLocaleString('pl-PL')} zł nie zaliczysz jej do kosztów bez zgłoszenia ZAW-NR.`);
  }
  if (rachunek) {
    const rc = cleanAccount(rachunek);
    const zgodny = konta.some(k => cleanAccount(k) === rc);
    if (zgodny) {
      add('ok', 'rachunek_ok', 'Rachunek zgodny z Białą Listą',
        'Podany numer rachunku figuruje w wykazie — płatność jest bezpieczna podatkowo.');
    } else {
      const powyzejProgu = kwota == null || Number(kwota) >= PROG_PLATNOSCI;
      add(powyzejProgu ? 'krytyczny' : 'uwaga', 'rachunek_spoza_listy', 'Rachunek spoza Białej Listy',
        `Podany rachunek NIE figuruje w wykazie MF. ${powyzejProgu
          ? `Przy kwocie ≥ ${PROG_PLATNOSCI.toLocaleString('pl-PL')} zł grozi to utratą kosztu podatkowego i solidarną odpowiedzialnością za VAT. Zgłoś ZAW-NR w 7 dni albo zażądaj rachunku z wykazu.`
          : 'Poniżej progu 15 000 zł skutki podatkowe nie występują, ale zmiana rachunku bywa sygnałem oszustwa — potwierdź ją telefonicznie.'}`);
    }
  }
  if (subject.hasVirtualAccounts) {
    add('info', 'rachunek_wirtualny', 'Podmiot używa rachunków wirtualnych',
      'Rachunki wirtualne nie są publikowane pojedynczo. Zweryfikuj numer w wyszukiwarce MF po numerze rachunku.');
  }

  const wiek = subject.registrationLegalDate ? daysBetween(subject.registrationLegalDate) : null;
  if (wiek != null && wiek < 90) {
    add('uwaga', 'nowy_podmiot', 'Podmiot zarejestrowany niedawno',
      `Rejestracja VAT ${subject.registrationLegalDate} (${wiek} dni temu). Przy nowych kontrahentach rozważ przedpłatę lub krótszy termin płatności.`);
  }
  if (subject.registrationDenialDate) {
    add('krytyczny', 'odmowa_rejestracji', 'Odmowa rejestracji jako podatnik VAT',
      `Odmowa z ${subject.registrationDenialDate}${subject.registrationDenialBasis ? ' (' + subject.registrationDenialBasis + ')' : ''}.`);
  }

  const rank = { krytyczny: 3, uwaga: 2, info: 1, ok: 0 };
  const max = flags.reduce((m, f) => Math.max(m, rank[f.poziom] || 0), 0);
  const ocena = max === 3 ? 'wysokie' : max === 2 ? 'srednie' : 'niskie';
  const werdykt = {
    wysokie: 'Nie płać bez wyjaśnienia — wykryto poważne nieprawidłowości.',
    srednie: 'Można współpracować, ale zachowaj ostrożność i udokumentuj ustalenia.',
    niskie: 'Brak sygnałów ostrzegawczych w rejestrach publicznych.',
  }[ocena];
  return { ocena, werdykt, flagi: flags };
}

// ── Pełna weryfikacja: rejestry + ryzyko + dowód ──
export async function zweryfikuj(nip, opts = {}) {
  if (!validNip(nip)) return { ok: false, error: 'Nieprawidłowy NIP (błędna suma kontrolna lub długość)' };
  const bl = await fetchBialaLista(nip, opts.date);
  if (!bl.found) {
    return { ok: false, error: 'Nie znaleziono podmiotu o podanym NIP w wykazie MF', nip: cleanNip(nip) };
  }
  const s = bl.subject;
  const ryzyko = ocenRyzyko(s, opts);

  let vies = null;
  if (opts.vies) vies = await fetchVies('PL', cleanNip(nip));

  return {
    ok: true,
    nip: s.nip || cleanNip(nip),
    nazwa: titleCase(s.name || ''),
    adres: s.workingAddress || s.residenceAddress || '',
    statusVat: s.statusVat || 'Nieznany',
    regon: s.regon || null,
    krs: s.krs || null,
    rachunki: Array.isArray(s.accountNumbers) ? s.accountNumbers : [],
    reprezentanci: (s.representatives || []).map(r => r.companyName || `${r.firstName || ''} ${r.lastName || ''}`.trim()).filter(Boolean),
    dataRejestracji: s.registrationLegalDate || null,
    dataWykreslenia: s.removalDate || null,
    rachunkiWirtualne: !!s.hasVirtualAccounts,
    ...ryzyko,
    vies,
    // Dowód należytej staranności — do przechowania na wypadek kontroli.
    dowod: {
      zrodlo: 'Wykaz podatników VAT (Biała Lista) — Ministerstwo Finansów',
      requestId: bl.requestId,
      naDzien: bl.date,
      sprawdzono: new Date().toISOString(),
    },
  };
}

export const PROG = PROG_PLATNOSCI;
