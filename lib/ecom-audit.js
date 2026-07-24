// ─────────────────────────────────────────────────────────────────────────
// Agent Compliance E-commerce — audyt sklepu internetowego po adresie URL.
//
// Pobiera stronę główną, znajduje podstrony prawne (regulamin, polityka
// prywatności, zwroty, dostawa) i sprawdza, czy zawierają elementy wymagane
// przez polskie i unijne przepisy:
//   • ustawa o prawach konsumenta — dane sprzedawcy, prawo odstąpienia 14 dni,
//     wzór formularza odstąpienia, koszty i sposób zwrotu;
//   • ustawa o prawach konsumenta po zmianach 2023 — niezgodność towaru
//     z umową (zamiast dawnej rękojmi konsumenckiej);
//   • RODO — administrator, cele i podstawy przetwarzania, prawa osoby, cookies;
//   • dyrektywa Omnibus — najniższa cena z 30 dni przed obniżką, informacja
//     o plasowaniu ofert, weryfikacja pochodzenia opinii;
//   • rozporządzenie ODR — link do platformy ODR / informacja o ADR.
//
// Audyt jest sygnalizacyjny: wykrywa BRAK wzmianki o obowiązku. Nie ocenia
// poprawności merytorycznej zapisów i nie zastępuje audytu prawnika.
// ─────────────────────────────────────────────────────────────────────────

const BLOCKED_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|0\.0\.0\.0|metadata\.)/;
const UA = 'DokumoComplianceBot/1.0 (+https://dokumoflow.com)';
const MAX_BYTES = 900_000;

export function normalizeUrl(input) {
  let u = String(input || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  let p; try { p = new URL(u); } catch { return null; }
  if (!/^https?:$/.test(p.protocol)) return null;
  if (BLOCKED_HOST.test(p.hostname.toLowerCase())) return null;
  if (!p.hostname.includes('.')) return null;
  return p;
}

async function pobierz(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      redirect: 'follow', signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return { ok: false, status: r.status };
    const ct = r.headers.get('content-type') || '';
    if (!/text\/html|text\/plain/i.test(ct)) return { ok: false, status: 415 };
    const buf = await r.arrayBuffer();
    const html = new TextDecoder('utf-8').decode(buf.slice(0, MAX_BYTES));
    return { ok: true, status: r.status, html, finalUrl: r.url || url };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'TimeoutError' ? 'timeout' : e.message };
  }
}

// HTML → tekst (bez skryptów/stylów), znormalizowany do wyszukiwania fraz.
export function naTekst(html) {
  return String(html || '')
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Kandydaci na podstrony prawne — po treści linku i po adresie.
const WZORCE_STRON = {
  regulamin: /regulamin|terms|warunki[- ]sprzeda/i,
  prywatnosc: /polityk\w*[- ]prywatn|privacy|rodo|ochrona[- ]danych/i,
  zwroty: /zwrot|odstąpieni|odstapieni|reklamacj|returns/i,
  dostawa: /dostaw|wysyłk|wysylk|shipping|płatnoś|platnos/i,
};

export function znajdzPodstrony(html, base) {
  const out = {};
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const tekst = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
    let abs; try { abs = new URL(href, base); } catch { continue; }
    if (abs.hostname !== new URL(base).hostname) continue;
    for (const [klucz, wz] of Object.entries(WZORCE_STRON)) {
      if (out[klucz]) continue;
      if (wz.test(tekst) || wz.test(decodeURIComponent(abs.pathname))) out[klucz] = abs.href;
    }
  }
  return out;
}

// ── Reguły audytu. `gdzie` wskazuje, w których dokumentach szukamy. ──
const REGULY = [
  { kod: 'odstapienie_14', waga: 'krytyczny', gdzie: ['regulamin', 'zwroty'],
    tytul: 'Prawo odstąpienia w 14 dni',
    wzorce: [/14 dni/, /czternast\w+ dni/],
    dlaczego: 'Konsument ma 14 dni na odstąpienie od umowy bez podania przyczyny. Brak informacji wydłuża ten termin do 12 miesięcy.',
    podstawa: 'art. 27 i art. 29 ustawy o prawach konsumenta' },

  { kod: 'formularz_odstapienia', waga: 'uwaga', gdzie: ['regulamin', 'zwroty'],
    tytul: 'Wzór formularza odstąpienia od umowy',
    wzorce: [/formularz\w* odstąpieni/, /formularz\w* odstapieni/, /wzór odstąpieni/],
    dlaczego: 'Sprzedawca musi udostępnić wzór formularza odstąpienia jako załącznik do regulaminu.',
    podstawa: 'art. 12 ust. 1 pkt 9 ustawy o prawach konsumenta' },

  { kod: 'niezgodnosc_towaru', waga: 'uwaga', gdzie: ['regulamin', 'zwroty'],
    tytul: 'Niezgodność towaru z umową (reklamacje po 2023)',
    wzorce: [/niezgodnoś\w* towaru z umow/, /niezgodnos\w* towaru z umow/, /rękojmi/, /rekojmi/],
    dlaczego: 'Od 2023 r. reklamacje konsumenckie opiera się na niezgodności towaru z umową. Regulaminy sprzed 2023 wciąż powołują wyłącznie rękojmię.',
    podstawa: 'rozdział 5a ustawy o prawach konsumenta' },

  { kod: 'dane_sprzedawcy_nip', waga: 'krytyczny', gdzie: ['regulamin', 'glowna'],
    tytul: 'NIP sprzedawcy',
    wzorce: [/\bnip\b[\s:]*[0-9\- ]{10,}/],
    dlaczego: 'Sklep musi podać pełne dane identyfikujące przedsiębiorcę, w tym NIP.',
    podstawa: 'art. 8 ustawy o prawach konsumenta, art. 5 ustawy o świadczeniu usług drogą elektroniczną' },

  { kod: 'kontakt_email', waga: 'krytyczny', gdzie: ['regulamin', 'glowna'],
    tytul: 'Adres e-mail do kontaktu',
    wzorce: [/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/],
    dlaczego: 'Konsument musi mieć podany adres poczty elektronicznej do szybkiego kontaktu i składania reklamacji.',
    podstawa: 'art. 12 ust. 1 pkt 3 ustawy o prawach konsumenta' },

  { kod: 'omnibus_najnizsza_cena', waga: 'krytyczny', gdzie: ['regulamin', 'glowna'],
    tytul: 'Najniższa cena z 30 dni przed obniżką (Omnibus)',
    wzorce: [/najniższ\w* cen\w*[^.]{0,40}30 dni/, /najnizsz\w* cen\w*[^.]{0,40}30 dni/, /omnibus/],
    dlaczego: 'Przy każdej promocji trzeba pokazać najniższą cenę z 30 dni poprzedzających obniżkę. To najczęściej kontrolowany przez UOKiK obowiązek.',
    podstawa: 'art. 4 ust. 2 ustawy o informowaniu o cenach (dyrektywa Omnibus)' },

  { kod: 'omnibus_opinie', waga: 'uwaga', gdzie: ['regulamin'],
    tytul: 'Weryfikacja opinii o produktach',
    wzorce: [/opini\w*[^.]{0,60}(weryfik|pochodz|autentycz)/, /(weryfik|sprawdz)\w*[^.]{0,40}opini/],
    dlaczego: 'Jeśli sklep publikuje opinie, musi wskazać, czy i jak weryfikuje, że pochodzą od osób, które kupiły produkt.',
    podstawa: 'art. 12 ust. 1 pkt 25 ustawy o prawach konsumenta (Omnibus)' },

  { kod: 'odr_adr', waga: 'uwaga', gdzie: ['regulamin'],
    tytul: 'Informacja o ADR / platformie ODR',
    wzorce: [/ec\.europa\.eu\/consumers\/odr/, /platform\w* odr/, /pozasądow\w* (rozwiązywani|sposob)/, /pozasadow\w*/],
    dlaczego: 'Sklep musi poinformować o możliwości pozasądowego rozwiązywania sporów i podać link do platformy ODR.',
    podstawa: 'art. 14 rozporządzenia (UE) 524/2013' },

  { kod: 'rodo_administrator', waga: 'krytyczny', gdzie: ['prywatnosc'],
    tytul: 'Tożsamość administratora danych',
    wzorce: [/administrator\w*( twoich| państwa| pani| pana)? danych/, /administratorem danych/],
    dlaczego: 'Polityka prywatności musi jednoznacznie wskazywać administratora danych osobowych.',
    podstawa: 'art. 13 ust. 1 lit. a RODO' },

  { kod: 'rodo_podstawa', waga: 'krytyczny', gdzie: ['prywatnosc'],
    tytul: 'Cele i podstawa prawna przetwarzania',
    wzorce: [/podstaw\w* prawn\w*/, /art\.? ?6 ust/, /cel\w* przetwarzani/],
    dlaczego: 'Trzeba wskazać cel i podstawę prawną każdego rodzaju przetwarzania danych.',
    podstawa: 'art. 13 ust. 1 lit. c RODO' },

  { kod: 'rodo_prawa', waga: 'uwaga', gdzie: ['prywatnosc'],
    tytul: 'Prawa osoby, której dane dotyczą',
    wzorce: [/prawo do (dostępu|usunięcia|sprostowania)/, /prawo do (dostepu|usuniecia|sprostowania)/, /prawo do bycia zapomnian/],
    dlaczego: 'Polityka musi wymieniać prawa: dostępu, sprostowania, usunięcia, ograniczenia, przenoszenia i sprzeciwu.',
    podstawa: 'art. 13 ust. 2 lit. b RODO' },

  { kod: 'rodo_skarga', waga: 'uwaga', gdzie: ['prywatnosc'],
    tytul: 'Prawo skargi do Prezesa UODO',
    wzorce: [/prezes\w* urzędu ochrony danych/, /prezes\w* urzedu ochrony danych/, /\buodo\b/, /organu nadzorcz/],
    dlaczego: 'Trzeba poinformować o prawie wniesienia skargi do organu nadzorczego (Prezes UODO).',
    podstawa: 'art. 13 ust. 2 lit. d RODO' },

  { kod: 'cookies', waga: 'uwaga', gdzie: ['prywatnosc', 'glowna'],
    tytul: 'Informacja o plikach cookies',
    wzorce: [/cookie|ciasteczk/],
    dlaczego: 'Korzystanie z cookies wymaga poinformowania użytkownika i — poza niezbędnymi — uzyskania zgody.',
    podstawa: 'art. 173 Prawa telekomunikacyjnego' },
];

function sprawdzRegule(r, teksty) {
  const zrodla = r.gdzie.filter(g => teksty[g]);
  if (!zrodla.length) return { status: 'niesprawdzone', gdzieSzukano: r.gdzie };
  for (const g of zrodla) {
    if (r.wzorce.some(w => w.test(teksty[g]))) return { status: 'ok', znalezionoW: g };
  }
  return { status: 'brak', gdzieSzukano: zrodla };
}

/** Audyt sklepu. Zwraca listę ustaleń + ocenę. */
export async function audytSklepu(inputUrl) {
  const p = normalizeUrl(inputUrl);
  if (!p) return { ok: false, error: 'Nieprawidłowy lub niedozwolony adres URL' };

  const glowna = await pobierz(p.href);
  if (!glowna.ok) {
    return { ok: false, error: glowna.error === 'timeout'
      ? 'Sklep nie odpowiedział w wyznaczonym czasie'
      : `Nie udało się pobrać strony (status ${glowna.status || 'brak odpowiedzi'})` };
  }

  const podstrony = znajdzPodstrony(glowna.html, glowna.finalUrl);
  const teksty = { glowna: naTekst(glowna.html) };
  const pobrane = { glowna: glowna.finalUrl };

  for (const [klucz, url] of Object.entries(podstrony)) {
    const r = await pobierz(url);
    if (r.ok) { teksty[klucz] = naTekst(r.html); pobrane[klucz] = r.finalUrl; }
  }

  const ustalenia = REGULY.map(r => ({
    kod: r.kod, tytul: r.tytul, waga: r.waga,
    dlaczego: r.dlaczego, podstawa: r.podstawa,
    ...sprawdzRegule(r, teksty),
  }));

  const braki = ustalenia.filter(u => u.status === 'brak');
  const krytyczne = braki.filter(u => u.waga === 'krytyczny').length;
  const uwagi = braki.filter(u => u.waga === 'uwaga').length;
  const wynik = Math.max(0, 100 - krytyczne * 15 - uwagi * 6);

  const brakujaceDokumenty = [];
  if (!podstrony.regulamin) brakujaceDokumenty.push({ typ: 'Regulamin', generator: 'generator-regulaminu-sklepu.html' });
  if (!podstrony.prywatnosc) brakujaceDokumenty.push({ typ: 'Polityka prywatności', generator: 'generator-polityki-prywatnosci.html' });
  if (!podstrony.zwroty) brakujaceDokumenty.push({ typ: 'Polityka zwrotów i reklamacji', generator: 'generator-polityki-zwrotow.html' });

  return {
    ok: true,
    url: p.href,
    sprawdzono: new Date().toISOString(),
    znalezioneDokumenty: pobrane,
    brakujaceDokumenty,
    wynik,
    ocena: wynik >= 85 ? 'dobra' : wynik >= 60 ? 'wymaga poprawek' : 'wysokie ryzyko',
    podsumowanie: { krytyczne, uwagi, ok: ustalenia.filter(u => u.status === 'ok').length,
                    niesprawdzone: ustalenia.filter(u => u.status === 'niesprawdzone').length },
    ustalenia,
    zastrzezenie: 'Audyt automatyczny wykrywa brak wzmianki o obowiązku w treści strony. Nie ocenia poprawności merytorycznej zapisów ani nie zastępuje audytu prawnika.',
  };
}
