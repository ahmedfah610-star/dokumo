import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { hasSensitivePII, hasSensitivePIIInJson } from '../lib/pii.js';

// Połączony endpoint dokumentów — scala dawne get-docs.js (GET) i update-doc.js (POST/DELETE).
// Routing po metodzie HTTP; stare ścieżki /api/get-docs i /api/update-doc działają
// dalej dzięki rewrite'om w vercel.json. Zachowanie obu endpointów bez zmian.

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

// Rate limit GET (lista) — 30 req/min per uid
const _rlGet = new Map();
function checkRlGet(uid) {
  const now = Date.now();
  const e = _rlGet.get(uid) || { c: 0, r: now + 60000 };
  if (now > e.r) { e.c = 0; e.r = now + 60000; }
  if (e.c >= 30) return false;
  e.c++; _rlGet.set(uid, e); return true;
}

// Rate limit POST (update) — 60 req/min per uid
const _rlPost = new Map();
function checkRlPost(uid) {
  const now = Date.now();
  const e = _rlPost.get(uid) || { count: 0, reset: now + 60000 };
  if (now > e.reset) { e.count = 0; e.reset = now + 60000; }
  if (e.count >= 60) return false;
  e.count++; _rlPost.set(uid, e); return true;
}

export default async function handler(req, res) {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST' && method !== 'DELETE') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });

  let uid;
  try { ({ uid } = await auth.verifyIdToken(token)); }
  catch { return res.status(401).json({ error: 'Nieważny token' }); }

  // ── GET — lista dokumentów (dawniej get-docs.js) ──
  if (method === 'GET') {
    if (!checkRlGet(uid)) return res.status(429).json({ error: 'Zbyt wiele żądań.' });
    const snap = await db.collection('users').doc(uid).collection('documents')
      .orderBy('createdAt', 'desc').limit(100).get();
    const docs = snap.docs.map(d => ({
      ...d.data(), id: d.id,
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt:  d.data().updatedAt?.toDate?.()?.toISOString()  || null,
    }));
    return res.status(200).json({ docs });
  }

  // ── DELETE — usuń dokument (dawniej update-doc.js) ──
  if (method === 'DELETE') {
    const { docId } = req.body;
    if (!docId) return res.status(400).json({ error: 'Brak docId' });
    await db.collection('users').doc(uid).collection('documents').doc(docId).delete();
    return res.status(200).json({ ok: true });
  }

  // ── POST — utwórz nowy dokument (dawniej save-doc.js) ──
  // Rozróżnienie: obecność docName = zapis nowego dokumentu (docId to tu typeId, nie Firestore ID).
  if (req.body.docName) {
    if (!checkRlPost(uid)) return res.status(429).json({ error: 'Zbyt wiele żądań. Spróbuj za chwilę.' });
    const { docName, docCat, docIcon, docCatLabel, text, cvDataJson, covDataJson, fakDataJson } = req.body;
    const MAX = 500000;
    if (typeof docName !== 'string' || !docName) return res.status(400).json({ error: 'Brak nazwy dokumentu' });
    if (docName.length > 200) return res.status(400).json({ error: 'Nazwa dokumentu zbyt długa' });
    if (typeof text === 'string' && text.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });
    if (typeof cvDataJson === 'string' && cvDataJson.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });
    if (typeof covDataJson === 'string' && covDataJson.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });
    if (typeof fakDataJson === 'string' && fakDataJson.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });
    if (hasSensitivePII(text) || hasSensitivePIIInJson(cvDataJson) ||
        hasSensitivePIIInJson(covDataJson) || hasSensitivePIIInJson(fakDataJson)) {
      return res.status(200).json({
        ok: true, skipped: true, reason: 'pii_detected',
        message: 'Dokument zawiera wrażliwe dane (PESEL, nr dowodu, paszportu lub karty płatniczej) — pobrano lokalnie, nie zapisano w chmurze.'
      });
    }
    try {
      const countSnap = await db.collection('users').doc(uid).collection('documents').count().get();
      if (countSnap.data().count >= 500) return res.status(429).json({ error: 'Osiągnięto limit dokumentów' });
    } catch(_) {}
    const docId = req.body.docId || 'cv';
    const ref = db.collection('users').doc(uid).collection('documents').doc();
    const payload = {
      id: ref.id, typeId: docId, name: docName,
      text: text || '', cat: docCat || 'kariera',
      icon: docIcon || '📄', catLabel: docCatLabel || 'Kariera',
      status: 'generated', createdAt: new Date(), updatedAt: new Date(),
    };
    if (cvDataJson) payload.cvDataJson = cvDataJson;
    if (covDataJson) payload.covDataJson = covDataJson;
    if (fakDataJson) payload.fakDataJson = fakDataJson;
    await ref.set(payload);
    return res.status(200).json({ ok: true, id: ref.id });
  }

  // ── POST — aktualizuj dokument (dawniej update-doc.js) ──
  if (!checkRlPost(uid)) {
    return res.status(429).json({ error: 'Zbyt wiele żądań. Spróbuj za chwilę.' });
  }

  const { docId, text, name, covDataJson, fakDataJson } = req.body;
  if (!docId) return res.status(400).json({ error: 'Brak docId' });

  const MAX = 500000;
  if (typeof text === 'string' && text.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });
  if (typeof covDataJson === 'string' && covDataJson.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });
  if (typeof fakDataJson === 'string' && fakDataJson.length > MAX) return res.status(400).json({ error: 'Dane zbyt duże' });

  // PII check — odrzucamy update zawierajace PESEL (RODO, spójnie z save).
  // User edytuje doc lokalnie, ale update do Firestore jest blokowany.
  if (hasSensitivePII(text) || hasSensitivePIIInJson(covDataJson) || hasSensitivePIIInJson(fakDataJson)) {
    return res.status(200).json({
      ok: true, skipped: true, reason: 'pii_detected',
      message: 'Zmiana zawiera wrażliwe dane (PESEL, nr dowodu, paszportu lub karty płatniczej) — nie zapisano w chmurze.'
    });
  }

  try {
    const ref = db.collection('users').doc(uid).collection('documents').doc(docId);
    const update = { text: text || '', updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (covDataJson !== undefined) update.covDataJson = covDataJson;
    if (fakDataJson !== undefined) update.fakDataJson = fakDataJson;
    await ref.update(update);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
