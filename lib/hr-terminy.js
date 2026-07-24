// ─────────────────────────────────────────────────────────────────────────
// Agent Terminów Kadrowych — pilnuje dat, których przegapienie kosztuje.
//
// Co liczy:
//   • badania lekarskie — data następnego badania wynika z orzeczenia lekarza;
//     agent przypomina przed jej upływem (art. 229 KP). Bez aktualnego
//     orzeczenia nie wolno dopuścić pracownika do pracy;
//   • badania kontrolne — obowiązkowe po niezdolności do pracy trwającej
//     dłużej niż 30 dni (art. 229 § 2 KP);
//   • szkolenia BHP okresowe — częstotliwość zależy od rodzaju stanowiska
//     (rozporządzenie MGiP z 27.07.2004 w sprawie szkolenia w dziedzinie BHP);
//   • koniec umowy terminowej — z wyprzedzeniem równym okresowi wypowiedzenia;
//   • limit 33 miesięcy i 3 umów na czas określony (art. 25(1) KP) — po jego
//     przekroczeniu umowa z mocy prawa staje się bezterminowa.
//
// Agent sygnalizuje terminy. Nie zastępuje lekarza medycyny pracy, behapowca
// ani kadrowej — orzeczenie o terminie kolejnego badania wydaje lekarz.
// ─────────────────────────────────────────────────────────────────────────

const DZIEN = 86400000;
const d0 = v => { const t = Date.parse(String(v || '').slice(0, 10) + 'T00:00:00Z'); return isNaN(t) ? null : t; };
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const plusMies = (ms, n) => { const d = new Date(ms); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime(); };
const dni = (a, b) => Math.round((a - b) / DZIEN);

// Częstotliwość szkoleń BHP okresowych wg rodzaju stanowiska.
export const BHP_OKRESY = {
  robotnicze:            { lata: 3, opis: 'stanowiska robotnicze' },
  robotnicze_niebezpieczne: { lata: 1, opis: 'prace szczególnie niebezpieczne' },
  kierujacy:             { lata: 5, opis: 'pracodawcy i osoby kierujące pracownikami' },
  inzynieryjno_techniczne: { lata: 5, opis: 'stanowiska inżynieryjno-techniczne' },
  administracyjno_biurowe: { lata: 6, opis: 'stanowiska administracyjno-biurowe' },
};

// Okres wypowiedzenia umowy o pracę wg stażu u danego pracodawcy (art. 36 KP).
export function okresWypowiedzenia(dataZatrudnienia, naDzien) {
  const s = d0(dataZatrudnienia), n = d0(naDzien) ?? Date.now();
  if (s == null) return null;
  const mies = (new Date(n).getUTCFullYear() - new Date(s).getUTCFullYear()) * 12
             + (new Date(n).getUTCMonth() - new Date(s).getUTCMonth());
  if (mies < 6) return { tekst: '2 tygodnie', dni: 14 };
  if (mies < 36) return { tekst: '1 miesiąc', dni: 30 };
  return { tekst: '3 miesiące', dni: 90 };
}

// Suma miesięcy umów na czas określony + licznik umów (art. 25(1) KP).
export function limitTerminowych(umowy = [], naDzien) {
  const n = d0(naDzien) ?? Date.now();
  const term = umowy.filter(u => u.rodzaj === 'terminowa');
  let miesiace = 0;
  for (const u of term) {
    const od = d0(u.od); if (od == null) continue;
    const do_ = d0(u.do) ?? n;
    miesiace += Math.max(0, (new Date(do_).getUTCFullYear() - new Date(od).getUTCFullYear()) * 12
                          + (new Date(do_).getUTCMonth() - new Date(od).getUTCMonth()));
  }
  return {
    liczbaUmow: term.length, miesiace,
    limitMiesiecy: 33, limitUmow: 3,
    przekroczony: miesiace > 33 || term.length > 3,
    pozostaloMiesiecy: Math.max(0, 33 - miesiace),
  };
}

/**
 * Zwraca listę terminów dla jednego pracownika, posortowaną wg pilności.
 * @param {object} p pracownik
 * @param {number} horyzont ile dni naprzód pokazywać (domyślnie 90)
 */
export function terminyPracownika(p = {}, { naDzien, horyzont = 90 } = {}) {
  const dzis = d0(naDzien) ?? d0(new Date().toISOString());
  const out = [];
  const dodaj = (o) => {
    const t = d0(o.data); if (t == null) return;
    const zostalo = dni(t, dzis);
    if (zostalo > horyzont) return;                 // za daleko, nie zawracamy głowy
    out.push({
      ...o, data: iso(t), dniDoTerminu: zostalo,
      status: zostalo < 0 ? 'po_terminie' : zostalo <= 14 ? 'pilne' : 'zbliza_sie',
    });
  };

  // 1) Badania lekarskie
  if (p.badaniaDo) {
    dodaj({
      kod: 'badania_okresowe', tytul: 'Badania lekarskie — koniec ważności',
      data: p.badaniaDo,
      skutek: 'Bez aktualnego orzeczenia nie wolno dopuścić pracownika do pracy. Dopuszczenie jest wykroczeniem zagrożonym grzywną i podstawową nieprawidłowością przy kontroli PIP.',
      podstawa: 'art. 229 § 4 Kodeksu pracy',
      dzialanie: 'Skieruj pracownika na badania okresowe (skierowanie wystawia pracodawca).',
    });
  } else if (p.dataZatrudnienia) {
    dodaj({
      kod: 'badania_brak', tytul: 'Brak daty ważności badań lekarskich',
      data: iso(dzis), skutek: 'Nie da się ustalić, czy pracownik ma ważne orzeczenie lekarskie.',
      podstawa: 'art. 229 Kodeksu pracy', dzialanie: 'Uzupełnij datę z orzeczenia lekarza medycyny pracy.',
    });
  }
  // 2) Badania kontrolne po długiej chorobie
  if (p.niezdolnoscOd && p.niezdolnoscDo) {
    const a = d0(p.niezdolnoscOd), b = d0(p.niezdolnoscDo);
    if (a != null && b != null && dni(b, a) > 30) {
      dodaj({
        kod: 'badania_kontrolne', tytul: 'Badania kontrolne po chorobie powyżej 30 dni',
        data: iso(b + DZIEN),
        skutek: 'Po niezdolności do pracy trwającej dłużej niż 30 dni pracownik musi przejść badania kontrolne PRZED dopuszczeniem do pracy.',
        podstawa: 'art. 229 § 2 Kodeksu pracy',
        dzialanie: 'Wystaw skierowanie na badania kontrolne przed powrotem pracownika.',
      });
    }
  }
  // 3) Szkolenie BHP okresowe
  const rodzaj = p.stanowiskoTyp && BHP_OKRESY[p.stanowiskoTyp] ? p.stanowiskoTyp : 'administracyjno_biurowe';
  const okres = BHP_OKRESY[rodzaj];
  if (p.bhpOstatnie) {
    const base = d0(p.bhpOstatnie);
    if (base != null) dodaj({
      kod: 'bhp_okresowe', tytul: `Szkolenie BHP okresowe (${okres.opis}, co ${okres.lata} ${okres.lata === 1 ? 'rok' : okres.lata < 5 ? 'lata' : 'lat'})`,
      data: iso(plusMies(base, okres.lata * 12)),
      skutek: 'Brak aktualnego szkolenia BHP to naruszenie obowiązków pracodawcy i częsty przedmiot kar PIP.',
      podstawa: 'art. 237(3) Kodeksu pracy; rozporządzenie MGiP z 27.07.2004',
      dzialanie: 'Zorganizuj szkolenie okresowe BHP.',
    });
  } else if (p.dataZatrudnienia) {
    // Pierwsze okresowe: do 12 miesięcy od zatrudnienia (kierujący — do 6).
    const base = d0(p.dataZatrudnienia);
    const mies = rodzaj === 'kierujacy' ? 6 : 12;
    if (base != null) dodaj({
      kod: 'bhp_pierwsze', tytul: `Pierwsze szkolenie BHP okresowe (do ${mies} mies. od zatrudnienia)`,
      data: iso(plusMies(base, mies)),
      skutek: 'Pierwsze szkolenie okresowe musi się odbyć w ustawowym terminie od rozpoczęcia pracy.',
      podstawa: 'rozporządzenie MGiP z 27.07.2004 (§ 15)',
      dzialanie: 'Zaplanuj pierwsze szkolenie okresowe BHP.',
    });
  }
  // 4) Koniec umowy terminowej — z wyprzedzeniem = okres wypowiedzenia
  if (p.umowaDo) {
    const koniec = d0(p.umowaDo);
    const ow = okresWypowiedzenia(p.dataZatrudnienia, iso(dzis));
    if (koniec != null) dodaj({
      kod: 'koniec_umowy', tytul: 'Koniec umowy na czas określony',
      data: p.umowaDo,
      skutek: `Jeśli chcesz zakończyć współpracę lub zmienić warunki, decyzję trzeba podjąć z wyprzedzeniem. Okres wypowiedzenia przy obecnym stażu: ${ow ? ow.tekst : 'ustal wg stażu'}.`,
      podstawa: 'art. 30 § 1 pkt 4 i art. 36 Kodeksu pracy',
      dzialanie: 'Zdecyduj: przedłużenie, umowa bezterminowa czy zakończenie. Pamiętaj o świadectwie pracy w dniu zakończenia.',
      okresWypowiedzenia: ow,
    });
  }
  // 5) Limit 33 miesięcy / 3 umów
  if (Array.isArray(p.umowy) && p.umowy.length) {
    const lim = limitTerminowych(p.umowy, iso(dzis));
    if (lim.przekroczony) {
      dodaj({
        kod: 'limit_przekroczony', tytul: 'Przekroczony limit umów terminowych',
        data: iso(dzis),
        skutek: `Zawarto ${lim.liczbaUmow} umów terminowych na łącznie ${lim.miesiace} mies. Po przekroczeniu 33 miesięcy lub 3 umów zatrudnienie z mocy prawa uważa się za umowę na czas nieokreślony.`,
        podstawa: 'art. 25(1) § 1 i § 3 Kodeksu pracy',
        dzialanie: 'Potwierdź status bezterminowy i zaktualizuj dokumentację kadrową.',
      });
    } else if (lim.pozostaloMiesiecy <= 3) {
      dodaj({
        kod: 'limit_blisko', tytul: 'Zbliża się limit 33 miesięcy umów terminowych',
        data: iso(plusMies(dzis, lim.pozostaloMiesiecy)),
        skutek: `Wykorzystano ${lim.miesiace} z 33 miesięcy (${lim.liczbaUmow} z 3 umów). Po przekroczeniu umowa staje się bezterminowa automatycznie.`,
        podstawa: 'art. 25(1) Kodeksu pracy',
        dzialanie: 'Zaplanuj, czy przechodzicie na umowę bezterminową.',
      });
    }
  }

  const rank = { po_terminie: 0, pilne: 1, zbliza_sie: 2 };
  out.sort((a, b) => (rank[a.status] - rank[b.status]) || (a.dniDoTerminu - b.dniDoTerminu));
  return out;
}

/** Terminy dla całego zespołu + statystyki. */
export function terminyZespolu(pracownicy = [], opts = {}) {
  const poz = [];
  for (const p of pracownicy) {
    for (const t of terminyPracownika(p, opts)) {
      poz.push({ pracownik: p.imieNazwisko || p.id || '(bez nazwy)', ...t });
    }
  }
  const rank = { po_terminie: 0, pilne: 1, zbliza_sie: 2 };
  poz.sort((a, b) => (rank[a.status] - rank[b.status]) || (a.dniDoTerminu - b.dniDoTerminu));
  return {
    ok: true,
    naDzien: opts.naDzien || new Date().toISOString().slice(0, 10),
    horyzontDni: opts.horyzont ?? 90,
    liczbaPracownikow: pracownicy.length,
    podsumowanie: {
      poTerminie: poz.filter(t => t.status === 'po_terminie').length,
      pilne: poz.filter(t => t.status === 'pilne').length,
      zblizaSie: poz.filter(t => t.status === 'zbliza_sie').length,
    },
    terminy: poz,
    zastrzezenie: 'Agent sygnalizuje terminy na podstawie wprowadzonych dat. Termin kolejnego badania określa lekarz medycyny pracy w orzeczeniu.',
  };
}
