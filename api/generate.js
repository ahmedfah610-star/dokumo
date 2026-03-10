import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Inicjalizacja Firebase Admin (tylko raz)
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const auth = getAuth();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metoda niedozwolona' });
  }

  // ── 1. WERYFIKACJA TOKENU FIREBASE ──
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace('Bearer ', '').trim();

  if (!idToken) {
    return res.status(401).json({ error: 'Musisz być zalogowany, aby generować dokumenty.' });
  }

  let uid;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: 'Nieważny token — zaloguj się ponownie.' });
  }

  // ── 2. SPRAWDZENIE SUBSKRYPCJI PRO ──
  const subDoc = await db.collection('users').doc(uid).collection('subscription').doc('current').get();
  if (!subDoc.exists) {
    return res.status(403).json({ error: 'Brak aktywnego Pakietu Biznes. Kup subskrypcję, aby generować dokumenty.' });
  }
  const sub = subDoc.data();
  const isActive = sub.expiresAt && sub.expiresAt.toDate() > new Date();
  if (!isActive) {
    return res.status(403).json({ error: 'Twój Pakiet Biznes wygasł. Odnów subskrypcję.' });
  }

  // ── 3. GENEROWANIE DOKUMENTU ──
  const { prompt, docId, docName, docCat, docIcon, docCatLabel } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Brak treści zapytania' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Brak klucza API — skontaktuj się z administratorem' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 8000 }
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return res.status(500).json({ error: 'Pusta odpowiedź od AI' });

    // ── 4. ZAPIS DO FIRESTORE ──
    const newDocRef = db.collection('users').doc(uid).collection('documents').doc();
    await newDocRef.set({
      id: newDocRef.id,
      typeId: docId || 'unknown',
      name: docName || 'Dokument',
      text,
      cat: docCat || 'inne',
      icon: docIcon || '📄',
      catLabel: docCatLabel || 'Inne',
      status: 'generated',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return res.status(200).json({ text, firestoreId: newDocRef.id });

  } catch (err) {
    return res.status(500).json({ error: 'Błąd serwera: ' + err.message });
  }
}
