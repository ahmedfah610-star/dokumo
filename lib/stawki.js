// ─────────────────────────────────────────────────────────────────────────
// lib/stawki.js — serwerowy odpowiednik public/stawki.js.
//
// Trzyma wartości, które starzeją się z upływem czasu, w jednym miejscu.
// Odsetki mają postać tabeli okresów, bo naliczamy je wstecz — kwota zaległa
// od stycznia do lipca przechodzi przez dwie różne stawki i każdy odcinek
// trzeba policzyć osobno.
//
// AKTUALIZACJA PO DECYZJI RPP: dopisz nowy wpis NA POCZĄTKU właściwej tablicy
// (sortowanie idzie od najnowszego) i podnieś AKTUALNE_NA. Starych wpisów nie
// usuwaj — są potrzebne do liczenia odsetek za okresy wsteczne.
// ─────────────────────────────────────────────────────────────────────────

export const AKTUALNE_NA = '2026-07-01';

// ── Wynagrodzenia i progi (muszą się zgadzać z public/stawki.js) ──
export const PLACA_MIN = 4806;
export const STAWKA_GODZINOWA = 31.40;
export const PROG_BIALA_LISTA = 15000;
export const TERMIN_ZAPLATY_B2B = 60;
export const LIMIT_UMOW_MIESIACE = 33;
export const LIMIT_UMOW_SZTUK = 3;

// ── Odsetki: `od` włącznie, wpis obowiązuje do początku następnego ──
export const ODSETKI = {
  // Transakcje handlowe — podmioty niepubliczne (stopa NBP + 10 p.p.)
  handlowe: [
    { od: '2026-07-01', proc: 13.75 },
    { od: '2026-01-01', proc: 14.00 },
    { od: '2025-07-01', proc: 15.10 },
    { od: '2025-01-01', proc: 15.75 },
  ],
  // Transakcje handlowe — publiczne podmioty lecznicze (NBP + 8 p.p.)
  handloweLecznicze: [
    { od: '2026-07-01', proc: 11.75 },
    { od: '2026-01-01', proc: 12.00 },
  ],
  // Odsetki ustawowe za opóźnienie, art. 481 KC (NBP + 5,5 p.p.)
  cywilne: [
    { od: '2026-03-05', proc: 9.25 },
    { od: '2026-01-01', proc: 9.50 },
    { od: '2025-05-08', proc: 10.75 },
  ],
};

// ── Rekompensata za koszty odzyskiwania należności (art. 10) ──
export const REKOMPENSATA = { do5k: 40, do50k: 70, powyzej: 100 }; // EUR

export const ZRODLA = {
  placaMin: 'rozporządzenie Rady Ministrów w sprawie wysokości minimalnego wynagrodzenia za pracę',
  odsetkiHandlowe: 'art. 7 ustawy z 8.03.2013 o przeciwdziałaniu nadmiernym opóźnieniom w transakcjach handlowych',
  odsetkiCywilne: 'art. 481 § 2 Kodeksu cywilnego',
  rekompensata: 'art. 10 ust. 1 ustawy z 8.03.2013 o przeciwdziałaniu nadmiernym opóźnieniom',
  progBialaLista: 'art. 19 Prawa przedsiębiorców',
};
