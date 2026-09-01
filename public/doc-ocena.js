// ─────────────────────────────────────────────────────────────────────────
// doc-ocena.js — ocena wygenerowanego dokumentu.
//
// Pytamy dokładnie w momencie, w którym user właśnie przeczytał dokument
// i widzi przyciski pobierania — wtedy ma wyrobione zdanie, a jeszcze nie
// wyszedł ze strony. Kartę wstawiamy pod przyciskami akcji na ekranie 2.
//
// Skrypt jest samodzielny: nie wymaga zmian w plikach generatorów. Wykrywa
// pojawienie się gotowego dokumentu obserwacją #docPaper, więc działa
// wszędzie tam, gdzie ten element istnieje.
//
// Ocena wysyłana jest do /api/documents (action=feedback). Bez zalogowania
// karty nie pokazujemy — i tak nie ma jak przypisać opinii do dokumentu.
// ─────────────────────────────────────────────────────────────────────────
(function () {
  if (window.__docOcena) return;
  window.__docOcena = true;

  var MIN_ZNAKOW = 200;      // krótszy tekst to komunikat błędu, nie dokument
  var KLUCZ = 'dokumo_ocena:';

  var CSS = [
    ".doc-ocena{margin-top:16px;border:1px solid var(--border,rgba(0,0,0,.08));border-radius:16px;padding:16px 18px;background:#fff;font-family:'Figtree','DM Sans',system-ui,sans-serif;animation:docOcIn .3s ease}",
    '@keyframes docOcIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '.doc-ocena-q{font-size:.88rem;font-weight:700;color:#111;margin-bottom:3px}',
    '.doc-ocena-sub{font-size:.76rem;color:#888;line-height:1.5;margin-bottom:12px}',
    '.doc-ocena-gwiazdki{display:flex;gap:4px;margin-bottom:2px}',
    ".doc-ocena-g{background:none;border:none;cursor:pointer;padding:2px;font-size:1.6rem;line-height:1;color:#d4d4d8;transition:transform .12s,color .12s;font-family:inherit}",
    '.doc-ocena-g:hover{transform:scale(1.15)}',
    '.doc-ocena-g.on{color:#f59e0b}',
    '.doc-ocena-g:focus-visible{outline:2px solid #7c3aed;outline-offset:2px;border-radius:6px}',
    '.doc-ocena-skala{display:flex;justify-content:space-between;font-size:.68rem;color:#aaa;max-width:190px;margin-bottom:4px}',
    '.doc-ocena-panel{display:none;margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,0,0,.07)}',
    '.doc-ocena-panel.on{display:block}',
    '.doc-ocena-lbl{font-size:.78rem;font-weight:600;color:#333;margin-bottom:8px}',
    '.doc-ocena-tagi{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}',
    ".doc-ocena-tag{background:#f4f4f5;border:1px solid rgba(0,0,0,.06);color:#444;border-radius:999px;padding:6px 11px;font-size:.75rem;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s}",
    '.doc-ocena-tag:hover{border-color:rgba(124,58,237,.4)}',
    '.doc-ocena-tag.on{background:rgba(124,58,237,.1);border-color:rgba(124,58,237,.45);color:#6d28d9}',
    ".doc-ocena-txt{width:100%;min-height:74px;resize:vertical;border:1px solid rgba(0,0,0,.12);border-radius:11px;padding:10px 12px;font-family:inherit;font-size:.82rem;line-height:1.5;color:#111;background:#fafafa}",
    '.doc-ocena-txt:focus{outline:none;border-color:#7c3aed;background:#fff}',
    '.doc-ocena-stopka{display:flex;align-items:center;gap:10px;margin-top:10px}',
    ".doc-ocena-wyslij{background:linear-gradient(135deg,#7c3aed 0%,#db2777 50%,#0891b2 100%);color:#fff;border:none;border-radius:999px;padding:10px 20px;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit}",
    '.doc-ocena-wyslij:disabled{opacity:.55;cursor:default}',
    '.doc-ocena-licz{font-size:.7rem;color:#aaa;margin-left:auto}',
    '.doc-ocena-licz.max{color:#dc2626}',
    '.doc-ocena-dzieki{display:flex;align-items:flex-start;gap:10px;font-size:.83rem;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 14px;line-height:1.5}',
    '.doc-ocena-err{font-size:.78rem;color:#b91c1c;margin-top:8px}',
    '@media(max-width:640px){.doc-ocena{padding:14px}.doc-ocena-g{font-size:1.75rem}}',
  ].join('\n');

  var TAGI_ZLE = ['Brakuje klauzuli', 'Błędne dane', 'Nieaktualny przepis', 'Zbyt ogólny', 'Zły styl lub język', 'Coś innego'];
  var TAGI_DOBRE = ['Kompletny', 'Zrozumiały język', 'Dobre podstawy prawne', 'Szybko gotowy'];
  var MAX = 1000;

  function styl() {
    if (document.getElementById('docOcenaCss')) return;
    var s = document.createElement('style');
    s.id = 'docOcenaCss'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function docId() {
    return (location.pathname.split('/').pop() || 'dokument').replace(/\.html$/, '');
  }

  // Jeden dokument = jedna ocena. Zapamiętujemy lokalnie, żeby po odświeżeniu
  // nie pytać drugi raz o to samo.
  function juzOceniony() {
    try { return !!sessionStorage.getItem(KLUCZ + docId()); } catch (e) { return false; }
  }
  function zapiszLokalnie() {
    try { sessionStorage.setItem(KLUCZ + docId(), '1'); } catch (e) {}
  }

  function zbuduj() {
    var el = document.createElement('div');
    el.className = 'doc-ocena';
    el.id = 'docOcena';
    el.innerHTML =
      '<div class="doc-ocena-q">Jak oceniasz ten dokument?</div>' +
      '<div class="doc-ocena-sub">Twoja ocena pomaga nam poprawiać wzory. Zajmie sekundę.</div>' +
      '<div class="doc-ocena-gwiazdki" id="docOcenaGw" role="radiogroup" aria-label="Ocena dokumentu">' +
        [1, 2, 3, 4, 5].map(function (n) {
          return '<button type="button" class="doc-ocena-g" data-n="' + n + '" role="radio" aria-checked="false" ' +
                 'aria-label="' + n + ' z 5">★</button>';
        }).join('') +
      '</div>' +
      '<div class="doc-ocena-skala"><span>słaby</span><span>świetny</span></div>' +
      '<div class="doc-ocena-panel" id="docOcenaPanel">' +
        '<div class="doc-ocena-lbl" id="docOcenaLbl"></div>' +
        '<div class="doc-ocena-tagi" id="docOcenaTagi"></div>' +
        '<textarea class="doc-ocena-txt" id="docOcenaTxt" maxlength="' + MAX + '"></textarea>' +
        '<div class="doc-ocena-stopka">' +
          '<button type="button" class="doc-ocena-wyslij" id="docOcenaSend">Wyślij ocenę</button>' +
          '<span class="doc-ocena-licz" id="docOcenaLicz">0/' + MAX + '</span>' +
        '</div>' +
        '<div class="doc-ocena-err" id="docOcenaErr" style="display:none"></div>' +
      '</div>';
    return el;
  }

  var stan = { ocena: 0, tagi: [] };

  function rysujTagi() {
    var lista = stan.ocena <= 3 ? TAGI_ZLE : TAGI_DOBRE;
    document.getElementById('docOcenaLbl').textContent =
      stan.ocena <= 3 ? 'Co wymaga poprawy?' : 'Co wyszło najlepiej? (opcjonalnie)';
    document.getElementById('docOcenaTxt').placeholder =
      stan.ocena <= 3
        ? 'Napisz, czego zabrakło albo co było nie tak — poprawimy wzór.'
        : 'Chcesz coś dodać? Chętnie przeczytamy.';
    var box = document.getElementById('docOcenaTagi');
    box.innerHTML = lista.map(function (t) {
      return '<button type="button" class="doc-ocena-tag" data-t="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('');
    box.querySelectorAll('.doc-ocena-tag').forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute('data-t');
        var i = stan.tagi.indexOf(t);
        if (i >= 0) { stan.tagi.splice(i, 1); b.classList.remove('on'); }
        else { stan.tagi.push(t); b.classList.add('on'); }
      };
    });
  }

  function ustawOcene(n) {
    stan.ocena = n; stan.tagi = [];
    document.querySelectorAll('#docOcenaGw .doc-ocena-g').forEach(function (b) {
      var v = Number(b.getAttribute('data-n'));
      b.classList.toggle('on', v <= n);
      b.setAttribute('aria-checked', v === n ? 'true' : 'false');
    });
    rysujTagi();
    document.getElementById('docOcenaPanel').classList.add('on');
  }

  async function wyslij() {
    var btn = document.getElementById('docOcenaSend');
    var err = document.getElementById('docOcenaErr');
    var txt = document.getElementById('docOcenaTxt').value.trim().slice(0, MAX);
    err.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Wysyłam…';
    try {
      var token = window._fbToken || '';
      var r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          action: 'feedback',
          typeId: docId(),
          docName: document.title.split(/[|—–]/)[0].trim(),
          rating: stan.ocena,
          tags: stan.tagi,
          comment: txt,
        }),
      });
      if (!r.ok) {
        var d = await r.json().catch(function () { return {}; });
        throw new Error(d.error || 'Nie udało się wysłać oceny.');
      }
      zapiszLokalnie();
      var karta = document.getElementById('docOcena');
      karta.innerHTML = '<div class="doc-ocena-dzieki"><span style="font-size:1.1rem;line-height:1">✓</span>' +
        '<div><strong>Dziękujemy.</strong> ' +
        (stan.ocena <= 3
          ? 'Przeczytamy to i poprawimy wzór — Twoja uwaga trafia prosto do nas.'
          : 'Cieszymy się, że dokument się przydał.') +
        '</div></div>';
    } catch (e) {
      err.textContent = e.message;
      err.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Wyślij ocenę';
    }
  }

  function pokaz() {
    if (document.getElementById('docOcena') || juzOceniony()) return;
    // Bez konta nie mamy jak powiązać opinii z dokumentem — nie zawracamy głowy.
    if (!window._fbToken) return;
    var kotwica = document.querySelector('.act-btns');
    if (!kotwica) return;
    styl();
    var el = zbuduj();
    kotwica.parentNode.insertBefore(el, kotwica.nextSibling);
    el.querySelectorAll('#docOcenaGw .doc-ocena-g').forEach(function (b) {
      b.onclick = function () { ustawOcene(Number(b.getAttribute('data-n'))); };
    });
    var txt = document.getElementById('docOcenaTxt');
    var licz = document.getElementById('docOcenaLicz');
    txt.oninput = function () {
      licz.textContent = txt.value.length + '/' + MAX;
      licz.classList.toggle('max', txt.value.length >= MAX);
    };
    document.getElementById('docOcenaSend').onclick = wyslij;
  }

  // Karta ma się pojawić dopiero, gdy na ekranie jest gotowy dokument —
  // nie w trakcie generowania i nie przy komunikacie o błędzie.
  function obserwuj() {
    var paper = document.getElementById('docPaper');
    if (!paper) return;
    var sprawdz = function () {
      if (paper.classList.contains('loading')) return;
      if ((paper.textContent || '').trim().length < MIN_ZNAKOW) return;
      pokaz();
    };
    new MutationObserver(sprawdz).observe(paper, { childList: true, characterData: true, subtree: true });
    sprawdz();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', obserwuj);
  else obserwuj();

  window.showDocRating = pokaz;   // ręczne wywołanie, gdyby był potrzebne
})();
