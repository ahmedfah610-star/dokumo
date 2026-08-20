/* stawki.js — JEDNO ŹRÓDŁO PRAWDY dla wartości, które zmieniają się z roku na rok.
 *
 * Powód istnienia: te same kwoty żyły wcześniej w kilkunastu plikach niezależnie.
 * Gdy zmieniła się płaca minimalna, część miejsc zaktualizowano, a część nie —
 * i generator umowy o pracę podawał w instrukcji dla AI 4 806 zł, a w FAQ obok
 * 4 666 zł. Tutaj wartość jest jedna; zmienia się ją w jednym miejscu.
 *
 * AKTUALIZACJA: podnieś `rok`, wartości i `obowiazujeOd`, a potem uruchom
 *   node scripts/sprawdz-stawki.mjs
 * które wskaże wszystkie pliki wciąż zawierające starą kwotę.
 *
 * Ten plik jest ładowany jako zwykły <script> PRZED blokiem definiującym
 * SYSTEM_PROMPT, więc `STAWKI` jest dostępne w interpolacji `${...}`.
 */
(function () {
  var S = {
    rok: 2026,
    obowiazujeOd: '2026-01-01',

    // ── Wynagrodzenia ──
    placaMin: 4806,                       // zł brutto / miesiąc, pełny etat
    placaMinTekst: '4 806 zł brutto',
    stawkaGodzinowa: 31.40,               // zł brutto / godzina (zlecenie, samozatrudnienie)
    stawkaGodzinowaTekst: '31,40 zł brutto',

    // ── Progi i limity ──
    progBialaLista: 15000,                // zł — powyżej tej kwoty płatność musi iść na rachunek z wykazu
    progBialaListaTekst: '15 000 zł',
    limitUmowMiesiace: 33,                // art. 25(1) KP
    limitUmowSztuk: 3,
    terminZaplatyB2B: 60,                 // dni — maksymalny termin w transakcjach handlowych
    kaucjaMaxKrotnosc: 12,                // art. 6 ust. 1 ustawy o ochronie praw lokatorów
    kaucjaOkazjonalnyKrotnosc: 6,         // art. 19a ust. 4

    // ── Rekompensata za koszty odzyskiwania należności (art. 10) ──
    rekompensata: { do5k: 40, do50k: 70, powyzej: 100 },  // EUR

    // ── Podstawy prawne, do cytowania w dokumentach ──
    zrodla: {
      placaMin: 'rozporządzenie Rady Ministrów w sprawie wysokości minimalnego wynagrodzenia za pracę',
      limitUmow: 'art. 25(1) Kodeksu pracy',
      progBialaLista: 'art. 19 Prawa przedsiębiorców',
      kaucja: 'art. 6 ust. 1 ustawy o ochronie praw lokatorów',
      terminZaplatyB2B: 'art. 7 ustawy z 8.03.2013 o przeciwdziałaniu nadmiernym opóźnieniom',
      rekompensata: 'art. 10 ustawy z 8.03.2013 o przeciwdziałaniu nadmiernym opóźnieniom',
    },
  };

  // Dostępne i jako window.STAWKI, i jako gołe STAWKI (dla interpolacji w szablonach).
  window.STAWKI = S;
  try { globalThis.STAWKI = S; } catch (e) {}
})();
