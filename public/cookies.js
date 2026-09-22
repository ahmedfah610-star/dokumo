/* Baner zgody na cookies — wspólny dla całego serwisu.
   Zgoda domyślna (denied) ustawiana jest inline w <head> każdej strony,
   przed załadowaniem gtag.js. Ten plik odpowiada wyłącznie za pobranie
   decyzji użytkownika i przekazanie jej do Consent Mode. */
(function () {
  var KLUCZ = 'dokumo_cookies';

  function odczytaj() {
    try { return localStorage.getItem(KLUCZ); } catch (e) { return null; }
  }
  function zapisz(wartosc) {
    try { localStorage.setItem(KLUCZ, wartosc); } catch (e) {}
  }
  function zgoda(stan) {
    if (typeof gtag !== 'function') return;
    gtag('consent', 'update', {
      analytics_storage: stan,
      ad_storage: stan,
      ad_user_data: stan,
      ad_personalization: stan
    });
  }

  // Decyzja już podjęta — baner się nie pokazuje.
  // Zgodę „accepted" przekazuje inline'owy skrypt w <head>, żeby zdążyła
  // przed pierwszym pomiarem; tutaj nie ma czego powtarzać.
  if (odczytaj()) return;

  if (document.getElementById('cookieBanner')) return;

  function pokaz() {
    var baner = document.createElement('div');
    baner.id = 'cookieBanner';
    baner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1a1714;' +
      'color:#d6d2cc;font-size:.82rem;padding:14px 20px;z-index:9999;display:flex;' +
      'flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;';

    var tekst = document.createElement('span');
    tekst.innerHTML = 'Używamy plików cookies analitycznych i marketingowych. ' +
      'Możesz je odrzucić — strona działa tak samo. ' +
      '<a href="prywatnosc.html" style="color:#7ec8a0;text-decoration:underline;">Dowiedz się więcej</a>.';

    var przyciski = document.createElement('div');
    przyciski.style.cssText = 'display:flex;gap:8px;';

    function guzik(napis, styl, decyzja, stan) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = napis;
      b.style.cssText = styl;
      b.addEventListener('click', function () {
        zapisz(decyzja);
        zgoda(stan);
        baner.remove();
      });
      return b;
    }

    przyciski.appendChild(guzik('Akceptuję',
      'background:#2d6b52;color:#fff;border:none;padding:9px 20px;font-size:.8rem;' +
      'font-weight:600;cursor:pointer;border-radius:6px;', 'accepted', 'granted'));
    przyciski.appendChild(guzik('Odrzuć',
      'background:transparent;color:#d6d2cc;border:1px solid rgba(255,255,255,.25);' +
      'padding:9px 16px;font-size:.8rem;font-weight:600;cursor:pointer;border-radius:6px;',
      'rejected', 'denied'));

    baner.appendChild(tekst);
    baner.appendChild(przyciski);
    document.body.appendChild(baner);
  }

  if (document.body) pokaz();
  else document.addEventListener('DOMContentLoaded', pokaz);
})();
