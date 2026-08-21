// ─────────────────────────────────────────────────────────────────────────
// lib/eli.js — wykrywanie ustaw z pytania i pobieranie ich nowelizacji z ELI.
//
// Po co to jest: model odpowiada z pamięci treningowej, która kończy się
// wcześniej niż dzisiejszy stan prawny. Nie da się tego naprawić samym
// promptem („nie zgaduj"), bo model nie wie, czego nie wie — o nowelizacji
// z czerwca 2026 nie ma pojęcia, więc odpowie pewnym tonem na nieaktualnym
// brzmieniu przepisu.
//
// Rozwiązanie: zanim zapytamy model, sprawdzamy w Dzienniku Ustaw, czy ustawa
// z pytania była ostatnio nowelizowana, i wstrzykujemy tę listę do promptu.
// Model dostaje wtedy konkretny sygnał „tu coś się zmieniło po Twojej wiedzy"
// i może uczciwie zastrzec niepewność zamiast zmyślać.
//
// Świadomie NIE pobieramy treści ustaw — ELI udostępnia je jako PDF, a ich
// parsowanie i wstawianie do promptu przy 55-sekundowym budżecie funkcji
// (i limicie 12 funkcji na Vercelu) się nie spina. Lista nowelizacji to
// tanie 80% wartości: kosztuje jedno zapytanie HTTP i kilkaset znaków.
// ─────────────────────────────────────────────────────────────────────────

const ELI_SEARCH = 'https://api.sejm.gov.pl/eli/acts/search';

// Od kiedy szukamy nowelizacji. Data z zapasem względem wiedzy modelu —
// lepiej pokazać nowelizację, o której model już wie (najwyżej ją potwierdzi),
// niż przegapić tę, o której nie ma pojęcia.
export const NOWELIZACJE_OD = '2025-01-01';

// ELI szuka po fragmencie TYTUŁU aktu, a tytuły nowelizacji są w odmianie
// („o zmianie ustawy o podatku dochodowym…"), więc `tytul` musi być w takiej
// formie, w jakiej realnie występuje. Mianownik („podatek dochodowy") nie
// trafia w nic — sprawdzone na żywym API.
//
// `re` dopasowujemy do pytania użytkownika po normalizacji (małe litery,
// bez polskich znaków), dlatego wzorce są pisane bez diakrytyków.
const AKTY = [
  { re: /\b(prac(a|y|e|owni|odaw)|zatrudni|wypowiedzeni|urlop|etat|nadgodzin|swiadectw|l4|zwolnienie lekarskie|mobbing|wynagrodzeni)/, tytul: 'Kodeks pracy', label: 'Kodeks pracy' },
  { re: /\b(pit|podatek dochodow|podatku dochodow|ryczalt|liniow|skala podatkow|kwota wolna|koszty uzyskania|cit)/, tytul: 'podatku dochodowym', label: 'ustawy o podatku dochodowym' },
  { re: /\b(vat|ksef|faktur|podatku od towarow)/, tytul: 'podatku od towarów i usług', label: 'ustawa o VAT' },
  { re: /\b(zus|skladk|ubezpieczen(ia|iu) spolecz|chorobow|emerytur)/, tytul: 'systemie ubezpieczeń społecznych', label: 'ustawa o systemie ubezpieczeń społecznych' },
  { re: /\b(skladka zdrowotna|nfz|ubezpieczenie zdrowotne)/, tytul: 'świadczeniach opieki zdrowotnej', label: 'ustawa o świadczeniach opieki zdrowotnej' },
  { re: /\b(konsument|odstapieni|zwrot towaru|reklamacj|rekojmi|sklep internetow|omnibus)/, tytul: 'prawach konsumenta', label: 'ustawa o prawach konsumenta' },
  { re: /\b(rodo|dane osobow|danych osobowych|przetwarzani)/, tytul: 'ochronie danych osobowych', label: 'ustawa o ochronie danych osobowych' },
  { re: /\b(spolk|krs|wspolnik|udzial|zarzad(u|em|zie|y)?\b|akcjonariusz|sp\. z o\.o)/, tytul: 'Kodeks spółek handlowych', label: 'Kodeks spółek handlowych' },
  { re: /\b(lokator|kaucj|eksmisj|czynsz|najem|najmu|wynajm)/, tytul: 'ochronie praw lokatorów', label: 'ustawa o ochronie praw lokatorów' },
  { re: /\b(prawo autorskie|prawa autorskie|licencj|utw(or|ory|oru)\b|majatkowe prawa)/, tytul: 'prawie autorskim', label: 'ustawa o prawie autorskim' },
  { re: /\b(dzialalnosc gospodarcz|jdg|ceidg|przedsiebiorc|firma jednoosobow)/, tytul: 'Prawo przedsiębiorców', label: 'Prawo przedsiębiorców' },
  { re: /\b(zator|windykacj|rekompensat|opoznieni w platnosc|odsetki za opoznienie|transakcj handlow)/, tytul: 'przeciwdziałaniu nadmiernym opóźnieniom', label: 'ustawa o zatorach płatniczych' },
  { re: /\b(pozew|nakaz zaplaty|epu|e-sad|postepowani sadow|apelacj|egzekucj komornicz)/, tytul: 'Kodeks postępowania cywilnego', label: 'Kodeks postępowania cywilnego' },
  { re: /\b(minimaln(e|ego) wynagrodzeni|najnizsza krajowa|placa minimalna|stawka godzinowa)/, tytul: 'minimalnego wynagrodzenia za pracę', label: 'ustawa o minimalnym wynagrodzeniu' },
  // Kodeks cywilny na końcu — łapie ogólne pojęcia umowne, więc nie może
  // wyprzedzać ustaw szczegółowych (najem trafia do ochrony lokatorów itd.).
  { re: /\b(umow|zlecen|dziel|sprzedaz|przedawnieni|zadatek|zaliczk|kara umown|odszkodowani|pelnomocnictw|spadek|zachowek)/, tytul: 'Kodeks cywilny', label: 'Kodeks cywilny' },
];

// Bez diakrytyków i wielkich liter — wzorce wyżej są pisane w tej samej postaci.
function normalizuj(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
}

/** Które ustawy dotyczą pytania. Maks. 2 — dalej rosną tylko koszt i szum. */
export function wykryjAkty(tekst) {
  const t = normalizuj(tekst);
  const out = [];
  for (const a of AKTY) {
    if (a.re.test(t) && !out.some(x => x.tytul === a.tytul)) out.push(a);
    if (out.length === 2) break;
  }
  return out;
}

/** Nowelizacje danego aktu ogłoszone od `od`. Zwraca [] przy każdym błędzie. */
export async function nowelizacjeOd(tytul, od = NOWELIZACJE_OD, limit = 3, timeoutMs = 5000) {
  try {
    const url = `${ELI_SEARCH}?title=${encodeURIComponent(tytul)}&dateFrom=${od}&inForce=1&limit=${limit}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.items || []).slice(0, limit).map(i => ({
      sygnatura: i.displayAddress || i.address || '',
      tytul: (i.title || '').slice(0, 180),
      // Obwieszczenie = tekst jednolity, czyli aktualne brzmienie w jednym
      // dokumencie. Dla użytkownika to najcenniejszy trop, więc oznaczamy je
      // osobno zamiast wrzucać do worka „nowelizacje".
      jednolity: i.type === 'Obwieszczenie',
      ogloszono: i.promulgation || i.announcementDate || null,
      wchodziWZycie: i.entryIntoForce || null,
      url: i.address ? `https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=${i.address}` : null,
    })).filter(x => x.sygnatura);
  } catch (e) {
    console.error('ELI nowelizacje error:', e.message);
    return [];
  }
}

/**
 * Blok do system promptu: co się zmieniło w ustawach z pytania.
 * Pusty string, gdy nic nie wykryto albo ELI nie odpowiedziało — wtedy
 * asystent działa jak dotąd, tyle że bez tej podpowiedzi (fail-open).
 * @param {string} tekst pytanie użytkownika
 * @param {string} dzis  data odniesienia YYYY-MM-DD (rozróżnia vacatio legis)
 */
export async function kontekstNowelizacji(tekst, dzis) {
  const akty = wykryjAkty(tekst);
  if (!akty.length) return '';
  const wyniki = await Promise.all(akty.map(a => nowelizacjeOd(a.tytul).then(n => ({ ...a, n }))));
  const linie = [];
  for (const { label, n } of wyniki) {
    for (const x of n) {
      if (x.jednolity) {
        linie.push(`- ${label} — TEKST JEDNOLITY ${x.sygnatura} (ogłoszony ${x.ogloszono}): aktualne brzmienie całej ustawy.`);
        continue;
      }
      const kiedy = x.wchodziWZycie && dzis && x.wchodziWZycie > dzis
        ? `UWAGA: wchodzi w życie dopiero ${x.wchodziWZycie}, więc dziś jeszcze nie obowiązuje`
        : x.wchodziWZycie ? `obowiązuje od ${x.wchodziWZycie}` : `ogłoszona ${x.ogloszono}`;
      linie.push(`- ${label} — ${x.sygnatura}: ${x.tytul} (${kiedy}).`);
    }
  }
  if (!linie.length) return '';
  return `
ZMIANY W PRZEPISACH OGŁOSZONE OD ${NOWELIZACJE_OD} (pobrane na żywo z Dziennika Ustaw, api.sejm.gov.pl — to dane nowsze niż Twoja wiedza treningowa):
${linie.join('\n')}

Jak z tego korzystać: to wykaz aktów, nie ich treść — NIE zgaduj, co dokładnie zmieniły. Jeżeli któraś pozycja dotyczy tematu pytania, napisz wprost, że przepis był w tym okresie zmieniany, podaj sygnaturę Dz.U. i odeślij do isap.sejm.gov.pl po aktualne brzmienie. Przy akcie, który jeszcze nie wszedł w życie, wyraźnie rozróżnij stan dzisiejszy od tego, co dopiero nadejdzie. Jeżeli żadna pozycja nie dotyczy pytania — pomiń je milczeniem, nie wypisuj ich „na wszelki wypadek".`;
}
