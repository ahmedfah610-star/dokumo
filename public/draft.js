// Lokalny autozapis roboczej wersji dokumentu + brama logowania z powrotem.
// Pozwala niezalogowanemu wypełnić generator, a przy próbie pobrania —
// zapisujemy postęp, wysyłamy do rejestracji, a po powrocie przywracamy pracę.
(function () {
  var KEY = 'dokumo_draft:' + location.pathname;
  var MAX_AGE = 24 * 60 * 60 * 1000; // 24h — starszych szkiców nie przywracamy automatycznie

  function hasUser() {
    try { return !!JSON.parse(localStorage.getItem('dokumo_user')); } catch (e) { return false; }
  }

  window.DokumoDraft = {
    save: function (data) {
      try {
        if (!data) return;
        localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: data }));
      } catch (e) {}
    },
    load: function () {
      try {
        var r = JSON.parse(localStorage.getItem(KEY));
        if (!r || !r.d) return null;
        if (Date.now() - (r.t || 0) > MAX_AGE) return null;
        return r.d;
      } catch (e) { return null; }
    },
    clear: function () { try { localStorage.removeItem(KEY); } catch (e) {} },
    hasUser: hasUser,
    // Zapisuje stan (jeśli podano) i przekierowuje do logowania z powrotem tutaj.
    gateLogin: function () {
      var ret = location.pathname + location.search;
      window.location.href = 'konto.html?return=' + encodeURIComponent(ret);
    },
    // Krótki, nieblokujący toast po przywróceniu pracy.
    toast: function () {
      if (document.getElementById('dokumoDraftToast')) return;
      var t = document.createElement('div');
      t.id = 'dokumoDraftToast';
      t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99998;' +
        'background:#111827;color:#fff;font-family:inherit;font-size:13.5px;font-weight:500;' +
        'padding:11px 14px;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.28);display:flex;' +
        'align-items:center;gap:12px;max-width:calc(100vw - 32px);animation:dokDraftIn .25s ease';
      t.innerHTML = '<span>↩️ Przywróciliśmy Twoją roboczą wersję</span>' +
        '<button style="background:rgba(255,255,255,.15);border:none;color:#fff;font:inherit;font-size:12.5px;' +
        'padding:5px 10px;border-radius:8px;cursor:pointer">Zacznij od nowa</button>';
      var st = document.createElement('style');
      st.textContent = '@keyframes dokDraftIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}';
      document.head.appendChild(st);
      t.querySelector('button').onclick = function () {
        window.DokumoDraft.clear();
        t.remove();
        location.reload();
      };
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(function(){ t.remove(); }, 400); } }, 8000);
    },
  };
})();
