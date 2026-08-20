#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Wykrywa rozjazd wartości, które starzeją się z upływem czasu.
//
// Problem, który rozwiązuje: płaca minimalna żyła w kilkunastu plikach.
// Po podwyżce część miejsc zaktualizowano, a część nie — generator umowy
// o pracę podawał AI kwotę 4 806 zł, a w FAQ obok widniało 4 666 zł.
//
// Dwa zabezpieczenia przed fałszywym alarmem:
//   1. granice liczby — „20 000” nie może trafić wewnątrz „120 000”,
//   2. sąsiedztwo słowa kluczowego — kwota liczy się tylko wtedy, gdy obok
//      stoi wyraz wskazujący, że to naprawdę ta wartość (np. „minimalne
//      wynagrodzenie”), a nie przypadkowa liczba z widełek płacowych.
//
// Uruchomienie:  node scripts/sprawdz-stawki.mjs
// Kod wyjścia 1, gdy znaleziono nieaktualną wartość — nadaje się do CI.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACA_MIN, STAWKA_GODZINOWA, AKTUALNE_NA } from '../lib/stawki.js';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const zSpacja = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const przecinek = (n) => n.toFixed(2).replace('.', ',');
const aktualne = (n) => [zSpacja(n), String(Math.round(n))];

// Liczba w tekście, z granicami: nie wewnątrz dłuższej liczby.
// Dopuszczamy spację lub jej brak jako separator tysięcy.
const wzorzec = (tekstLiczby) => {
  const cyfry = tekstLiczby.replace(/[\s.]/g, '');
  const zSep = cyfry.replace(/\B(?=(\d{3})+(?!\d))/g, '[\\s\\u00a0]?');
  return new RegExp(`(?<![\\d,.])${zSep}(?![\\d.,])`, 'g');
};

const REGULY = [
  // Świadomie tylko POPRZEDNIA obowiązująca wartość. Starsze kwoty (3 600,
  // 4 300) są na tyle zwyczajne, że trafiają się w widełkach płacowych czy
  // tabelach składek — ich wykrywanie dawało więcej szumu niż pożytku.
  {
    etykieta: 'płaca minimalna',
    stare: ['4 666'],
    aktualne: aktualne(PLACA_MIN),
    kontekst: /minimaln|najniższ|wynagrodzeni[ea] za pracę/i,
  },
  {
    etykieta: 'minimalna stawka godzinowa',
    stare: ['30,50'],
    aktualne: [przecinek(STAWKA_GODZINOWA)],
    kontekst: /stawk\w* godzinow|za godzin|zł\/h|zł za godzinę/i,
  },
];

const pliki = readdirSync(PUB).filter((f) => f.endsWith('.html'));
let bledy = 0, zestawienia = 0, pominieto = 0;

console.log(`Stawki aktualne na: ${AKTUALNE_NA}`);
console.log(`Płaca minimalna ${zSpacja(PLACA_MIN)} zł · stawka godzinowa ${przecinek(STAWKA_GODZINOWA)} zł`);
console.log(`Sprawdzam ${pliki.length} plików…\n`);

for (const f of pliki) {
  const tekst = readFileSync(join(PUB, f), 'utf8');
  for (const r of REGULY) {
    for (const stara of r.stare) {
      for (const m of tekst.matchAll(wzorzec(stara))) {
        const wok = tekst.slice(Math.max(0, m.index - 200), m.index + 200);
        if (!r.kontekst.test(wok)) { pominieto++; continue; }          // przypadkowa liczba
        if (r.aktualne.some((a) => wok.includes(a))) {                  // tabela „było / jest”
          zestawienia++;
          console.log(`  ℹ️  ${f} — „${stara}” (${r.etykieta}) obok aktualnej kwoty; wygląda na zestawienie`);
          continue;
        }
        bledy++;
        const frag = tekst.slice(Math.max(0, m.index - 60), m.index + 50).replace(/\s+/g, ' ');
        console.log(`  ❌ ${f} — NIEAKTUALNA ${r.etykieta}: „${stara}”`);
        console.log(`      …${frag}…`);
      }
    }
  }
}

console.log();
if (bledy) {
  console.log(`❌ Nieaktualnych wartości: ${bledy}. Zestawień porównawczych: ${zestawienia}.`);
  console.log('   Popraw je albo zaktualizuj lib/stawki.js i public/stawki.js.');
  process.exit(1);
}
console.log(`✅ Brak nieaktualnych wartości.`);
console.log(`   Zestawień porównawczych: ${zestawienia}. Liczb pominiętych jako niezwiązane: ${pominieto}.`);
