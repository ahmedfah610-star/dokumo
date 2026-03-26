// ── PROFIL W NAW ──────────────────────────────────────────
function updateCVNavProfile() {
  var user = null;
  try { user = JSON.parse(localStorage.getItem('dokumo_user')); } catch(e) {}
  var profile = document.getElementById('cvNavProfile');
  if (!profile) return;
  if (user) {
    profile.style.display = 'flex';
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
  if (typeof renderCVForm === 'function') renderCVForm();
  if (typeof updateCVPreview === 'function') updateCVPreview();
}

// ── WERSJA ROBOCZA – AUTOSAVE ─────────────────────────────
var _draftTimer = null;

var _lastDraftSave = 0;
function triggerDraftSave() {
  if (!window._fbToken) return;
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(function() {
    var now = Date.now();
    if (now - _lastDraftSave < 60000) return; // max 1 save per minute
    _lastDraftSave = now;
    var badge = document.getElementById('cvDraftBadge');
    if (badge) { badge.textContent = '💾 Zapisuję...'; badge.classList.add('visible'); }
    saveCVDraft();
  }, 10000);
}

async function saveCVDraft() {
  try {
    var token = typeof window._fbToken === 'function' ? await window._fbToken() : window._fbToken;
    if (!token) return;
    var cvPreviewEl = document.getElementById('cvPreviewInner');
    var cvText = cvPreviewEl ? '__CV_HTML__:' + cvPreviewEl.outerHTML : '';
    var resp = await fetch('/api/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        text: cvText,
        cvDataJson: JSON.stringify(Object.assign({}, cvData, { __template: cvTemplate, __color: cvCustomColor || null, __customSections: cvCustomSections || [], __sidebarSections: Array.from(cvSidebarSections) }))
      })
    });
    if (resp.ok) {
      // Cache lokalnie dla szybszego ładowania przy następnym wejściu
      try { localStorage.setItem('dokumo_cv_draft_cache', JSON.stringify(Object.assign({}, cvData, { __template: cvTemplate, __color: cvCustomColor || null, __customSections: cvCustomSections || [], __sidebarSections: Array.from(cvSidebarSections) }))); } catch(e) {}
      var badge = document.getElementById('cvDraftBadge');
      if (badge) {
        badge.textContent = '✓ Zapisano';
        clearTimeout(badge._hideTimer);
        badge._hideTimer = setTimeout(function() { badge.classList.remove('visible'); }, 3000);
      }
    }
  } catch(e) {}
}

async function loadCVDraft() {
  try {
    // Ładuj z localStorage natychmiast (zanim Firestore odpowie)
    var cached = localStorage.getItem('dokumo_cv_draft_cache');
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
        if (typeof renderCVForm === 'function') renderCVForm();
        if (typeof updateCVPreview === 'function') updateCVPreview();
      } catch(e) {}
    }
    var token = typeof window._fbToken === 'function' ? await window._fbToken() : window._fbToken;
    if (!token) return;
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
    var badge = document.getElementById('cvDraftBadge');
    if (badge) {
      badge.textContent = '↩ Wersja robocza przywrócona';
      badge.classList.add('visible');
      clearTimeout(badge._hideTimer);
      badge._hideTimer = setTimeout(function() { badge.classList.remove('visible'); }, 5000);
    }
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
});
