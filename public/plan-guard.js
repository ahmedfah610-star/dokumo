// plan-guard.js — centralna logika uprawnień pakietów
(function () {
  var style = document.createElement('style');
  style.textContent = [
    '#pgOverlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;animation:pgFade .2s ease}',
    '@keyframes pgFade{from{opacity:0}to{opacity:1}}',
    '#pgModal{background:#fff;border-radius:18px;padding:2.2rem 2rem;max-width:420px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,.25);animation:pgSlide .25s ease}',
    '@keyframes pgSlide{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}',
    '#pgModal .pg-ico{font-size:3rem;margin-bottom:.75rem}',
    '#pgModal h2{font-size:1.2rem;font-weight:700;color:#1a1a2e;margin:0 0 .5rem}',
    '#pgModal p{color:#555;font-size:.93rem;line-height:1.5;margin:0 0 1.5rem}',
    '#pgModal p strong{color:#1a1a2e}',
    '#pgModal .pg-upgrade{display:block;width:100%;padding:.85rem 1rem;background:linear-gradient(135deg,#6c63ff,#a78bfa);color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;text-decoration:none;margin-bottom:.75rem;box-sizing:border-box}',
    '#pgModal .pg-upgrade:hover{opacity:.88}',
    '#pgModal .pg-close{background:none;border:none;color:#aaa;cursor:pointer;font-size:.88rem;padding:.25rem .5rem}'
  ].join('');
  document.head.appendChild(style);

  var PLAN_NAMES = { start: 'Pakiet Start', kariera: 'Pakiet Kariera', biznes: 'Pakiet Biznes', promax: 'Pro Max' };

  function suggestUpgrade(currentPlan, requiredPlans) {
    if (currentPlan === 'biznes' && requiredPlans.indexOf('kariera') >= 0) return 'promax';
    if (currentPlan === 'kariera' && requiredPlans.indexOf('biznes') >= 0) return 'biznes';
    return 'promax';
  }

  window.showPlanUpgradeModal = function (currentPlan, upgradeTo) {
    var el = document.getElementById('pgOverlay');
    if (el) el.remove();
    var upgradeName = PLAN_NAMES[upgradeTo] || 'Pro Max';
    var currentName = currentPlan ? (PLAN_NAMES[currentPlan] || currentPlan) : 'Brak';
    var overlay = document.createElement('div');
    overlay.id = 'pgOverlay';
    overlay.innerHTML =
      '<div id="pgModal">' +
        '<div class="pg-ico">🔒</div>' +
        '<h2>Dokument niedostępny w Twoim pakiecie</h2>' +
        '<p>Ten dokument wymaga planu <strong>' + upgradeName + '</strong>.<br>Twój aktualny pakiet: <strong>' + currentName + '</strong>.</p>' +
        '<a href="subskrypcja.html" class="pg-upgrade">Ulepsz plan do ' + upgradeName + ' →</a>' +
        '<button class="pg-close" onclick="document.getElementById(\'pgOverlay\').remove()">Zamknij</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  };

  window.showStartUsedModal = function () {
    var el = document.getElementById('pgOverlay');
    if (el) el.remove();
    var overlay = document.createElement('div');
    overlay.id = 'pgOverlay';
    overlay.innerHTML =
      '<div id="pgModal">' +
        '<div class="pg-ico">📄</div>' +
        '<h2>Pobranie już wykorzystane</h2>' +
        '<p>Twój Pakiet Start pozwala na <strong>jedno pobranie</strong>.<br>Kup subskrypcję, żeby pobierać bez limitu.</p>' +
        '<a href="subskrypcja.html" class="pg-upgrade">Zobacz plany →</a>' +
        '<button class="pg-close" onclick="document.getElementById(\'pgOverlay\').remove()">Zamknij</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  };

  // requiredPlans: np. ['kariera','promax','pro']
  // Zwraca true jeśli dostęp OK, false jeśli zablokowane (pokazuje modal lub przekierowuje)
  window.checkPlanAccess = function (requiredPlans) {
    var sub;  try { sub  = JSON.parse(localStorage.getItem('dokumo_sub'));  } catch (e) { sub  = null; }
    var user; try { user = JSON.parse(localStorage.getItem('dokumo_user')); } catch (e) { user = null; }

    // Niezalogowany → panel logowania
    if (!user) { window.location.href = 'konto.html'; return false; }

    // Brak aktywnej subskrypcji
    var active = sub && sub.expiresAt && new Date(sub.expiresAt) > new Date();
    if (!active) {
      // Jeśli wymagany jest jakikolwiek plan (włącznie z start) → wymagana subskrypcja
      if (requiredPlans.indexOf('start') >= 0) {
        sessionStorage.setItem('dokumo_after_sub', window.location.href);
        window.location.href = 'subskrypcja.html';
        return false;
      }
      // Dokumenty regularne — pozwól spróbować (serwer sprawdzi 1 darmowy slot per IP)
      return true;
    }

    // Pakiet Start — jednorazowe pobranie
    if (sub.plan === 'start') {
      var left = typeof sub.downloadsLeft === 'number' ? sub.downloadsLeft : 1;
      if (left <= 0) {
        window.showStartUsedModal();
        return false;
      }
      // Dekrement lokalny
      sub.downloadsLeft = left - 1;
      localStorage.setItem('dokumo_sub', JSON.stringify(sub));
      // Sync z serwerem (fire-and-forget)
      if (window._fbToken) {
        fetch('/api/sub', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + window._fbToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'use-download' }),
        }).catch(function () {});
      }
      return true;
    }

    // Plan pasuje → dostęp
    if (requiredPlans.indexOf(sub.plan) >= 0) return true;

    // Plan nie pasuje → modal z propozycją upgrade
    window.showPlanUpgradeModal(sub.plan, suggestUpgrade(sub.plan, requiredPlans));
    return false;
  };

  // Modal gdy darmowy slot per IP został już wykorzystany
  window.showFreeDocModal = function () {
    var el = document.getElementById('pgOverlay');
    if (el) el.remove();
    var overlay = document.createElement('div');
    overlay.id = 'pgOverlay';
    overlay.innerHTML =
      '<div id="pgModal">' +
        '<div class="pg-ico">🎁</div>' +
        '<h2>Darmowy dokument już wykorzystany</h2>' +
        '<p>Każdy użytkownik może wygenerować <strong>jeden darmowy dokument</strong>.<br>Kup pakiet, aby generować bez limitu.</p>' +
        '<a href="subskrypcja.html" class="pg-upgrade">Zobacz plany →</a>' +
        '<button class="pg-close" onclick="document.getElementById(\'pgOverlay\').remove()">Zamknij</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  };

  // Interceptor fetch — pokazuje modal gdy serwer zwróci 403 free_used
  (function () {
    var _orig = window.fetch;
    window.fetch = function (url) {
      var p = _orig.apply(this, arguments);
      if (typeof url === 'string' && url === '/api/generate') {
        return p.then(function (res) {
          if (res.status === 403) {
            res.clone().json().then(function (d) {
              if (d.error === 'free_used' && window.showFreeDocModal) window.showFreeDocModal();
            }).catch(function () {});
          }
          return res;
        });
      }
      return p;
    };
  })();
})();
