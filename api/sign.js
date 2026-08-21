import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://dokumoflow.com';
const FROM = 'Dokumo Podpisy <noreply@dokumoflow.com>';

// Escape uzytkowniczego stringa w kontekscie HTML email (chroni przed XSS)
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ from: FROM, to, subject, html }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error('Resend error (non-fatal):', e.message);
  }
}

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const auth = getAuth();
const db = getFirestore();

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
};

function getIP(req) {
  return ((req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown') + '').split(',')[0].trim();
}

function hashDoc(text) {
  return createHash('sha256').update(text).digest('hex');
}

// Podpis przychodzi jako data URL obrazka z <canvas>. Sprawdzamy prefiks, bo
// wartość ląduje potem w atrybucie src="…" na stronie podpisywania i w PDF.
function validSigDataUrl(s) {
  return typeof s === 'string'
    && s.length <= 300000
    && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validEmail(s) { return typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s); }

// Nazwy trafiają do e-maili i na stronę podpisu — krótkie i bez znaczników.
function cleanName(s, max = 120) {
  return String(s == null ? '' : s).replace(/[\r\n<>]/g, ' ').trim().slice(0, max);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dokumoflow.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // POST — create signing session (party 1 signs)
  if (req.method === 'POST') {
    // Uwierzytelnienie OBOWIĄZKOWE. Wcześniej token był opcjonalny, a błąd
    // weryfikacji przechodził po cichu — czyli dowolna osoba z internetu mogła
    // utworzyć sesję i kazać nam wysłać e-mail z naszej domeny pod dowolny
    // adres, z treścią, którą sama ustawiła. Wszystkie generatory i tak
    // wysyłają tu token, więc dla legalnego ruchu nic się nie zmienia.
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Wymagane logowanie' });
    let uid;
    try { ({ uid } = await auth.verifyIdToken(token)); }
    catch { return res.status(401).json({ error: 'Nieprawidłowy token' }); }

    const b = req.body || {};
    const docText = b.docText;
    const docName = cleanName(b.docName, 160) || 'Dokument';
    const party1Name = cleanName(b.party1Name);
    const party1Date = cleanName(b.party1Date, 40);
    const party1Sig = b.party1Sig;
    const party1Email = validEmail(b.party1Email) ? b.party1Email : null;
    const party2Email = validEmail(b.party2Email) ? b.party2Email : null;

    if (!docText || !party1Name || !party1Sig) {
      return res.status(400).json({ error: 'Brak wymaganych danych' });
    }
    if (typeof docText !== 'string' || docText.length > 200000) {
      return res.status(400).json({ error: 'Dokument zbyt duży' });
    }
    if (!validSigDataUrl(party1Sig)) {
      return res.status(400).json({ error: 'Nieprawidłowy format podpisu' });
    }

    const ip = getIP(req);
    const docHash = hashDoc(docText);
    const ref = db.collection('signingSessions').doc();
    const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await ref.set({
      id: ref.id,
      docText,
      docName,
      docHash,
      createdBy: uid,
      createdAt: Timestamp.now(),
      expiresAt,
      status: 'waiting_party2',
      party1: {
        name: party1Name,
        sig: party1Sig,
        date: party1Date,
        signedAt: Timestamp.now(),
        ip,
      },
      party1Email,
      party2Email,
      party2: null,
      auditLog: [
        { event: 'session_created', name: party1Name, ip, ts: new Date().toISOString(), docHash }
      ],
    });

    // Wyślij email do strony 2 z linkiem
    if (party2Email) {
      const link = `${BASE_URL}/podpisz.html?id=${ref.id}`;
      const safeName = escHtml(party1Name);
      const safeDocName = escHtml(docName || 'Dokument');
      await sendEmail({
        to: party2Email,
        subject: `${party1Name} zaprasza Cię do podpisania dokumentu — ${docName || 'Dokument'}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111">
            <div style="margin-bottom:24px">
              <img src="${BASE_URL}/logo2.png" alt="Dokumo" style="height:28px">
            </div>
            <h2 style="font-size:20px;font-weight:800;margin-bottom:8px">Prośba o podpisanie dokumentu</h2>
            <p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:24px">
              <strong>${safeName}</strong> prosi Cię o złożenie elektronicznego podpisu pod dokumentem:<br>
              <strong>${safeDocName}</strong>
            </p>
            <a href="${link}" style="display:inline-block;padding:14px 28px;background:#111;color:#fff;font-weight:700;font-size:15px;border-radius:50px;text-decoration:none">
              ✍ Podpisz dokument
            </a>
            <p style="margin-top:24px;font-size:12px;color:#999;line-height:1.6">
              Link jest ważny 30 dni. Podpisując dokument składasz prosty podpis elektroniczny w rozumieniu art. 3 pkt 10 rozporządzenia eIDAS (UE 910/2014).<br><br>
              Jeśli nie spodziewałeś się tej wiadomości, możesz ją zignorować.
            </p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
            <p style="font-size:11px;color:#bbb">Dokumo · dokumoflow.com · Usługa podpisu elektronicznego</p>
          </div>`,
      });
    }

    return res.status(200).json({ sessionId: ref.id });
  }

  // GET — load session (for party 2 signing page)
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Brak id' });

    const snap = await db.collection('signingSessions').doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Sesja nie istnieje' });

    const d = snap.data();
    if (d.expiresAt && d.expiresAt.toDate() < new Date() && d.status !== 'completed') {
      return res.status(410).json({ error: 'Link wygasł. Sesja podpisywania jest nieaktywna.' });
    }

    const completed = d.status === 'completed';
    return res.status(200).json({
      docText: d.docText,
      docName: d.docName,
      docHash: d.docHash,
      status: d.status,
      party1Name: d.party1?.name,
      party1Date: d.party1?.date,
      party1Sig: d.party1?.sig || null,
      party2: d.party2 ? {
        name: d.party2.name,
        date: d.party2.date,
        ...(completed ? { sig: d.party2.sig } : {}),
      } : null,
    });
  }

  // PATCH — party 2 signs, returns full data for PDF generation
  if (req.method === 'PATCH') {
    const { id, party2Sig } = req.body || {};
    const party2Name = cleanName((req.body || {}).party2Name);
    if (!id || typeof id !== 'string' || id.length > 64 || !party2Name || !party2Sig) {
      return res.status(400).json({ error: 'Brak wymaganych danych' });
    }
    if (!validSigDataUrl(party2Sig)) {
      return res.status(400).json({ error: 'Nieprawidłowy format podpisu' });
    }

    const ref = db.collection('signingSessions').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Sesja nie istnieje' });
    const snapData = snap.data();
    if (snapData.status === 'completed') {
      return res.status(400).json({ error: 'Dokument już podpisany' });
    }
    if (snapData.expiresAt && snapData.expiresAt.toDate() < new Date()) {
      return res.status(410).json({ error: 'Link wygasł. Sesja podpisywania jest nieaktywna.' });
    }

    const ip = getIP(req);
    const now = new Date();
    const dateStr = now.toLocaleDateString('pl-PL') + ' ' + now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    const existing = snapData;

    await ref.update({
      status: 'completed',
      completedAt: Timestamp.now(),
      party2: { name: party2Name, sig: party2Sig, date: dateStr, signedAt: Timestamp.now(), ip },
      auditLog: [
        ...(existing.auditLog || []),
        { event: 'party2_signed', name: party2Name, ip, ts: now.toISOString(), docHash: existing.docHash }
      ],
    });

    const updated = (await ref.get()).data();

    // Wyślij potwierdzenie do obu stron
    // Wszystkie nazwy w tym szablonie pochodzą od użytkowników, więc każda idzie
    // przez escHtml — inaczej strona 2 mogłaby wstrzyknąć HTML w e-mail strony 1.
    const confirmHtml = (recipientNameRaw, otherNameRaw) => {
    const recipientName = escHtml(recipientNameRaw);
    const otherName = escHtml(otherNameRaw);
    return `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111">
        <div style="margin-bottom:24px"><img src="${BASE_URL}/logo2.png" alt="Dokumo" style="height:28px"></div>
        <div style="padding:16px 20px;background:#f0fdf4;border-radius:12px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
          <span style="font-size:24px">✓</span>
          <div>
            <div style="font-weight:700;font-size:15px">Dokument podpisany przez obie strony</div>
            <div style="font-size:13px;color:#555;margin-top:2px">${escHtml(updated.docName || 'Dokument')}</div>
          </div>
        </div>
        <p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:8px">
          Cześć <strong>${recipientName}</strong>,<br>
          dokument został podpisany przez Ciebie i <strong>${otherName}</strong>.
        </p>
        <p style="font-size:13px;color:#888;line-height:1.6">
          Sygnatariusze: ${escHtml(updated.party1.name)} (${escHtml(updated.party1.date)}) · ${escHtml(party2Name)} (${dateStr})<br>
          Hash dokumentu (SHA-256): <code style="font-size:11px">${updated.docHash}</code>
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:11px;color:#bbb">Dokumo · dokumoflow.com · Podpisy zgodne z eIDAS art. 3 pkt 10</p>
      </div>`;
    };

    if (updated.party2Email) {
      await sendEmail({
        to: updated.party2Email,
        subject: `Dokument podpisany — ${updated.docName || 'Dokument'}`,
        html: confirmHtml(party2Name, updated.party1.name),
      });
    }
    if (updated.party1Email) {
      await sendEmail({
        to: updated.party1Email,
        subject: `Dokument podpisany — ${updated.docName || 'Dokument'}`,
        html: confirmHtml(updated.party1.name, party2Name),
      });
    }

    return res.status(200).json({
      docText: updated.docText,
      docName: updated.docName,
      docHash: updated.docHash,
      party1: { name: updated.party1.name, sig: updated.party1.sig, date: updated.party1.date, ip: updated.party1.ip },
      party2: { name: party2Name, sig: party2Sig, date: dateStr, ip },
    });
  }

  return res.status(405).end();
}
