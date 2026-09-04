// ─────────────────────────────────────────────────────────────────────────
// lib/plany.js — prawa nabyte przy zmianie struktury pakietów.
//
// Do 4 września 2026 Pakiet Start dawał 5 pobrań z CAŁEGO katalogu. Po zmianie
// obejmuje wyłącznie CV, list motywacyjny i dokumenty pracownicze. Ktoś, kto
// kupił Start wcześniej, zapłacił za szerszy zakres — i ma go zachować do
// końca ważności swojego pakietu.
//
// Rozpoznajemy takich użytkowników po dacie aktywacji, a nie po liście
// identyfikatorów: nikogo nie trzeba wyszukiwać ręcznie, nikt nie zostanie
// pominięty, a ponieważ Start jest ważny 365 dni, wyjątek wygasa sam.
// ─────────────────────────────────────────────────────────────────────────

// Moment wdrożenia nowej struktury pakietów.
export const ZMIANA_PAKIETOW = Date.parse('2026-09-04T00:00:00Z');

/**
 * Czy subskrypcja pochodzi sprzed zmiany i zachowuje dawny, pełny zakres.
 * Dotyczy wyłącznie Startu — pozostałe pakiety nie straciły żadnych kategorii.
 * @param {object} sub dokument users/{uid}/subscription/current
 */
export function maPrawaNabyte(sub) {
  if (!sub || sub.plan !== 'start') return false;
  const aktywacja = sub.activatedAt?.toDate?.()?.getTime();
  // Brak daty traktujemy jak zakup sprzed zmiany — lepiej dać dostęp komuś,
  // komu się nie należy, niż odebrać go komuś, kto za niego zapłacił.
  if (aktywacja == null || Number.isNaN(aktywacja)) return true;
  return aktywacja < ZMIANA_PAKIETOW;
}
