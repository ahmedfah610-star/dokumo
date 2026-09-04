// ─────────────────────────────────────────────────────────────────────────
// lib/katalog.js — jedyne wiążące przypisanie dokumentu do kategorii.
//
// Do tej pory /api/generate brało kategorię z pola `docCat` w ciele żądania,
// czyli od klienta. Wystarczyło wysłać prompt na regulamin sklepu razem z
// `docCat:'kariera'`, żeby ominąć bramkę pakietu — formularz na stronie był
// jedyną przeszkodą, a formularza nikt nie musi używać.
//
// Teraz serwer wyprowadza kategorię z identyfikatora dokumentu i nie ufa
// niczemu, co przyszło od klienta. `docCat` zostaje wyłącznie jako etykieta
// do wyświetlenia w „Moich dokumentach".
// ─────────────────────────────────────────────────────────────────────────

/** docId → kategoria. Klucze muszą pokrywać się z `docId` wysyłanym przez
 *  strony generatorów (FORMS[...] w hubach, stałe na stronach pojedynczych). */
export const KATEGORIE_DOKUMENTOW = {
  // Dokumenty pracownicze — Start, Kariera, Pro Max
  'cv':                  'kariera',
  'cover-letter':        'kariera',
  'wypowiedzenie':       'kariera',
  'urlop':               'kariera',
  'swiadectwo':          'kariera',

  // Umowy — Kariera, Biznes, Pro Max
  'uop':                 'hr',
  'zlecenie':            'hr',
  'dzielo':              'hr',
  'b2b':                 'hr',
  'nda':                 'hr',

  // Najem — Kariera, Biznes, Pro Max
  'najmu':               'najem',
  'protokol':            'najem',
  'wypowiedzenie_najmu': 'najem',

  // Sprzedaż — Kariera, Biznes, Pro Max
  'sprzedaz':            'sprzedaz',

  // Pozostałe — Kariera, Biznes, Pro Max
  'pelnomocnictwo':      'inne',
  'wezwanie-do-zaplaty': 'inne',

  // Dokumenty firmowe i e-commerce — wyłącznie Biznes i Pro Max
  'regulamin':           'biznes',
  'rodo':                'biznes',
  'zwroty':              'biznes',
  'faktura':             'biznes',
  'biznesplan':          'biznes',
  'swot':                'biznes',
  'spolnikow':           'biznes',
};

/**
 * Kategoria dokumentu albo null, gdy identyfikator jest nieznany.
 * Nieznany docId świadomie nie ma wartości domyślnej: gdyby wpadał do
 * najłagodniejszej kategorii, wystarczyłoby wysłać zmyślony docId, żeby
 * wrócić do stanu sprzed poprawki.
 */
export function kategoriaDokumentu(docId) {
  if (typeof docId !== 'string') return null;
  return KATEGORIE_DOKUMENTOW[docId] || null;
}
