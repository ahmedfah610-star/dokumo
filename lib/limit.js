// ─────────────────────────────────────────────────────────────────────────
// lib/limit.js — trwały licznik żądań w Firestore.
//
// Po co, skoro limitery już są: te w api/*.js trzymają liczniki w mapie w
// pamięci procesu (`handler._rl`, `_rateMap`). Na Vercelu to nie jest limit.
// Instancji funkcji jest wiele, wstają na żądanie i giną, a każda ma własną,
// pustą mapę — więc „5 prób na minutę" znaczy w praktyce „5 prób razy tyle
// instancji, ile atakujący zdoła postawić równoległymi żądaniami".
//
// Dla zwykłego dławienia ruchu (ochrona przed przypadkową pętlą w kliencie)
// mapa w pamięci wystarcza. Dla zgadywania sekretu — nie, i tylko tam warto
// płacić za zapis do Firestore.
//
// firebase-admin ładujemy leniwie, bo api/nip-lookup.js serwuje też konfigurację
// Firebase pobieraną przez KAŻDĄ podstronę. Import na poziomie modułu dokładałby
// inicjalizację admin SDK do każdego zimnego startu tej ścieżki.
// ─────────────────────────────────────────────────────────────────────────

let _db = null;

async function baza() {
  if (_db) return _db;
  const [app, firestore] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore'),
  ]);
  if (!app.getApps().length) {
    app.initializeApp({ credential: app.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  _db = firestore.getFirestore();
  return _db;
}

/**
 * Okno stałe (fixed window) — proste i wystarczające do dławienia zgadywania.
 * @param {string} nazwa   grupa licznika, np. 'kod-rabatowy'
 * @param {string} klucz   co ograniczamy, zwykle IP
 * @param {number} max     ile żądań w oknie
 * @param {number} oknoMs  długość okna
 * @returns {Promise<{ok: boolean, blad?: boolean}>} ok=false → przekroczono limit,
 *          blad=true → Firestore nie odpowiedział i decyzji nie podjęto
 */
export async function limitTrwaly(nazwa, klucz, max, oknoMs) {
  const id = nazwa + ':' + String(klucz || 'brak').replace(/[^\w.:-]/g, '_').slice(0, 120);
  try {
    const db = await baza();
    const ref = db.collection('rateLimits').doc(id);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const teraz = Date.now();
      const dane = snap.exists ? snap.data() : null;
      const wOknie = dane && typeof dane.start === 'number' && teraz - dane.start < oknoMs;
      const start = wOknie ? dane.start : teraz;
      const n = (wOknie ? (dane.n || 0) : 0) + 1;
      tx.set(ref, { start, n, updatedAt: new Date() });
      return { ok: n <= max };
    });
  } catch (e) {
    console.error('limitTrwaly:', e.message);
    return { ok: false, blad: true };
  }
}
