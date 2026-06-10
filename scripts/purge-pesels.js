#!/usr/bin/env node
/**
 * Jednorazowy purge PESEL-i z Firestore.
 *
 * Skanuje pola w users/{uid}/documents/{docId} i users/{uid}/drafts/cv,
 * szuka 11-cyfrowych sekwencji ktorych checksum pasuje do PESEL,
 * zamienia na *********** (11 gwiazdek).
 *
 * Uzycie:
 *   node scripts/purge-pesels.js --dry-run    # tylko raport, nic nie zmienia
 *   node scripts/purge-pesels.js              # robi update'y w Firestore
 *
 * Zwraca raport: liczba przeskanowanych dokumentow, znalezionych PESEL-i,
 * zaktualizowanych dokumentow.
 *
 * Wymaga FIREBASE_SERVICE_ACCOUNT w env (jak w api/*.js)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Brak env FIREBASE_SERVICE_ACCOUNT');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run');
const MASK = '*'.repeat(11);

// Walidacja PESEL (checksum) — minimalizuje false positives
// (matchowanie dowolnej sekwencji 11 cyfr lapaloby tez np. nr konta fragmenty).
function isValidPesel(s) {
  if (!/^\d{11}$/.test(s)) return false;
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(s[i]) * w[i];
  const control = (10 - (sum % 10)) % 10;
  return control === parseInt(s[10]);
}

// Maskuje wszystkie wystapienia validnych PESEL w stringu.
// Sprawdza tez sekwencje 11 cyfr przedzielone spacjami/myslnikami
// na wypadek gdyby user wpisal "00 00 00 00 000".
function maskPeselsInString(str) {
  if (typeof str !== 'string' || !str) return { result: str, count: 0 };
  let count = 0;
  // Dopasuj 11 kolejnych cyfr (z opcjonalnymi separatorami w srodku do max 14 znakow)
  const result = str.replace(/(\d[\d\s\-]{9,16}\d)/g, (match) => {
    const digits = match.replace(/[\s\-]/g, '');
    if (digits.length !== 11) return match;
    if (!isValidPesel(digits)) return match;
    count++;
    return MASK;
  });
  return { result, count };
}

// Rekursywnie maskuje stringi w obiekcie/array
function maskPeselsInValue(v) {
  if (typeof v === 'string') {
    return maskPeselsInString(v);
  }
  if (Array.isArray(v)) {
    let total = 0;
    const arr = v.map(item => {
      const r = maskPeselsInValue(item);
      total += r.count;
      return r.result;
    });
    return { result: arr, count: total };
  }
  if (v && typeof v === 'object') {
    let total = 0;
    const obj = {};
    for (const k of Object.keys(v)) {
      const r = maskPeselsInValue(v[k]);
      total += r.count;
      obj[k] = r.result;
    }
    return { result: obj, count: total };
  }
  return { result: v, count: 0 };
}

// Maskuje PESEL-e w JSON-string field (np. cvDataJson)
function maskPeselsInJsonString(jsonStr) {
  if (typeof jsonStr !== 'string' || !jsonStr) return { result: jsonStr, count: 0 };
  let parsed;
  try { parsed = JSON.parse(jsonStr); } catch { return maskPeselsInString(jsonStr); }
  const r = maskPeselsInValue(parsed);
  if (r.count === 0) return { result: jsonStr, count: 0 };
  return { result: JSON.stringify(r.result), count: r.count };
}

async function processDocument(docRef, data) {
  const update = {};
  let totalFound = 0;

  // Pola plain string ktore moga zawierac PESEL
  const STRING_FIELDS = ['text', 'name'];
  for (const f of STRING_FIELDS) {
    if (typeof data[f] === 'string' && data[f]) {
      const r = maskPeselsInString(data[f]);
      if (r.count > 0) {
        update[f] = r.result;
        totalFound += r.count;
      }
    }
  }

  // Pola JSON-stringi
  const JSON_FIELDS = ['cvDataJson', 'covDataJson', 'fakDataJson', 'umowaDataJson', 'docDataJson'];
  for (const f of JSON_FIELDS) {
    if (typeof data[f] === 'string' && data[f]) {
      const r = maskPeselsInJsonString(data[f]);
      if (r.count > 0) {
        update[f] = r.result;
        totalFound += r.count;
      }
    }
  }

  if (totalFound > 0 && !DRY_RUN) {
    update.peselPurgedAt = Timestamp.now();
    await docRef.update(update);
  }

  return totalFound;
}

async function main() {
  const stats = {
    users: 0,
    documents: 0,
    drafts: 0,
    peselsFound: 0,
    documentsUpdated: 0,
  };

  console.log('🔍 Starting PESEL purge' + (DRY_RUN ? ' (DRY RUN)' : '') + '...\n');

  // Iterate all users
  const usersSnap = await db.collection('users').get();
  stats.users = usersSnap.size;
  console.log('Found ' + stats.users + ' users');

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;

    // documents subcollection
    const docsSnap = await db.collection('users').doc(uid).collection('documents').get();
    for (const d of docsSnap.docs) {
      stats.documents++;
      try {
        const found = await processDocument(d.ref, d.data());
        if (found > 0) {
          stats.peselsFound += found;
          stats.documentsUpdated++;
          console.log('  ✓ ' + uid.slice(0, 8) + '/.../documents/' + d.id + ': ' + found + ' PESEL-i');
        }
      } catch (e) {
        console.error('  ✗ ' + uid.slice(0, 8) + '/.../documents/' + d.id + ':', e.message);
      }
    }

    // drafts/cv (single doc per user)
    try {
      const draftRef = db.collection('users').doc(uid).collection('drafts').doc('cv');
      const draftDoc = await draftRef.get();
      if (draftDoc.exists) {
        stats.drafts++;
        const found = await processDocument(draftRef, draftDoc.data());
        if (found > 0) {
          stats.peselsFound += found;
          stats.documentsUpdated++;
          console.log('  ✓ ' + uid.slice(0, 8) + '/drafts/cv: ' + found + ' PESEL-i');
        }
      }
    } catch (e) {
      console.error('  ✗ ' + uid.slice(0, 8) + '/drafts/cv:', e.message);
    }
  }

  console.log('\n📊 Raport:');
  console.log('  Userów:                ' + stats.users);
  console.log('  Dokumentów sprawdzonych: ' + stats.documents);
  console.log('  Draftów sprawdzonych:    ' + stats.drafts);
  console.log('  Znaleziono PESEL-i:     ' + stats.peselsFound);
  console.log('  Zaktualizowanych dok.:  ' + stats.documentsUpdated);
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — nic nie zmienione. Odpal bez --dry-run zeby faktycznie zmaskowac.');
  } else {
    console.log('\n✅ Done.');
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
