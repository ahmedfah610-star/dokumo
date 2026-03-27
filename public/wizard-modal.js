var _wmTools = {
  kariera: [
    { name:'Kreator CV',                   desc:'10 profesjonalnych szablonów',        action:'cv-wizard',                       bg:'#111827', stroke:'#fff',     icon:'cv' },
    { name:'Kreator listu motywacyjnego',  desc:'List dopasowany do oferty pracy',     action:'letter-wizard',                   bg:'#fff1f2', stroke:'#f43f5e', icon:'letter' },
    { name:'Dopasuj CV do ogłoszenia z AI', desc:'AI porówna Twoje CV z wymaganiami', action:'match-wizard',                    bg:'#ecfdf5', stroke:'#059669', icon:'match' },
    { name:'Popraw CV z AI',               desc:'Analiza i wskazówki do Twojego CV',   href:'popraw-cv.html',                     bg:'#fef9c3', stroke:'#ca8a04', icon:'edit' },
    { name:'Oblicz wynagrodzenie',         desc:'Kalkulator netto / brutto',           href:'kalkulator-wynagrodzen.html',        bg:'#eff6ff', stroke:'#2563eb', icon:'calc' },
    { name:'Wniosek o urlop',              desc:'Gotowy wniosek zgodny z KP',          href:'wypowiedzenia.html?doc=urlop',       bg:'#f0fdf4', stroke:'#16a34a', icon:'sun' },
    { name:'Wypowiedzenie umowy o pracę',  desc:'Wypowiedzenie — krok po kroku',       href:'wypowiedzenia.html?doc=wypowiedzenie', bg:'#fef9c3', stroke:'#ca8a04', icon:'doc' },
    { name:'Wniosek o świadectwo pracy',   desc:'Dokument potwierdzający zatrudnienie', href:'wypowiedzenia.html?doc=swiadectwo', bg:'#fdf4ff', stroke:'#a855f7', icon:'badge' }
  ],
  biznes_ecommerce: [
    { name:'Regulamin sklepu internetowego', desc:'Zgodny z prawem konsumenckim',  href:'ecommerce.html?doc=regulamin', bg:'#eff6ff', stroke:'#2563eb', icon:'shop' },
    { name:'Polityka prywatności RODO',      desc:'Dokumentacja ochrony danych',   href:'ecommerce.html?doc=rodo',      bg:'#ecfdf5', stroke:'#059669', icon:'shield' },
    { name:'Polityka zwrotów',               desc:'Procedura reklamacji i zwrotów', href:'ecommerce.html?doc=zwroty',    bg:'#fff1f2', stroke:'#f43f5e', icon:'doc' }
  ],
  biznes_hr: [
    { name:'Umowa o pracę',           desc:'Pełna umowa zgodna z Kodeksem pracy', href:'hr.html?doc=uop',    bg:'#f0fdf4', stroke:'#16a34a', icon:'badge' },
    { name:'Umowa B2B',               desc:'Umowa współpracy między firmami',     href:'hr.html?doc=b2b',    bg:'#fef9c3', stroke:'#ca8a04', icon:'handshake' },
    { name:'Umowa NDA (poufność)',    desc:'Ochrona informacji poufnych',         href:'hr.html?doc=nda',    bg:'#fdf4ff', stroke:'#a855f7', icon:'shield' },
    { name:'Umowa o dzieło',          desc:'Jednorazowe zlecenie twórcze',        href:'hr.html?doc=dzielo', bg:'#fff1f2', stroke:'#f43f5e', icon:'doc' },
    { name:'Umowa zlecenie',          desc:'Współpraca na zasadach zlecenia',     href:'hr.html?doc=zlecenie', bg:'#fef3c7', stroke:'#d97706', icon:'doc' }
  ],
  biznes_admin: [
    { name:'Umowa najmu mieszkania',       desc:'Najem na czas określony lub nieokreślony', href:'admin.html?doc=najmu',              bg:'#f0fdf4', stroke:'#16a34a', icon:'house' },
    { name:'Protokół zdawczo-odbiorczy',   desc:'Przy przekazaniu lub zwrocie lokalu',      href:'admin.html?doc=protokol',           bg:'#eff6ff', stroke:'#2563eb', icon:'badge' },
    { name:'Wypowiedzenie umowy najmu',    desc:'Dla najemcy i wynajmującego',              href:'admin.html?doc=wypowiedzenie_najmu', bg:'#fef9c3', stroke:'#ca8a04', icon:'doc' },
    { name:'Umowa wspólników',             desc:'Regulamin współpracy w spółce',           href:'admin.html?doc=spolnikow',           bg:'#fdf4ff', stroke:'#a855f7', icon:'handshake' },
    { name:'Biznesplan dla banku',         desc:'Profesjonalny plan finansowy firmy',      href:'admin.html?doc=biznesplan',          bg:'#f8fafc', stroke:'#475569', icon:'calc' },
    { name:'Analiza SWOT firmy',           desc:'Strategiczna analiza mocnych stron',      href:'admin.html?doc=swot',               bg:'#fff7ed', stroke:'#ea580c', icon:'file' }
  ],
  biznes_faktury: [
    { name:'Faktura VAT',      desc:'Generator faktur z pozycjami i VAT',   href:'faktura.html?type=vat',        bg:'#fff7ed', stroke:'#ea580c', icon:'doc' },
    { name:'Faktura proforma', desc:'Wstępna faktura przed realizacją',     href:'faktura.html?type=proforma',   bg:'#eff6ff', stroke:'#2563eb', icon:'doc' },
    { name:'Faktura zaliczkowa', desc:'Faktura na podstawie wpłaconej zaliczki', href:'faktura.html?type=zaliczkowa', bg:'#f0fdf4', stroke:'#16a34a', icon:'doc' }
  ]
};

function _wmIcon(type, stroke, bg) {
  var icons = {
    calc:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/></svg>',
    sun:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    doc:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    badge:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/><path d="M3 8h18"/></svg>',
    cv:       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    letter:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    shop:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    shield:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
    handshake:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 11l-5-5-5 5"/><path d="M17 19l-5-5-5 5"/></svg>',
    house:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    file:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
    match:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
    edit:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
  };
  return '<div class="wm-tool-icon" style="background:'+bg+'">'+( icons[type]||icons.file )+'</div>';
}

var _wmNav = { zone: null, fromBiznesCat: false };

function _wmHideAllSteps() {
  ['wm-step1','wm-step2','wm-step2b','wm-step3-cv','wm-step3-letter','wm-step3-match'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('wm-step-sep').style.display  = 'none';
  document.getElementById('wm-step-sep2').style.display = 'none';
  document.getElementById('wm-step2-ind').style.display = 'none';
  document.getElementById('wm-step3-ind').style.display = 'none';
}

function _wmShowToolList(toolKey, title) {
  var tools = _wmTools[toolKey] || [];
  document.getElementById('wm-tools-title').textContent = title;
  document.getElementById('wm-tools-grid').innerHTML = tools.map(function(t) {
    var inner = _wmIcon(t.icon, t.stroke, t.bg)+'<div><div class="wm-tool-name">'+t.name+'</div><div class="wm-tool-desc">'+t.desc+'</div></div>';
    if (t.action) return '<button onclick="wmOpenSubWizard(\''+t.action+'\')" class="wm-tool-item">'+inner+'</button>';
    return '<a href="'+t.href+'" class="wm-tool-item">'+inner+'</a>';
  }).join('');
  document.getElementById('wm-step2').style.display = 'block';
}

window.wmSelectZone = function(zone) {
  _wmNav.zone = zone;
  _wmNav.fromBiznesCat = false;
  _wmHideAllSteps();

  if (zone === 'kariera') {
    // Kariera: od razu lista narzędzi (krok 2)
    document.getElementById('wm-step2-label').textContent = 'Kariera';
    document.getElementById('wm-step-sep').style.display = 'block';
    document.getElementById('wm-step2-ind').style.display = 'flex';
    _wmShowToolList('kariera', 'Strefa Kariery — wybierz narzędzie');
  } else {
    // Biznes: najpierw sub-kategorie (krok 2)
    document.getElementById('wm-step2-label').textContent = 'Kategoria';
    document.getElementById('wm-step-sep').style.display = 'block';
    document.getElementById('wm-step2-ind').style.display = 'flex';
    document.getElementById('wm-step2b').style.display = 'block';
  }
};

window.wmSelectBiznesCat = function(cat) {
  _wmNav.fromBiznesCat = true;
  var catTitles = { ecommerce: 'E-commerce — wybierz dokument', hr: 'HR i umowy — wybierz dokument', admin: 'Administracja i majątek — wybierz dokument', faktury: 'Faktury — wybierz dokument' };
  document.getElementById('wm-step2b').style.display = 'none';
  document.getElementById('wm-step-sep2').style.display = 'block';
  document.getElementById('wm-step3-ind').style.display = 'flex';
  _wmShowToolList('biznes_' + cat, catTitles[cat] || 'Wybierz dokument');
};

window.wmGoBack = function() {
  _wmHideAllSteps();
  if (_wmNav.fromBiznesCat) {
    // Z listy dokumentów biznes → wróć do sub-kategorii
    _wmNav.fromBiznesCat = false;
    document.getElementById('wm-step2b').style.display = 'block';
    document.getElementById('wm-step-sep').style.display = 'block';
    document.getElementById('wm-step2-ind').style.display = 'flex';
  } else {
    // Z step2 lub step2b → wróć do step1
    _wmNav.zone = null;
    document.getElementById('wm-step1').style.display = 'block';
  }
};

window.wmGoBackToTools = function() {
  document.getElementById('wm-step2').style.display = 'block';
  document.getElementById('wm-step3-cv').style.display = 'none';
  document.getElementById('wm-step3-letter').style.display = 'none';
  document.getElementById('wm-step3-match').style.display = 'none';
};

window.wmOpenSubWizard = function(action) {
  document.getElementById('wm-step2').style.display = 'none';
  if (action === 'cv-wizard') {
    document.getElementById('wm-step3-cv').style.display = 'block';
  } else if (action === 'letter-wizard') {
    document.getElementById('wm-step3-letter').style.display = 'block';
    _wmLetter.q = 0; _wmLetter.answers = {};
    document.getElementById('wm-letter-back-btn').style.display = 'inline-flex';
    _wmRenderLetter();
  } else if (action === 'match-wizard') {
    document.getElementById('wm-step3-match').style.display = 'block';
    _wmMatch.state = 'input'; _wmMatch.result = null; _wmMatch.cvText = ''; _wmMatch.cvName = ''; _wmMatch.jobText = ''; _wmMatch.urlFailed = false;
    _wmRenderMatch();
  }
};

// ── CV upload ──
window.wmHandleCvUpload = function(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  if (file.type !== 'application/pdf') { alert('Proszę wybrać plik PDF.'); return; }
  if (file.size > 10 * 1024 * 1024) { alert('Plik jest za duży (maks. 10 MB).'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      sessionStorage.setItem('dokumo_import_cv_pdf', e.target.result);
      window.location.href = 'kreator-cv.html?mode=import';
    } catch(err) { alert('Plik jest za duży do przekazania. Spróbuj mniejszego pliku.'); }
  };
  reader.readAsDataURL(file);
};

// ── Letter wizard ──
var _wmLetter = { q: 0, answers: {} };
var _wmLetterQuestions = [
  { q:'Na jakie stanowisko aplikujesz?',       hint:'Np. „Specjalista ds. marketingu", „Frontend Developer"', key:'position', type:'input',    placeholder:'Wpisz nazwę stanowiska…' },
  { q:'Jak nazywa się firma?',                  hint:'Podaj pełną nazwę firmy, do której aplikujesz',          key:'company',  type:'input',    placeholder:'Np. Allegro, mBank, startup XYZ…' },
  { q:'Opisz 2–3 doświadczenia, osiągnięcia zawodowe oraz Twoje umiejętności twarde i miękkie', hint:'Konkretne liczby i efekty przekonują rekruterów bardziej niż ogólne stwierdzenia', key:'achievements', type:'textarea', rows:3, placeholder:'Np. „Zwiększyłem sprzedaż o 30% w 6 miesięcy, znam Python i Excel, szybko się uczę i dobrze pracuję w zespole"…' },
  { q:'Dlaczego chcesz pracować właśnie tutaj?', hint:'Pokaż, że znasz firmę — to wyróżni Cię spośród innych kandydatów', key:'motivation', type:'textarea', rows:3, placeholder:'Co Cię przyciąga do tej firmy lub tego stanowiska?…' }
];

function _wmRenderLetter() {
  var container = document.getElementById('wm-letter-wizard');
  var qs = _wmLetterQuestions;
  var qi = _wmLetter.q;

  if (qi >= qs.length) {
    document.getElementById('wm-letter-back-btn').style.display = 'none';
    container.innerHTML =
      '<div class="wm-generating">' +
        '<div class="wm-gen-spinner"></div>' +
        '<div class="wm-gen-title">AI tworzy Twój list motywacyjny…</div>' +
        '<div class="wm-gen-sub">Przygotowujemy spersonalizowaną treść.</div>' +
      '</div>';
    setTimeout(function() {
      window.location.href = 'list-motywacyjny.html?type=cover-letter&' + new URLSearchParams(_wmLetter.answers).toString();
    }, 2000);
    return;
  }

  var q = qs[qi];
  var prog = '<div class="wm-wiz-progress">' +
    qs.map(function(_,i){ return '<div class="wm-wdot'+(i<qi?' done':i===qi?' active':'')+'" ></div>'; }).join('') +
    '</div>';

  var inputHtml = q.type === 'textarea'
    ? '<textarea class="wm-wiz-input" id="wmLetterInput" rows="'+(q.rows||3)+'" placeholder="'+q.placeholder+'"></textarea>'
    : '<input type="text" class="wm-wiz-input" id="wmLetterInput" placeholder="'+q.placeholder+'">';

  var isLast = qi === qs.length - 1;
  var btnLabel = isLast
    ? 'Generuj list motywacyjny <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
    : 'Dalej <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

  container.innerHTML = prog +
    '<div class="wm-wiz-q">'+q.q+'</div>' +
    '<div class="wm-wiz-hint">'+q.hint+'</div>' +
    inputHtml +
    '<button class="wm-wiz-next" id="wmLetterNext" disabled onclick="wmLetterAdvance()">'+btnLabel+'</button>';

  container.style.animation = 'none'; container.offsetHeight;
  container.style.animation = 'wmIn .25s ease both';

  setTimeout(function() {
    var inp = document.getElementById('wmLetterInput');
    if (!inp) return;
    inp.focus();
    inp.addEventListener('input', function() {
      document.getElementById('wmLetterNext').disabled = inp.value.trim().length < 2;
    });
    if (q.type !== 'textarea') {
      inp.addEventListener('keydown', function(e) { if(e.key==='Enter') wmLetterAdvance(); });
    }
  }, 40);
}

window.wmLetterAdvance = function() {
  var inp = document.getElementById('wmLetterInput');
  if (!inp || inp.value.trim().length < 2) return;
  _wmLetter.answers[_wmLetterQuestions[_wmLetter.q].key] = inp.value.trim();
  _wmLetter.q++;
  _wmRenderLetter();
};

// ── MATCH WIZARD ──
var _wmMatch = { state: 'input', result: null, cvText: '', cvName: '', jobText: '', urlFailed: false };

function _wmRenderMatch() {
  var c = document.getElementById('wm-match-container');
  if (!c) return;
  var s = _wmMatch;

  if (s.state === 'loading') {
    c.innerHTML = '<div class="wm-generating"><div class="wm-gen-spinner"></div><div class="wm-gen-title">AI analizuje dopasowanie…</div><div class="wm-gen-sub">Porównujemy Twoje CV z wymaganiami ogłoszenia</div></div>';
    return;
  }

  if (s.state === 'result' && s.result) {
    var r = s.result;
    var pct = Math.min(100, Math.max(0, r.match_percent || 0));
    var barColor = pct >= 70 ? '#22c55e' : pct >= 45 ? '#f59e0b' : '#ef4444';
    var missKw = (r.missing_keywords || []).slice(0, 6);
    var matchKw = (r.matching_keywords || []).slice(0, 4);
    var sugs = (r.suggestions || []).slice(0, 4);

    var kwHtml = '';
    if (missKw.length) kwHtml += '<div style="font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Brakuje Ci</div>' + missKw.map(function(k){ return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><div style="width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0;"></div><span style="font-size:.75rem;color:#374151;">'+k+'</span></div>'; }).join('');
    if (matchKw.length) kwHtml += '<div style="font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;margin-top:8px;">Masz już</div>' + matchKw.map(function(k){ return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><div style="width:7px;height:7px;border-radius:50%;background:#22c55e;flex-shrink:0;"></div><span style="font-size:.75rem;color:#374151;">'+k+'</span></div>'; }).join('');

    var sugHtml = sugs.map(function(sg){ return '<div style="display:flex;align-items:flex-start;gap:9px;padding:9px 11px;background:#f9fafb;border-radius:10px;margin-bottom:6px;"><span style="font-size:.85rem;">✏️</span><div><div style="font-size:.72rem;font-weight:700;color:#374151;">'+sg.section+'</div><div style="font-size:.72rem;color:#6b7280;margin-top:2px;">'+sg.tip+'</div></div></div>'; }).join('');

    c.innerHTML =
      (r.overall_assessment ? '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:11px;padding:10px 12px;font-size:.78rem;color:#166534;margin-bottom:12px;">💡 '+r.overall_assessment+'</div>' : '') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
        '<div style="background:#f9fafb;border-radius:12px;padding:12px;">' +
          '<div style="font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;">Dopasowanie</div>' +
          '<div style="font-size:1.6rem;font-weight:900;color:#111827;line-height:1;">'+pct+'%</div>' +
          '<div style="height:5px;background:#e5e7eb;border-radius:99px;margin-top:8px;overflow:hidden;"><div id="wmMatchBar" style="height:100%;width:0%;background:'+barColor+';border-radius:99px;transition:width .6s ease;"></div></div>' +
        '</div>' +
        '<div style="background:#f9fafb;border-radius:12px;padding:12px;overflow-y:auto;max-height:100px;">'+kwHtml+'</div>' +
      '</div>' +
      (sugHtml ? '<div style="font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;">Sugestie zmian</div>'+sugHtml : '') +
      '<a href="wybierz-szablon.html" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px;margin-top:10px;background:#111827;color:#fff;border-radius:11px;text-decoration:none;font-size:.87rem;font-weight:800;">Otwórz kreator CV <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>';

    setTimeout(function(){ var b = document.getElementById('wmMatchBar'); if(b) b.style.width = pct+'%'; }, 60);
    return;
  }

  var cvUploadHtml = s.cvText
    ? '<div style="display:flex;align-items:center;gap:7px;padding:9px 12px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg><span style="font-size:.78rem;color:#065f46;font-weight:600;">'+s.cvName+'</span><button onclick="_wmMatchClearCv()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#9ca3af;font-size:.73rem;padding:0;">Usuń</button></div>'
    : '<button onclick="document.getElementById(\'wmMatchCvFile\').click()" style="display:flex;align-items:center;justify-content:center;gap:7px;width:100%;padding:11px;background:#fafafa;border:1.5px dashed #d1d5db;border-radius:10px;cursor:pointer;font-size:.8rem;color:#374151;font-weight:600;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Wgraj CV (PDF lub TXT)</button>' +
      '<input type="file" id="wmMatchCvFile" accept=".pdf,.txt" style="display:none" onchange="wmMatchLoadCv(this)">';

  var fallbackHtml = s.urlFailed
    ? '<div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:9px;padding:9px 12px;font-size:.75rem;color:#9a3412;margin-bottom:6px;">Nie udało się pobrać linku. Wklej treść ogłoszenia poniżej.</div>' +
      '<textarea class="wm-wiz-input" id="wmMatchJob" rows="5" placeholder="Wklej treść ogłoszenia o pracę…">'+( s.jobText || '')+'</textarea>'
    : '';

  c.innerHTML =
    '<div style="margin-bottom:10px;">' +
      '<div style="font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;">Twoje CV</div>' +
      cvUploadHtml +
    '</div>' +
    '<div style="margin-bottom:12px;">' +
      '<div style="font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;">Ogłoszenie o pracę</div>' +
      '<input type="url" class="wm-wiz-input" id="wmMatchUrl" placeholder="Wklej link do ogłoszenia…" value="'+(s.matchUrl||'')+'">' +
      fallbackHtml +
    '</div>' +
    '<button class="wm-wiz-next" id="wmMatchBtn" disabled onclick="wmRunMatch()">Analizuj dopasowanie <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button>';

  setTimeout(function() {
    var urlEl = document.getElementById('wmMatchUrl');
    var jobEl = document.getElementById('wmMatchJob');
    function check() {
      var hasCV = !!_wmMatch.cvText;
      var hasJob = (urlEl && urlEl.value.trim().length > 5) || (jobEl && jobEl.value.trim().length > 20);
      var btn = document.getElementById('wmMatchBtn');
      if (btn) btn.disabled = !(hasCV && hasJob);
    }
    if (urlEl) urlEl.addEventListener('input', function(){ _wmMatch.matchUrl = urlEl.value; check(); });
    if (jobEl) jobEl.addEventListener('input', function(){ _wmMatch.jobText = jobEl.value; check(); });
    check();
  }, 40);
}

window._wmMatchClearCv = function() {
  _wmMatch.cvText = ''; _wmMatch.cvName = '';
  _wmRenderMatch();
};

window.wmMatchLoadCv = function(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  if (file.type === 'application/pdf') {
    if (typeof pdfjsLib === 'undefined') {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function() {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        _wmExtractMatchPdf(file);
      };
      document.head.appendChild(s);
    } else { _wmExtractMatchPdf(file); }
  } else {
    var reader = new FileReader();
    reader.onload = function(e) { _wmMatch.cvText = e.target.result.trim(); _wmMatch.cvName = file.name; _wmRenderMatch(); };
    reader.readAsText(file, 'UTF-8');
  }
};

async function _wmExtractMatchPdf(file) {
  try {
    var ab = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    var text = '';
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var content = await page.getTextContent();
      text += content.items.map(function(it){ return it.str; }).join(' ') + '\n';
    }
    _wmMatch.cvText = text.trim(); _wmMatch.cvName = file.name;
    _wmRenderMatch();
  } catch(e) { alert('Nie udało się wczytać PDF. Spróbuj .txt.'); }
}

window.wmRunMatch = async function() {
  var urlEl = document.getElementById('wmMatchUrl');
  var jobEl = document.getElementById('wmMatchJob');
  var cvText = _wmMatch.cvText || '';
  var urlVal = (urlEl && urlEl.value.trim()) || '';
  var jobText = (jobEl && jobEl.value.trim()) || _wmMatch.jobText || '';

  if (!cvText || cvText.length < 20) return;

  if (urlVal && jobText.length < 20) {
    _wmMatch.state = 'loading'; _wmRenderMatch();
    try {
      var fr = await fetch('/api/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: urlVal }) });
      var fd = await fr.json();
      if (!fr.ok || !fd.text) throw new Error(fd.error || 'Błąd');
      jobText = fd.text;
    } catch(err) {
      _wmMatch.state = 'input'; _wmMatch.urlFailed = true; _wmMatch.matchUrl = urlVal;
      _wmRenderMatch(); return;
    }
  }

  if (!jobText || jobText.length < 20) return;

  _wmMatch.state = 'loading'; _wmRenderMatch();

  var prompt =
    'Jesteś ekspertem HR. Przeanalizuj dopasowanie poniższego CV do ogłoszenia o pracę.\n' +
    'Zwróć WYŁĄCZNIE surowy obiekt JSON (bez markdown, bez backticks) w tej strukturze:\n' +
    '{\n  "match_percent": 72,\n  "missing_keywords": ["Scrum","JIRA"],\n  "matching_keywords": ["JavaScript","React"],\n' +
    '  "suggestions": [{"section":"Podsumowanie","tip":"Dodaj..."}],\n  "overall_assessment": "Krótka ocena."\n}\n\n' +
    'CV KANDYDATA:\n' + cvText.substring(0, 4000) + '\n\nOGŁOSZENIE:\n' + jobText.substring(0, 4000);

  try {
    var res = await fetch('/api/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt: prompt }) });
    if (!res.ok) throw new Error('Błąd API: ' + res.status);
    var data = await res.json();
    var raw = (data.text || data.result || '').replace(/```json|```/g,'').trim();
    var parsed;
    try { parsed = JSON.parse(raw); } catch(e) { var m = raw.match(/\{[\s\S]*\}/); if(m) parsed = JSON.parse(m[0]); else throw new Error('Błąd odczytu odpowiedzi AI.'); }
    _wmMatch.result = parsed; _wmMatch.state = 'result'; _wmRenderMatch();
  } catch(err) {
    _wmMatch.state = 'input'; _wmRenderMatch();
    var c = document.getElementById('wm-match-container');
    if (c) c.insertAdjacentHTML('afterbegin','<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:11px;padding:10px 13px;font-size:.78rem;color:#991b1b;margin-bottom:10px;">⚠ '+(err.message||'Spróbuj ponownie.')+'</div>');
  }
};

window.wizardModalOpen = function() {
  var ov = document.getElementById('wm-overlay');
  var card = document.getElementById('wm-card');
  // reset to step 1
  _wmNav.zone = null; _wmNav.fromBiznesCat = false;
  _wmHideAllSteps();
  document.getElementById('wm-step1').style.display = 'block';
  ov.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(function(){ requestAnimationFrame(function(){
    card.style.transform = 'translateY(0) scale(1)';
    card.style.opacity = '1';
  }); });
};
window.wmOpenLetter = function() {
  _wmNav.zone = 'kariera'; _wmNav.fromBiznesCat = false;
  _wmHideAllSteps();
  document.getElementById('wm-step2-ind').style.display = 'flex';
  document.getElementById('wm-step-sep').style.display = 'block';
  document.getElementById('wm-step2-label').textContent = 'Kariera';
  document.getElementById('wm-step3-letter').style.display = 'block';
  _wmLetter.q = 0; _wmLetter.answers = {};
  document.getElementById('wm-letter-back-btn').style.display = 'inline-flex';
  _wmRenderLetter();
  var ov = document.getElementById('wm-overlay');
  var card = document.getElementById('wm-card');
  ov.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(function(){ requestAnimationFrame(function(){
    card.style.transform = 'translateY(0) scale(1)';
    card.style.opacity = '1';
  }); });
};
window.wizardModalClose = function(e) {
  if(e && e.target !== document.getElementById('wm-overlay')) return;
  var card = document.getElementById('wm-card');
  card.style.transform = 'translateY(24px) scale(.97)';
  card.style.opacity = '0';
  setTimeout(function(){ document.getElementById('wm-overlay').style.display = 'none'; document.body.style.overflow = ''; }, 300);
};
document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ var ov=document.getElementById('wm-overlay'); if(ov.style.display==='flex') wizardModalClose(); }});
document.addEventListener('DOMContentLoaded', function(){
  if(new URLSearchParams(location.search).get('open')==='letter') wmOpenLetter();
});
