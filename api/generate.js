import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();
const auth = getAuth();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Brak zapytania' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Brak klucza GEMINI_API_KEY' });

  // ── Weryfikacja tokenu ──
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Zaloguj się, aby generować dokumenty.' });

  let uid;
  try { ({ uid } = await auth.verifyIdToken(token)); }
  catch { return res.status(401).json({ error: 'Sesja wygasła — zaloguj się ponownie.' }); }

  // ── Sprawdź subskrypcję w Firestore ──
  const subSnap = await db.collection('users').doc(uid).collection('subscription').doc('current').get();
  if (!subSnap.exists || subSnap.data().expiresAt.toDate() < new Date()) {
    return res.status(403).json({ error: 'Brak aktywnego Pakietu Biznes.' });
  }

  // ── Generuj przez Gemini ──
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:8000} }) }
    );
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return res.status(500).json({ error: 'Pusta odpowiedź AI' });

    // ── Zapisz dokument w Firestore ──
    const { docId, docName, docCat, docIcon, docCatLabel } = req.body;
    const ref = db.collection('users').doc(uid).collection('documents').doc();
    await ref.set({
      id: ref.id, typeId: docId||'unknown', name: docName||'Dokument', text,
      cat: docCat||'inne', icon: docIcon||'📄', catLabel: docCatLabel||'Inne',
      status: 'generated', createdAt: new Date(), updatedAt: new Date(),
    });

    return res.status(200).json({ text });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
