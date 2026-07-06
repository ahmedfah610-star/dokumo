import { FieldValue } from 'firebase-admin/firestore';

// Lekka analityka zdarzeń — agregacja dzienna, jeden dokument na dzień:
//   analyticsDaily/{YYYY-MM-DD} = { day, events: { typ: N }, breakdown: { typ: { klucz: N } } }
// Zapis jest fire-and-forget: NIGDY nie wywraca żądania biznesowego. Wołaj bez await
// w gorącej ścieżce (albo z await tam, gdzie i tak czekasz na inne zapisy).

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

export async function bump(db, type, breakdown) {
  try {
    if (!db || typeof type !== 'string' || !/^[a-z0-9_]{1,40}$/i.test(type)) return;
    const day = todayUTC();
    const upd = { day, updatedAt: new Date(), events: { [type]: FieldValue.increment(1) } };
    if (breakdown && typeof breakdown === 'object') {
      const b = {};
      for (const [k, v] of Object.entries(breakdown)) {
        if (typeof v !== 'string') continue;
        const val = v.slice(0, 40).replace(/[^a-z0-9_-]/gi, '_');
        if (val) { b[k] = b[k] || {}; b[k][val] = FieldValue.increment(1); }
      }
      if (Object.keys(b).length) upd.breakdown = { [type]: b };
    }
    // Zagnieżdżone mapy z sentinelami increment scalają się głęboko przy merge:true.
    await db.collection('analyticsDaily').doc(day).set(upd, { merge: true });
  } catch (e) {
    console.error('analytics bump error:', e.message);
  }
}

// Odczyt ostatnich N dni dla panelu admina. Zwraca [{ day, events, breakdown }] rosnąco.
export async function readDaily(db, days = 14) {
  const out = [];
  const now = Date.now();
  const wanted = [];
  for (let i = days - 1; i >= 0; i--) {
    wanted.push(new Date(now - i * 86400000).toISOString().slice(0, 10));
  }
  try {
    const refs = wanted.map(d => db.collection('analyticsDaily').doc(d));
    const snaps = await db.getAll(...refs);
    for (let i = 0; i < snaps.length; i++) {
      const s = snaps[i];
      out.push({ day: wanted[i], events: (s.exists && s.data().events) || {}, breakdown: (s.exists && s.data().breakdown) || {} });
    }
  } catch (e) {
    console.error('analytics readDaily error:', e.message);
    return wanted.map(d => ({ day: d, events: {}, breakdown: {} }));
  }
  return out;
}
