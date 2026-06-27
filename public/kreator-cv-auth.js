// ── PROFIL W NAW ──────────────────────────────────────────
function updateCVNavProfile() {
  var user = null;
  try { user = JSON.parse(localStorage.getItem('dokumo_user')); } catch(e) {}
  var profile = document.getElementById('cvNavProfile');
  var authButtons = document.getElementById('cvAuthButtons');
  if (!profile) return;
  if (user) {
    profile.style.display = 'flex';
    if (authButtons) authButtons.style.display = 'none';
    var avatar = document.getElementById('cvNavAvatar');
    var emailEl = document.getElementById('cvNavEmail');
    if (emailEl) emailEl.textContent = user.email || '';
    if (avatar) {
      if (user.photo) {
        avatar.innerHTML = '<img src="' + user.photo + '" alt="" style="width:100%;height:100%;object-fit:cover">';
      } else {
        avatar.textContent = (user.email || 'U')[0].toUpperCase();
      }
    }
  } else {
    profile.style.display = 'none';
    if (authButtons) authButtons.style.display = 'flex';
  }
  var resetBtn = document.getElementById('btnResetCV');
  if (resetBtn) resetBtn.style.display = user ? '' : 'none';
}

// Przenieś dropdown do <body> żeby żaden stacking context z nav nie blokował
document.addEventListener('DOMContentLoaded', function() {
  var dd = document.getElementById('cvNavDropdown');
  if (dd) document.body.appendChild(dd);
});

function toggleCVNavDropdown(e) {
  e.stopPropagation();
  var dd = document.getElementById('cvNavDropdown');
  if (!dd) return;
  var isOpen = dd.classList.contains('open');
  dd.classList.toggle('open');
  var avatar = document.getElementById('cvNavAvatar');
  if (avatar) avatar.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
  if (!isOpen) {
    var avatar = document.getElementById('cvNavAvatar');
    if (avatar) {
      var rect = avatar.getBoundingClientRect();
      dd.style.top = (rect.bottom + 8) + 'px';
      dd.style.right = (window.innerWidth - rect.right) + 'px';
      dd.style.left = 'auto';
    }
  }
}

document.addEventListener('click', function() {
  var dd = document.getElementById('cvNavDropdown');
  if (dd) dd.classList.remove('open');
  var avatar = document.getElementById('cvNavAvatar');
  if (avatar) avatar.setAttribute('aria-expanded', 'false');
});

function logoutUserCV() {
  localStorage.removeItem('dokumo_user');
  localStorage.removeItem('dokumo_sub');
  (window._fbSignOut ? window._fbSignOut() : Promise.resolve()).finally(() => { window.location.href = 'index.html'; });
}

function confirmResetCV() {
  resetCVData();
}

async function resetCVData() {
  cvData = {
    imie:'', nazwisko:'', stanowisko:'', email:'', tel:'', adres:'', linkedin:'', www:'',
    zdjecie: null,
    podsumowanie:'',
    doswiadczenie:[{ firma:'', stanowisko:'', od:'', do:'', opis:'' }],
    wyksztalcenie:[{ szkola:'', kierunek:'', od:'', do:'', opis:'' }],
    umiejetnosci:'',
    certyfikatyList:[],
    kursy:[],
    staze:[],
    jezyki:[{ jezyk:'', poziom:'B2' }],
    zainteresowania:''
  };
  if (typeof cvCustomColor !== 'undefined') cvCustomColor = null;
  if (typeof cvCustomSections !== 'undefined') cvCustomSections = [];
  try {
    var token = typeof window._fbToken === 'function' ? await window._fbToken() : window._fbToken;
    if (token) {
      await fetch('/api/draft', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    }
  } catch(e) {}
  // Wyczysc tez lokalny cache zeby nie przywrocil sie po reload
  try { localStorage.removeItem('dokumo_cv_draft_cache'); } catch(e) {}
  if (typeof renderCVForm === 'function') renderCVForm();
  if (typeof updateCVPreview === 'function') updateCVPreview();
}

// ── WYKRYWANIE PII (klient) — port lib/pii.js. Blokuje zapis PESEL/dowodu/
// paszportu/karty platniczej do localStorage — RODO: nie persystujemy danych
// wrazliwych nawet lokalnie w przegladarce, nie tylko w Firestore.
function _piiValidPesel(s) {
  if (!/^\d{11}$/.test(s)) return false;
  var w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  var sum = 0;
  for (var i = 0; i < 10; i++) sum += parseInt(s[i], 10) * w[i];
  if ((10 - (sum % 10)) % 10 !== parseInt(s[10], 10)) return false;
  var mm = parseInt(s.slice(2, 4), 10);
  var dd = parseInt(s.slice(4, 6), 10);
  if (dd < 1 || dd > 31) return false;
  var validMonths = {};
  [0, 20, 40, 60, 80].forEach(function(offset) {
    for (var m = 1; m <= 12; m++) validMonths[m + offset] = true;
  });
  return !!validMonths[mm];
}

function _piiContainsPesel(text) {
  if (typeof text !== 'string' || !text) return false;
  var matches = text.match(/\d[\d\s\-]{9,16}\d/g);
  if (!matches) return false;
  for (var i = 0; i < matches.length; i++) {
    var digits = matches[i].replace(/[\s\-]/g, '');
    if (digits.length === 11 && _piiValidPesel(digits)) return true;
  }
  return false;
}

function _piiValidDowod(s) {
  if (!/^[A-Z]{3}\d{6}$/.test(s)) return false;
  var weights = [7, 3, 1, 9, 7, 3, 1, 7, 3];
  var chars = s.split('');
  var sum = 0;
  for (var i = 0; i < 9; i++) {
    if (i === 3) continue;
    var c = chars[i];
    var val = /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : parseInt(c, 10);
    var wi = i < 3 ? i : i - 1;
    sum += val * weights[wi];
  }
  return sum % 10 === parseInt(chars[3], 10);
}

function _piiContainsDowod(text) {
  if (typeof text !== 'string' || !text) return false;
  var matches = text.match(/\b[A-Z]{3}\d{6}\b/g);
  if (!matches) return false;
  return matches.some(_piiValidDowod);
}

function _piiValidPassport(s) {
  if (!/^[A-Z]{2}\d{7}$/.test(s)) return false;
  var weights = [7, 3, 9, 1, 7, 3, 1, 7, 3];
  var chars = s.split('');
  var sum = 0;
  for (var i = 0; i < 9; i++) {
    if (i === 2) continue;
    var c = chars[i];
    var val = /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : parseInt(c, 10);
    sum += val * weights[i];
  }
  return sum % 10 === parseInt(chars[2], 10);
}

function _piiContainsPassport(text) {
  if (typeof text !== 'string' || !text) return false;
  var matches = text.match(/\b[A-Z]{2}\d{7}\b/g);
  if (!matches) return false;
  return matches.some(_piiValidPassport);
}

function _piiValidCardLuhn(s) {
  if (!/^\d{13,19}$/.test(s)) return false;
  var sum = 0, alt = false;
  for (var i = s.length - 1; i >= 0; i--) {
    var n = parseInt(s[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function _piiContainsCard(text) {
  if (typeof text !== 'string' || !text) return false;
  var matches = text.match(/\b(?:\d[ \-]?){12,18}\d\b/g);
  if (!matches) return false;
  for (var i = 0; i < matches.length; i++) {
    var digits = matches[i].replace(/[\s\-]/g, '');
    if (_piiValidCardLuhn(digits)) return true;
  }
  return false;
}

function hasSensitivePIIClient(value) {
  if (value == null) return false;
  if (typeof value === 'string') {
    return _piiContainsPesel(value) || _piiContainsDowod(value) || _piiContainsPassport(value) || _piiContainsCard(value);
  }
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) if (hasSensitivePIIClient(value[i])) return true;
    return false;
  }
  if (typeof value === 'object') {
    for (var k in value) if (Object.prototype.hasOwnProperty.call(value, k) && hasSensitivePIIClient(value[k])) return true;
    return false;
  }
  return false;
}

// Pokazuje badge nad nawigacja kreatora. kind='warn' -> kolor ostrzegawczy.
function _showDraftBadge(text, kind, hideMs) {
  var badge = document.getElementById('cvDraftBadge');
  if (!badge) return;
  badge.textContent = text;
  badge.classList.toggle('warn', kind === 'warn');
  badge.classList.add('visible');
  clearTimeout(badge._hideTimer);
  if (hideMs) badge._hideTimer = setTimeout(function() { badge.classList.remove('visible'); }, hideMs);
}

// ── WERSJA ROBOCZA – AUTOSAVE ─────────────────────────────
// localStorage zapisywany zawsze (też dla niezalogowanych) z debounce 2s.
// Firestore sync tylko dla zalogowanych, debounce 10s + max 1/min.
var _draftTimer = null;
var _localTimer = null;
var _lastDraftSave = 0;

function _snapshotCV() {
  return Object.assign({}, cvData, {
    __template: cvTemplate,
    __color: cvCustomColor || null,
    __customSections: cvCustomSections || [],
    __sidebarSections: Array.from(cvSidebarSections)
  });
}

function _saveCVLocal() {
  try {
    var snap = _snapshotCV();
    if (hasSensitivePIIClient(snap)) {
      _showDraftBadge('⚠ Wykryto dane wrażliwe (PESEL/dowód/karta) — wersja robocza NIE zapisana lokalnie', 'warn', 6000);
      return;
    }
    localStorage.setItem('dokumo_cv_draft_cache', JSON.stringify(snap));
  } catch(e) {}
}

function triggerDraftSave() {
  // 1. localStorage — zawsze, szybki debounce 2s — chroni dane niezalogowanych
  //    przed utratą przy rejestracji / odświeżeniu strony.
  clearTimeout(_localTimer);
  _localTimer = setTimeout(_saveCVLocal, 2000);

  // 2. Firestore — tylko dla zalogowanych, wolniejszy debounce + rate limit
  if (!window._fbToken) return;
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(function() {
    var now = Date.now();
    if (now - _lastDraftSave < 60000) return; // max 1 save per minute
    _lastDraftSave = now;
    _showDraftBadge('💾 Zapisuję...', '', 0);
    saveCVDraft();
  }, 10000);
}

async function saveCVDraft() {
  try {
    // Najpierw zapisz lokalnie (synchronicznie) — żeby cache był zawsze aktualny
    _saveCVLocal();

    var token = typeof window._fbToken === 'function' ? await window._fbToken() : window._fbToken;
    if (!token) return;
    var cvPreviewEl = document.getElementById('cvPreviewInner');
    var cvText = cvPreviewEl ? '__CV_HTML__:' + cvPreviewEl.outerHTML : '';
    var resp = await fetch('/api/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ text: cvText, cvDataJson: JSON.stringify(_snapshotCV()) })
    });
    if (resp.ok) {
      var data = await resp.json().catch(function() { return {}; });
      if (data.skipped && data.reason === 'pii_detected') {
        _showDraftBadge(data.message || '⚠ Wykryto dane wrażliwe — zapisano tylko lokalnie', 'warn', 5000);
      } else {
        _showDraftBadge('✓ Zapisano', '', 3000);
      }
    }
  } catch(e) {}
}

async function loadCVDraft() {
  try {
    // Ładuj z localStorage natychmiast — działa też dla niezalogowanych
    // (np. po powrocie z rejestracji konta z wypełnionymi już danymi).
    var cached = localStorage.getItem('dokumo_cv_draft_cache');
    var loadedFromLocal = false;
    if (cached) {
      try {
        var cachedData = JSON.parse(cached);
        var urlTpl = new URLSearchParams(location.search).get('template');
        if (!urlTpl && cachedData.__template) cvTemplate = cachedData.__template;
        if (!urlTpl && cachedData.__color) cvCustomColor = cachedData.__color;
        if (!urlTpl && cachedData.__customSections) cvCustomSections = cachedData.__customSections;
        if (!urlTpl && cachedData.__sidebarSections) cvSidebarSections = new Set(cachedData.__sidebarSections);
        delete cachedData.__template; delete cachedData.__color; delete cachedData.__customSections; delete cachedData.__sidebarSections;
        Object.assign(cvData, cachedData);
        loadedFromLocal = true;
        if (typeof renderCVForm === 'function') renderCVForm();
        if (typeof updateCVPreview === 'function') updateCVPreview();
      } catch(e) {}
    }
    var token = typeof window._fbToken === 'function' ? await window._fbToken() : window._fbToken;
    if (!token) {
      // Niezalogowany — pokaż banner tylko jeśli faktycznie coś przywróciliśmy z localStorage
      if (loadedFromLocal) {
        _showDraftBadge('↩ Twoje postępy zostały przywrócone', '', 5000);
      }
      return;
    }
    var resp = await fetch('/api/draft', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!resp.ok) return;
    var data = await resp.json();
    if (!data.cvDataJson) return;
    var loaded = JSON.parse(data.cvDataJson);
    // If user picked a template from wybierz-szablon.html (?template=…), keep it — only restore from draft when no template was explicitly chosen
    var urlTpl = new URLSearchParams(location.search).get('template');
    if (!urlTpl && loaded.__template) cvTemplate = loaded.__template;
    if (!urlTpl && loaded.__color) cvCustomColor = loaded.__color;
    if (!urlTpl && loaded.__customSections) cvCustomSections = loaded.__customSections;
    if (!urlTpl && loaded.__sidebarSections) cvSidebarSections = new Set(loaded.__sidebarSections);
    delete loaded.__template; delete loaded.__color; delete loaded.__customSections; delete loaded.__sidebarSections;
    Object.assign(cvData, loaded);
    if (typeof renderCVForm === 'function') renderCVForm();
    if (typeof updateCVPreview === 'function') updateCVPreview();
    if (typeof renderTplGrid === 'function') renderTplGrid();
    _showDraftBadge('↩ Wersja robocza przywrócona', '', 5000);
  } catch(e) {}
}

document.addEventListener('DOMContentLoaded', function() {
  updateCVNavProfile();

  // Tryb "popraw CV z AI" — wczytaj ulepszone dane z popraw-cv.html
  if (new URLSearchParams(location.search).get('mode') === 'improve') {
    const improvedJson = sessionStorage.getItem('dokumo_cv_improve');
    if (improvedJson) {
      sessionStorage.removeItem('dokumo_cv_improve');
      try {
        const parsed = JSON.parse(improvedJson);
        cvData.imie = parsed.imie || '';
        cvData.nazwisko = parsed.nazwisko || '';
        cvData.stanowisko = parsed.stanowisko || '';
        cvData.email = parsed.email || '';
        cvData.tel = parsed.tel || '';
        cvData.adres = parsed.adres || '';
        cvData.linkedin = parsed.linkedin || '';
        cvData.www = parsed.www || '';
        cvData.podsumowanie = parsed.podsumowanie || '';
        cvData.umiejetnosci = parsed.umiejetnosci || '';
        cvData.zainteresowania = parsed.zainteresowania || '';
        if (Array.isArray(parsed.doswiadczenie) && parsed.doswiadczenie.length > 0) {
          cvData.doswiadczenie = parsed.doswiadczenie.map(e => ({
            firma: e.firma || '', stanowisko: e.stanowisko || '',
            od: e.od || '', do: e.do || '', opis: e.opis || ''
          }));
        }
        if (Array.isArray(parsed.wyksztalcenie) && parsed.wyksztalcenie.length > 0) {
          cvData.wyksztalcenie = parsed.wyksztalcenie.map(e => ({
            szkola: e.szkola || '', kierunek: e.kierunek || '',
            od: e.od || '', do: e.do || '', opis: e.opis || ''
          }));
        }
        if (Array.isArray(parsed.jezyki) && parsed.jezyki.length > 0) {
          cvData.jezyki = parsed.jezyki.map(l => ({ jezyk: l.jezyk || '', poziom: l.poziom || 'B2' }));
        }
        renderCVForm();
        updateCVPreview();
        // Zapisz od razu jako wersję roboczą
        _lastDraftSave = 0;
        setTimeout(saveCVDraft, 800);
      } catch(e) { console.error('CV improve parse error:', e); }
    }
  }

  if (new URLSearchParams(location.search).get('mode') === 'import') {
    const dataUrl = sessionStorage.getItem('dokumo_import_cv_pdf');
    if (dataUrl) {
      sessionStorage.removeItem('dokumo_import_cv_pdf');
      try {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        processCvImport(bytes.buffer);
      } catch(e) { console.error('Błąd odczytu pliku:', e); }
    }
  }

  // ── Unconditional initial render dla nowych userow bez draftu ──
  // Bez tego cvPreviewInner pozostaje puste do pierwszego inputa,
  // a klik "Pobierz" generuje pusty PDF.
  setTimeout(function() {
    try {
      if (typeof renderCVForm === 'function') renderCVForm();
      if (typeof updateCVPreview === 'function') updateCVPreview();
    } catch(e) { console.error('Initial CV render failed:', e); }
  }, 50);
});
