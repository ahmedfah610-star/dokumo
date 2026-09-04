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
        '<h2>Pobrania już wykorzystane</h2>' +
        '<p>Twój Pakiet Start pozwala na <strong>5 pobrań</strong> — wykorzystałeś wszystkie.<br>Kup subskrypcję, żeby pobierać co miesiąc.</p>' +
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

    // Niezalogowany → rejestracja/logowanie z powrotem do tej strony (praca lokalnie zapisana)
    if (!user) {
      var ret = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = 'konto.html?return=' + ret;
      return false;
    }

    // Brak aktywnej subskrypcji — każdy dokument jest płatny, pokaż plany
    var active = sub && sub.expiresAt && new Date(sub.expiresAt) > new Date();
    if (!active) {
      window.showSubRequiredModal(requiredPlans);
      return false;
    }

    // Najpierw kategoria, potem pula pobrań. Wcześniej gałąź Startu kończyła
    // się „return true" przed sprawdzeniem planu, więc Start przechodził
    // bramkę dla każdego dokumentu — nieszkodliwe, dopóki obejmował cały
    // katalog. Po zawężeniu Startu user wypełniłby cały formularz i dopiero
    // serwer odmówiłby generowania.
    var pasuje = sub.prawaNabyte || requiredPlans.indexOf(sub.plan) >= 0;
    if (!pasuje) {
      window.showPlanUpgradeModal(sub.plan, suggestUpgrade(sub.plan, requiredPlans));
      return false;
    }

    // Pakiet Start — pula 5 pobrań
    if (sub.plan === 'start') {
      var left = typeof sub.downloadsLeft === 'number' ? sub.downloadsLeft : 5;
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
    }

    return true;
  };

  // Modal „wymagana subskrypcja" — każdy dokument jest płatny
  window.showSubRequiredModal = function (requiredPlans) {
    var el = document.getElementById('pgOverlay');
    if (el) el.remove();
    var overlay = document.createElement('div');
    overlay.id = 'pgOverlay';
    overlay.innerHTML =
      '<div id="pgModal">' +
        '<div class="pg-ico">🔒</div>' +
        '<h2>Ten dokument wymaga pakietu</h2>' +
        '<p>Generowanie i pobieranie dokumentów jest dostępne w ramach subskrypcji Dokumo. Wybierz pakiet i twórz dokumenty bez limitu.</p>' +
        '<a href="subskrypcja.html" class="pg-upgrade">Zobacz plany →</a>' +
        '<button class="pg-close" onclick="document.getElementById(\'pgOverlay\').remove()">Zamknij</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  };
  // Alias wstecznej zgodności (dawny darmowy slot)
  window.showFreeDocModal = window.showSubRequiredModal;

  // Modal — wyczerpany miesięczny limit generowań w ramach planu
  window.showGenLimitModal = function (limit) {
    var el = document.getElementById('pgOverlay');
    if (el) el.remove();
    var overlay = document.createElement('div');
    overlay.id = 'pgOverlay';
    overlay.innerHTML =
      '<div id="pgModal">' +
        '<div class="pg-ico">📄</div>' +
        '<h2>Wykorzystano limit dokumentów</h2>' +
        '<p>W tym miesiącu wygenerowałeś maksymalną liczbę dokumentów' + (limit ? ' (' + limit + ')' : '') + ' w swoim pakiecie. Limit odnawia się 1. dnia miesiąca — lub przejdź na <strong>Pro Max</strong> (100 dokumentów / mies.).</p>' +
        '<a href="subskrypcja.html" class="pg-upgrade">Zobacz Pro Max →</a>' +
        '<button class="pg-close" onclick="document.getElementById(\'pgOverlay\').remove()">Zamknij</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  };

  // Pokazuje w #checkSaved ostrzeżenie gdy serwer pominął zapis z powodu PII
  // (zamiast domyslnego "✓ Zapisano" ktore strona ustawia od razu po fetchu).
  function showPiiSkippedWarning(message) {
    setTimeout(function () {
      var cs = document.getElementById('checkSaved');
      if (!cs) return;
      cs.style.display = 'flex';
      var ico = cs.querySelector('.check-ico');
      var txt = cs.querySelector('span');
      if (ico) {
        ico.textContent = '⚠';
        ico.style.background = 'rgba(217,119,6,.1)';
        ico.style.borderColor = 'rgba(217,119,6,.35)';
        ico.style.color = '#d97706';
      }
      if (txt) txt.textContent = message || 'Nie zapisano — dokument zawiera dane wrażliwe (PESEL, nr dowodu, paszportu lub karty)';
    }, 150);
  }

  // Interceptor fetch — pokazuje modal gdy serwer zwróci 403 free_used,
  // oraz ostrzeżenie gdy zapis dokumentu zostal pominiety z powodu PII.
  (function () {
    var _orig = window.fetch;
    window.fetch = function (url) {
      var p = _orig.apply(this, arguments);
      if (typeof url === 'string' && url === '/api/generate') {
        return p.then(function (res) {
          if (res.status === 403) {
            res.clone().json().then(function (d) {
              // Każdy dokument płatny: brak sub / darmowy slot / niepasujący plan → modal z planami
              if ((d.error === 'free_used' || d.error === 'subscription_required') && window.showSubRequiredModal) {
                window.showSubRequiredModal();
              } else if (d.error === 'start_limit' && window.showStartUsedModal) {
                window.showStartUsedModal();
              } else if (d.error === 'gen_limit' && window.showGenLimitModal) {
                window.showGenLimitModal(d.limit);
              }
            }).catch(function () {});
          }
          if (res.ok) {
            res.clone().json().then(function (d) {
              if (d.skipped && d.reason === 'pii_detected') showPiiSkippedWarning(d.message);
            }).catch(function () {});
          }
          return res;
        });
      }
      return p;
    };
  })();
})();

// ── Pasek: nie udało się pobrać płatności ────────────────────────────────
// Stripe ponawia próbę przez kilkanaście dni, a my dajemy 7 dni karencji.
// Bez tego komunikatu użytkownik nie ma skąd wiedzieć, że jego dostęp za
// chwilę wygaśnie z powodu karty, a nie z powodu rezygnacji.
(function () {
  function pokazPasekPlatnosci() {
    if (document.getElementById('pgPayFail')) return;
    var sub; try { sub = JSON.parse(localStorage.getItem('dokumo_sub')); } catch (e) { return; }
    if (!sub || !sub.platnoscNieudana) return;
    try { if (sessionStorage.getItem('dokumo_payfail_zamkniete')) return; } catch (e) {}

    var doKiedy = '';
    if (sub.expiresAt) {
      var d = new Date(sub.expiresAt);
      if (!isNaN(d)) doKiedy = ' Dostęp działa do ' + d.toLocaleDateString('pl-PL',
        { day: 'numeric', month: 'long' }) + '.';
    }
    var el = document.createElement('div');
    el.id = 'pgPayFail';
    el.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;z-index:99996;max-width:680px;margin:0 auto;' +
      'background:#fffbeb;border:1px solid #f59e0b;border-radius:14px;padding:13px 16px;' +
      'box-shadow:0 12px 40px rgba(120,90,20,.18);font-family:inherit;display:flex;align-items:flex-start;gap:12px';
    el.innerHTML =
      '<span style="font-size:1.25rem;line-height:1;flex-shrink:0">💳</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:.9rem;font-weight:800;color:#92400e">Nie udało się pobrać płatności</div>' +
        '<div style="font-size:.8rem;color:#a16207;line-height:1.5;margin-top:2px">' +
          'Sprawdź, czy karta jest aktualna — spróbujemy jeszcze raz automatycznie.' + doKiedy +
        '</div>' +
      '</div>' +
      '<a href="subskrypcja.html" style="flex-shrink:0;background:#92400e;color:#fff;text-decoration:none;' +
        'border-radius:10px;padding:9px 14px;font-size:.8rem;font-weight:700;white-space:nowrap">Sprawdź</a>' +
      '<button id="pgPayFailX" aria-label="Zamknij" style="flex-shrink:0;background:none;border:none;' +
        'color:#b45309;font-size:1.1rem;cursor:pointer;padding:4px;line-height:1">✕</button>';
    document.body.appendChild(el);
    document.getElementById('pgPayFailX').onclick = function () {
      el.remove();
      try { sessionStorage.setItem('dokumo_payfail_zamkniete', '1'); } catch (e) {}
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pokazPasekPlatnosci);
  else pokazPasekPlatnosci();
  window.pokazPasekPlatnosci = pokazPasekPlatnosci;
})();
