import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';
import { bump } from '../lib/analytics.js';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

// WAŻNE: wyłącz parsowanie body przez Vercel
export const config = { api: { bodyParser: false } };

// Mapowanie Stripe Price ID → plan
// Uzupełnij po stworzeniu produktów w Stripe Dashboard
// Budujemy mapę pomijając nieustawione zmienne. Zapis obiektowy z kluczem
// [process.env.X] zamienia brakującą wartość w literalny klucz "undefined";
// przy dwóch brakach klucze się zlewają i wygrywa ostatni. Wyszukanie
// PRICE_TO_PLAN[undefined] — a priceId jest undefined w każdym webhooku, bo
// Stripe nie dołącza line_items bez rozwinięcia — zwracało wtedy przypadkowy
// plan i mogło nadać komuś Pro Maxa za cenę Kariery.
const PRICE_TO_PLAN = Object.fromEntries(
  [
    [process.env.STRIPE_PRICE_START,   'start'],
    [process.env.STRIPE_PRICE_KARIERA, 'kariera'],
    [process.env.STRIPE_PRICE_BIZNES,  'biznes'],
    [process.env.STRIPE_PRICE_PROMAX,  'promax'],
  ].filter(([id]) => typeof id === 'string' && id.startsWith('price_'))
);

// Przy przejściu na wyższy plan powstaje NOWA subskrypcja w Stripe, a stara
// biegnie dalej — klient płaciłby za obie naraz. Interfejs blokuje obniżenie
// planu, ale podwyższenie jest dozwolone, więc ten przypadek jest realny.
async function anulujStaraSubskrypcje(staraId, nowaId) {
  if (!staraId || staraId === nowaId) return;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { console.error('Zmiana planu: brak STRIPE_SECRET_KEY, stara subskrypcja', staraId, 'biegnie dalej'); return; }
  try {
    const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(staraId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + key },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) console.error('Nie udało się anulować starej subskrypcji', staraId, 'HTTP', r.status);
    else console.log('Anulowano starą subskrypcję po zmianie planu:', staraId);
  } catch (e) {
    console.error('Anulowanie starej subskrypcji nie powiodło się:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    req.on('data', chunk => { data = Buffer.concat([data, chunk]); });
    req.on('end', () => resolve(data.toString()));
    req.on('error', reject);
  });

  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  // Weryfikuj podpis Stripe
  let event;
  try {
    const parts = {};
    sig.split(',').forEach(p => { const [k,v] = p.split('='); parts[k] = (parts[k]||[]).concat(v); });
    const timestamp = parts['t'][0];
    const expected = crypto.createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`).digest('hex');
    // Porównanie o stałym czasie — zwykłe === kończy się na pierwszym różnym
    // bajcie, co teoretycznie pozwala odgadywać podpis bajt po bajcie.
    const bufOczek = Buffer.from(expected, 'hex');
    const zgodny = (parts['v1'] || []).some(kandydat => {
      let buf;
      try { buf = Buffer.from(kandydat, 'hex'); } catch { return false; }
      return buf.length === bufOczek.length && crypto.timingSafeEqual(buf, bufOczek);
    });
    if (!zgodny) throw new Error('Bad signature');
    if (Math.abs(Date.now()/1000 - parseInt(timestamp)) > 300) throw new Error('Too old');
    event = JSON.parse(rawBody);
  } catch(e) {
    console.error('Webhook verify failed:', e.message);
    return res.status(400).json({ error: e.message });
  }

  // ── Jednokrotna obsługa zdarzenia ──
  // Stripe ponawia dostarczenie po każdej odpowiedzi innej niż 2xx i po
  // przekroczeniu czasu odpowiedzi. Bez tej blokady powtórka wykonywała
  // subRef.set(...) jeszcze raz: pula Startu wracała do 5 pobrań, a expiresAt
  // przesuwało się o kolejne 30 dni liczone od chwili powtórki.
  // create() zawodzi, gdy dokument już istnieje — to operacja atomowa, więc
  // dwa równoległe dostarczenia nie prześlizgną się obok siebie.
  let zwolnijZdarzenie = null;
  if (event.id) {
    const ref = db.collection('stripeEvents').doc(event.id);
    try {
      await ref.create({ type: event.type, ts: Timestamp.now() });
      zwolnijZdarzenie = () => ref.delete().catch(() => {});
    } catch {
      console.log('Zdarzenie już obsłużone, pomijam:', event.id, event.type);
      return res.status(200).json({ received: true, duplicate: true });
    }
  }

  // async_payment_succeeded przychodzi dla metod z opóźnionym potwierdzeniem
  // (przelew, część metod lokalnych) — to wtedy pieniądze faktycznie wpływają.
  if (event.type === 'checkout.session.completed'
      || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;

    // Zakończenie kasy nie znaczy jeszcze, że zapłacono. Przy opóźnionym
    // potwierdzeniu payment_status bywa 'unpaid' i dostęp należy się dopiero
    // po async_payment_succeeded. Bez tego warunku wystarczyło rozpocząć
    // płatność przelewem i nigdy jej nie dokończyć, żeby dostać pakiet.
    const statusPlatnosci = session.payment_status;
    if (statusPlatnosci && statusPlatnosci !== 'paid' && statusPlatnosci !== 'no_payment_required') {
      console.log('Sesja zakończona, ale nieopłacona:', session.id, statusPlatnosci);
      return res.status(200).json({ received: true, warning: 'unpaid' });
    }
    const email = session.customer_email || session.customer_details?.email;
    const planFromMeta = session.metadata?.plan;
    const uidFromMeta = session.metadata?.uid;
    // Uwaga: Stripe nie dołącza line_items do webhooka bez rozwinięcia, więc
    // priceId jest tu prawie zawsze undefined. Wcześniej łańcuch kończył się
    // domyślnym 'biznes', przez co zakup dowolnego pakietu bez metadanych
    // zapisywał się jako Biznes — także droższy Pro Max. Lepiej odmówić
    // aktywacji i zostawić ślad w logu niż po cichu nadać zły plan.
    const priceId = session.line_items?.data?.[0]?.price?.id;
    const plan = planFromMeta || PRICE_TO_PLAN[priceId] || null;

    console.log(`Checkout completed: email=${email}, uid=${uidFromMeta || '—'}, plan=${plan || 'NIEROZPOZNANY'}, session=${session.id}`);

    if (!plan) {
      console.error('Nie rozpoznano planu — brak metadata.plan i brak dopasowania priceId. Sesja:', session.id);
      return res.status(200).json({ received: true, warning: 'plan_unresolved' });
    }

    if (uidFromMeta || email) {
      try {
        const auth = getAuth();
        // Pierwszeństwo ma uid z metadanych — ustawia je serwer z zalogowanej
        // sesji, więc jest pewny. Adres e-mail bywa wpisywany ręcznie w kasie
        // Stripe i może nie odpowiadać żadnemu kontu, przez co subskrypcja
        // nigdy się nie włączała, mimo pobranej opłaty.
        const user = uidFromMeta
          ? await auth.getUser(uidFromMeta)
          : await auth.getUserByEmail(email);
        const days = plan === 'start' ? 365 : 30;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        const subDoc = {
          plan,
          expiresAt: Timestamp.fromDate(expiresAt),
          activatedAt: Timestamp.now(),
          stripeSessionId: session.id,
          stripeSubscriptionId: session.subscription || null,
          email: user.email || email || null,
        };
        if (plan === 'start') subDoc.downloadsLeft = 5;
        // Trwały ślad akceptacji regulaminu w kasie Stripe. Komunikat przy tym
        // checkboxie mówi wprost o utracie prawa odstąpienia, więc zaakceptowanie
        // spełnia warunek z art. 38 ust. 1 pkt 13 u.p.k. Gdy zgody brak, klientowi
        // przysługuje pełne 14 dni na odstąpienie i tak trzeba go traktować.
        subDoc.zgodaRegulamin = session.consent?.terms_of_service === 'accepted';
        subDoc.zgodaRegulaminTs = Timestamp.now();
        const subRef = db.collection('users').doc(user.uid).collection('subscription').doc('current');
        const poprzednia = (await subRef.get()).data()?.stripeSubscriptionId || null;
        await subRef.set(subDoc);
        await anulujStaraSubskrypcje(poprzednia, session.subscription || null);
        // Identyfikator sesji jako id dokumentu — Stripe ponawia webhooki po
        // każdym błędzie i po przekroczeniu czasu odpowiedzi, a add() tworzyło
        // przy każdej próbie osobny wpis, zawyżając przychód w panelu.
        await db.collection('payments').doc(session.id).set({
          uid: user.uid, email: user.email || email || null, plan,
          stripeSessionId: session.id,
          // Spór (chargeback) przychodzi z payment_intent, nie z id sesji —
          // bez tego pola nie da się go powiązać z płatnością ani z kontem.
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          amount: session.amount_total || 0,
          currency: session.currency || 'pln',
          ts: Timestamp.now(),
        }, { merge: true });
        bump(db, 'subscription_active', { plan });
        console.log(`Plan "${plan}" saved for uid: ${user.uid}`);
      } catch(e) {
        console.error('Firestore save failed:', e.message);
        // Oddajemy blokadę, żeby ponowienie ze Stripe mogło dokończyć pracę —
        // inaczej klient zapłaciłby, a subskrypcja nigdy by się nie włączyła.
        if (zwolnijZdarzenie) await zwolnijZdarzenie();
        return res.status(500).json({ error: 'DB error' });
      }
    }
  }

  // Odnowienie subskrypcji — przedłuż expiresAt o 30 dni
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    if (invoice.billing_reason !== 'subscription_cycle') {
      return res.status(200).json({ received: true }); // pomiń pierwszą fakturę (obsłużona wyżej)
    }
    const subId = invoice.subscription;
    const customerEmail = invoice.customer_email;
    if (subId) {
      try {
        // Szukamy po identyfikatorze subskrypcji, a nie po adresie e-mail.
        // Adres w Stripe pochodzi z chwili zakupu i po zmianie adresu w koncie
        // przestaje pasować — odnowienie cicho przestawało przedłużać dostęp.
        let snap = null;
        const byId = await db.collectionGroup('subscription')
          .where('stripeSubscriptionId', '==', subId).limit(1).get();
        if (!byId.empty) snap = byId.docs[0];
        else if (customerEmail) {
          const auth = getAuth();
          const user = await auth.getUserByEmail(customerEmail);
          const s2 = await db.collection('users').doc(user.uid).collection('subscription').doc('current').get();
          if (s2.exists && s2.data().stripeSubscriptionId === subId) snap = s2;
        }
        if (snap) {
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await snap.ref.update({
            expiresAt: Timestamp.fromDate(expiresAt),
            cancelled: false,
            // Płatność przeszła — karencja i ostrzeżenie przestają obowiązywać.
            platnoscNieudana: false,
            platnoscNieudanaOd: null,
            platnoscKolejnaProba: null,
          });
          // uid odczytujemy ze ścieżki dokumentu: users/{uid}/subscription/current
          console.log('Subscription renewed for uid:', snap.ref.parent.parent?.id || '—');
        }
      } catch(e) {
        console.error('Renewal update failed:', e.message);
      }
    }
  }

  // Anulowanie subskrypcji — natychmiastowe odcięcie dostępu
  // ── Nieudane odnowienie: karencja zamiast natychmiastowego odcięcia ──
  // Wygasła karta albo chwilowo zablokowany limit to nie rezygnacja. Stripe
  // przez kilkanaście dni ponawia próbę pobrania; wcześniej w tym czasie
  // dostęp po prostu wygasał i płacący klient był odcinany w trakcie
  // odzyskiwania płatności. Dajemy 7 dni karencji i oznaczamy konto, żeby
  // aplikacja mogła poprosić o aktualizację karty.
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    const subId = invoice.subscription;
    if (!subId) return res.status(200).json({ received: true });
    try {
      const byId = await db.collectionGroup('subscription')
        .where('stripeSubscriptionId', '==', subId).limit(1).get();
      if (!byId.empty) {
        const ref = byId.docs[0].ref;
        const dane = byId.docs[0].data();
        const kolejnaProba = invoice.next_payment_attempt
          ? Timestamp.fromDate(new Date(invoice.next_payment_attempt * 1000)) : null;
        // Zdarzenie przychodzi przy KAŻDEJ próbie ponowienia, więc karencję
        // przyznajemy tylko raz — inaczej każda kolejna próba przedłużałaby
        // dostęp w nieskończoność.
        if (dane.platnoscNieudana) {
          await ref.update({ platnoscKolejnaProba: kolejnaProba });
          console.log('Kolejna nieudana próba płatności, karencja już trwa:', ref.path);
        } else {
          const teraz = Date.now();
          const obecne = dane.expiresAt?.toDate?.()?.getTime() || teraz;
          const doKiedy = new Date(Math.max(obecne, teraz + 7 * 24 * 60 * 60 * 1000));
          await ref.update({
            expiresAt: Timestamp.fromDate(doKiedy),
            platnoscNieudana: true,
            platnoscNieudanaOd: Timestamp.now(),
            platnoscKolejnaProba: kolejnaProba,
          });
          bump(db, 'payment_failed', { plan: dane.plan || 'nieznany' });
          console.log('Karencja 7 dni po nieudanej płatności:', ref.path);
        }
      }
    } catch (e) {
      console.error('Obsługa nieudanej płatności nie powiodła się:', e.message);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const customerId = sub.customer;
    try {
      // Znajdź użytkownika po stripeSubscriptionId
      const snap = await db.collectionGroup('subscription')
        .where('stripeSubscriptionId', '==', sub.id).limit(1).get();
      if (!snap.empty) {
        const ref = snap.docs[0].ref;
        await ref.update({ expiresAt: Timestamp.fromDate(new Date()), cancelled: true, cancelledAt: Timestamp.now() });
        console.log(`Subscription cancelled for doc: ${ref.path}`);
      }
    } catch(e) {
      console.error('Subscription delete failed:', e.message);
    }
  }

  // Chargeback — natychmiastowe odcięcie dostępu
  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object;
    const chargeId = dispute.charge;
    try {
      // Wcześniej porównywano payment_intent (pi_...) z id sesji checkout
      // (cs_...) — wartości z dwóch różnych przestrzeni, więc zapytanie nigdy
      // nic nie zwracało i dostęp po chargebacku pozostawał aktywny.
      const snap = await db.collection('payments')
        .where('paymentIntentId', '==', dispute.payment_intent).limit(1).get();
      if (!snap.empty) {
        const uid = snap.docs[0].data().uid;
        if (uid) {
          await db.collection('users').doc(uid).collection('subscription').doc('current')
            .update({ expiresAt: Timestamp.fromDate(new Date()), cancelled: true, chargebackAt: Timestamp.now() });
          console.log(`Access revoked due to dispute for uid: ${uid}, charge: ${chargeId}`);
        }
      }
    } catch(e) {
      console.error('Dispute handling failed:', e.message);
    }
  }

  return res.status(200).json({ received: true });
}
