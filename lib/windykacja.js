// ─────────────────────────────────────────────────────────────────────────
// Agent Windykacyjny — eskalacja (odsetki, rekompensata, pakiet do e-sądu).
//
// Podstawy prawne:
//   • Odsetki za opóźnienie w transakcjach handlowych — ustawa z 8.03.2013
//     o przeciwdziałaniu nadmiernym opóźnieniom. Stawka = stopa referencyjna
//     NBP + 10 p.p. (podmioty niepubliczne) lub + 8 p.p. (publiczne podmioty
//     lecznicze). Ustalana 1 stycznia (na I półrocze) i 1 lipca (na II).
//   • Odsetki ustawowe za opóźnienie — art. 481 §2 KC: stopa NBP + 5,5 p.p.
//     Zmieniają się z każdą decyzją RPP (nie półrocznie).
//   • Rekompensata za koszty odzyskiwania — art. 10 ust. 1 ww. ustawy:
//     40 / 70 / 100 EUR zależnie od wartości świadczenia. Przelicza się po
//     średnim kursie NBP z ostatniego dnia roboczego miesiąca poprzedzającego
//     miesiąc, w którym świadczenie stało się wymagalne. Należy się z mocy
//     prawa, bez wezwania i bez wykazywania poniesienia kosztów.
//
// ⚠️ STAWKI WYMAGAJĄ AKTUALIZACJI po każdej decyzji RPP — patrz STAWKI niżej.
// ─────────────────────────────────────────────────────────────────────────

// Stawki i progi pochodzą z lib/stawki.js — jednego miejsca dla wartości,
// które starzeją się z upływem czasu. Re-eksport zachowuje dotychczasowe nazwy,
// żeby nie zmieniać interfejsu modułu.
import { ODSETKI, AKTUALNE_NA, REKOMPENSATA } from './stawki.js';

export const STAWKI = ODSETKI;
export const STAWKI_AKTUALNE_NA = AKTUALNE_NA;

const DZIEN = 86400000;
const d0 = iso => { const t = Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z'); return isNaN(t) ? null : t; };
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const gr = n => Math.round(n * 100) / 100;

// Zwraca listę odcinków [od, do) ze stawką obowiązującą w danym okresie.
function odcinki(rodzaj, odIso, doIso) {
  const tab = (STAWKI[rodzaj] || []).slice().sort((a, b) => a.od < b.od ? -1 : 1);
  const start = d0(odIso), end = d0(doIso);
  if (start == null || end == null || end <= start) return [];
  const out = [];
  for (let i = 0; i < tab.length; i++) {
    const s = d0(tab[i].od);
    const e = i + 1 < tab.length ? d0(tab[i + 1].od) : Infinity;
    const a = Math.max(s, start), b = Math.min(e, end);
    if (b > a) out.push({ od: iso(a), do: iso(b), proc: tab[i].proc, dni: Math.round((b - a) / DZIEN) });
  }
  return out.sort((x, y) => x.od < y.od ? -1 : 1);
}

/**
 * Odsetki za opóźnienie, z podziałem na okresy obowiązywania stawek.
 * @param {number} kwota  należność główna (zł)
 * @param {string} odData pierwszy dzień opóźnienia (dzień PO terminie płatności)
 * @param {string} doData dzień naliczenia (zwykle dziś); odsetki liczone do dnia poprzedzającego
 * @param {'handlowe'|'handloweLecznicze'|'cywilne'} rodzaj
 */
export function obliczOdsetki(kwota, odData, doData, rodzaj = 'handlowe') {
  const k = Number(kwota);
  if (!(k > 0)) return { ok: false, error: 'Kwota musi być większa od zera' };
  const segs = odcinki(rodzaj, odData, doData);
  if (!segs.length) return { ok: false, error: 'Nieprawidłowy zakres dat (data końcowa musi być późniejsza)' };
  let suma = 0;
  const pozycje = segs.map(s => {
    const kwotaOdsetek = gr(k * (s.proc / 100) * (s.dni / 365));
    suma += kwotaOdsetek;
    return { ...s, kwota: kwotaOdsetek };
  });
  return {
    ok: true, rodzaj, kwotaGlowna: gr(k),
    dniOpoznienia: segs.reduce((a, s) => a + s.dni, 0),
    odsetki: gr(suma), razem: gr(k + suma),
    pozycje,
    podstawa: rodzaj === 'cywilne'
      ? 'art. 481 § 2 Kodeksu cywilnego'
      : 'art. 4 pkt 3 i art. 7 ustawy z 8.03.2013 o przeciwdziałaniu nadmiernym opóźnieniom w transakcjach handlowych',
    wzor: 'kwota × stawka × liczba dni / 365, osobno dla każdego okresu obowiązywania stawki',
  };
}

// ── Rekompensata art. 10: 40 / 70 / 100 EUR wg wartości świadczenia ──
export function progRekompensaty(kwota) {
  const k = Number(kwota);
  if (k < 5000) return REKOMPENSATA.do5k;
  if (k < 50000) return REKOMPENSATA.do50k;
  return REKOMPENSATA.powyzej;
}
// Ostatni dzień roboczy miesiąca poprzedzającego miesiąc wymagalności.
export function dzienKursu(dataWymagalnosci) {
  const t = d0(dataWymagalnosci); if (t == null) return null;
  const d = new Date(t);
  d.setUTCDate(0);                                    // ostatni dzień poprzedniego miesiąca
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return iso(d.getTime());
}
export async function kursEur(dataIso) {
  try {
    const r = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/eur/${dataIso}/?format=json`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
    if (r.ok) { const j = await r.json(); const v = j?.rates?.[0]?.mid; if (v) return { kurs: v, data: j.rates[0].effectiveDate, zrodlo: 'NBP tabela A' }; }
    // NBP nie publikuje kursu na dzień wolny — cofamy się do 7 dni wstecz.
    const r2 = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/eur/${dataIso}/?format=json&fallback`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (r2 && r2.ok) { const j = await r2.json(); const v = j?.rates?.[0]?.mid; if (v) return { kurs: v, data: j.rates[0].effectiveDate, zrodlo: 'NBP tabela A' }; }
  } catch (_) {}
  return { kurs: null, data: dataIso, zrodlo: 'niedostępny' };
}
export async function rekompensata(kwota, dataWymagalnosci) {
  const eur = progRekompensaty(kwota);
  const dk = dzienKursu(dataWymagalnosci);
  const { kurs, data, zrodlo } = await kursEur(dk);
  return {
    eur, dzienKursu: dk, kursData: data, kurs, zrodlo,
    pln: kurs ? gr(eur * kurs) : null,
    podstawa: 'art. 10 ust. 1 ustawy z 8.03.2013 o przeciwdziałaniu nadmiernym opóźnieniom w transakcjach handlowych',
    uwaga: 'Przysługuje z mocy prawa, bez wezwania i bez konieczności wykazania, że koszty odzyskiwania faktycznie poniesiono.',
  };
}

// ── Pakiet do e-sądu (EPU) — zestawienie danych do pozwu w postępowaniu
//    upominawczym. NIE składa pozwu; przygotowuje komplet i listę braków. ──
export async function pakietEpu({ wierzyciel = {}, dluznik = {}, faktury = [], rodzaj = 'handlowe', naDzien } = {}) {
  const dzis = naDzien || new Date().toISOString().slice(0, 10);
  const poz = [];
  let glowna = 0, odsetkiSuma = 0, rekSuma = 0;

  for (const f of faktury) {
    const kwota = Number(f.kwota || 0);
    const termin = String(f.terminPlatnosci || '').slice(0, 10);
    if (!(kwota > 0) || !d0(termin)) continue;
    const odDnia = iso(d0(termin) + DZIEN);           // odsetki od dnia po terminie
    const ods = obliczOdsetki(kwota, odDnia, dzis, rodzaj);
    const rek = await rekompensata(kwota, termin);
    glowna += kwota;
    if (ods.ok) odsetkiSuma += ods.odsetki;
    if (rek.pln) rekSuma += rek.pln;
    poz.push({
      numer: f.numer || '(brak numeru)', kwota: gr(kwota), terminPlatnosci: termin,
      dataWystawienia: f.dataWystawienia || null,
      dniOpoznienia: ods.ok ? ods.dniOpoznienia : 0,
      odsetki: ods.ok ? ods.odsetki : 0,
      rekompensataEur: rek.eur, rekompensataPln: rek.pln,
    });
  }

  const wps = gr(glowna + odsetkiSuma + rekSuma);     // wartość przedmiotu sporu
  // Opłata w EPU: 1,25% WPS, nie mniej niż 30 zł (art. 13 ust. 1a u.k.s.c.).
  const oplata = Math.max(30, Math.ceil(wps * 0.0125));

  const braki = [];
  const wymWierz = { nazwa: 'nazwa wierzyciela', nip: 'NIP wierzyciela', adres: 'adres wierzyciela' };
  const wymDluz = { nazwa: 'nazwa dłużnika', adres: 'adres dłużnika' };
  for (const [k, label] of Object.entries(wymWierz)) if (!wierzyciel[k]) braki.push(`Brak: ${label}`);
  for (const [k, label] of Object.entries(wymDluz)) if (!dluznik[k]) braki.push(`Brak: ${label}`);
  if (!dluznik.nip && !dluznik.pesel && !dluznik.krs)
    braki.push('Brak identyfikatora dłużnika (NIP, PESEL lub KRS) — e-Sąd wymaga co najmniej jednego');
  if (!poz.length) braki.push('Brak pozycji — dodaj co najmniej jedną niezapłaconą fakturę');

  return {
    ok: braki.length === 0,
    naDzien: dzis, wierzyciel, dluznik, pozycje: poz,
    podsumowanie: {
      naleznoscGlowna: gr(glowna), odsetki: gr(odsetkiSuma), rekompensaty: gr(rekSuma),
      wartoscPrzedmiotuSporu: wps, oplataSadowa: oplata,
    },
    braki,
    instrukcja: [
      'Pakiet przygotowuje dane do pozwu w elektronicznym postępowaniu upominawczym (EPU) — e-Sąd w Lublinie, portal e-sad.gov.pl.',
      'EPU dotyczy wyłącznie roszczeń pieniężnych i wymaga podania identyfikatora dłużnika.',
      'Opłata wynosi 1,25% wartości przedmiotu sporu, minimum 30 zł.',
      'Dowodów nie załącza się do pozwu w EPU — wystarczy je wymienić; sąd może ich zażądać później.',
      'Nakaz zapłaty traci moc w całości, gdy pozwany wniesie sprzeciw — sprawa trafia wtedy do sądu według właściwości ogólnej.',
    ],
    zastrzezenie: 'Zestawienie pomocnicze, nie stanowi porady prawnej. Zweryfikuj kwoty i terminy przed złożeniem pozwu.',
  };
}
