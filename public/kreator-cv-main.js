// ======================================================
// IMPORT CV Z PDF (wyzwalany z kariera.html via sessionStorage)
// ======================================================

try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch(e) {}

function _cvImportSetProgress(text, pct) {
  document.getElementById('cvImportText').textContent = text;
  document.getElementById('cvImportBar').style.width = pct + '%';
}

function _cvImportShowError(msg) {
  document.getElementById('cvImportText').textContent = 'Wystąpił błąd';
  document.getElementById('cvImportBar').style.width = '0%';
  const errEl = document.getElementById('cvImportError');
  errEl.textContent = '⚠ ' + msg;
  errEl.style.display = 'block';
  document.getElementById('cvImportErrorClose').style.display = 'inline-block';
}

async function processCvImport(arrayBuffer) {
  const overlay = document.getElementById('cvImportOverlay');
  overlay.style.display = 'flex';
  _cvImportSetProgress('Wczytuję plik PDF…', 10);

  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }

    if (!fullText.trim()) {
      _cvImportShowError('Nie udało się wyciągnąć tekstu z PDF. Upewnij się, że plik nie jest skanem obrazkowym.');
      return;
    }

    _cvImportSetProgress('Wyciągam dane przez AI…', 40);

    const prompt = `Jesteś parserem CV. Twoim jedynym zadaniem jest PRZEPISANIE danych z CV do formatu JSON — dokładnie tak jak są w tekście. NIE dodawaj, NIE zmieniaj, NIE ulepszaj, NIE generuj żadnych nowych informacji. Jeśli jakiegoś pola nie ma w CV — zostaw puste ("" lub []).

Zwróć TYLKO surowy obiekt JSON (bez markdown, bez backticks, bez wyjaśnień):
{
  "imie": "przepisz imię z CV",
  "nazwisko": "przepisz nazwisko z CV",
  "stanowisko": "przepisz stanowisko/tytuł z CV, jeśli nie ma — puste",
  "email": "przepisz email z CV, jeśli nie ma — puste",
  "tel": "przepisz telefon z CV, jeśli nie ma — puste",
  "adres": "przepisz miasto/adres z CV, jeśli nie ma — puste",
  "linkedin": "przepisz URL LinkedIn z CV, jeśli nie ma — puste",
  "www": "przepisz URL strony z CV, jeśli nie ma — puste",
  "podsumowanie": "przepisz dosłownie tekst podsumowania/profilu z CV, jeśli nie ma — puste",
  "doswiadczenie": [
    {"firma": "nazwa firmy z CV", "stanowisko": "stanowisko z CV", "od": "data z CV", "do": "data z CV", "opis": "przepisz opis obowiązków z CV dosłownie"}
  ],
  "wyksztalcenie": [
    {"szkola": "nazwa z CV", "kierunek": "kierunek z CV", "od": "rok z CV", "do": "rok z CV", "opis": ""}
  ],
  "umiejetnosci": "przepisz umiejętności z CV oddzielone przecinkami, jeśli nie ma — puste",
  "jezyki": [
    {"jezyk": "nazwa języka z CV", "poziom": "poziom z CV (A1/A2/B1/B2/C1/C2/Ojczysty)"}
  ],
  "zainteresowania": "przepisz zainteresowania z CV oddzielone przecinkami, jeśli nie ma — puste"
}

TEKST CV:
${fullText.substring(0, 8000)}`;

    const _tok71 = typeof window._fbToken === 'function' ? await window._fbToken() : (window._fbToken || '');
    const response = await fetch('/api/generate-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _tok71 },
      body: JSON.stringify({ prompt, type: 'cv' })
    });

    if (response.status === 403 || response.status === 429) { _showFreeAiLimitModal('cv'); throw new Error('limit'); }
    if (!response.ok) throw new Error('Błąd API: ' + response.status);

    _cvImportSetProgress('Przetwarzam odpowiedź AI…', 78);

    const data = await response.json();
    const rawText = data.text || data.result || '';

    let parsed;
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch(e) {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('Nie udało się odczytać odpowiedzi AI.');
    }

    _cvImportSetProgress('Wypełniam formularz…', 94);

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

    _cvImportSetProgress('Gotowe! ✓', 100);

    setTimeout(() => {
      renderCVForm();
      updateCVPreview();
      overlay.style.display = 'none';
    }, 600);

  } catch(err) {
    console.error('Import error:', err);
    _cvImportShowError(err.message || 'Spróbuj ponownie.');
  }
}

// ── MOBILE TABS ───────────────────────────────────────────
function switchCVTab(tab) {
  const formCol = document.getElementById('cvFormPanel');
  const previewCol = document.getElementById('cvPreviewCol');
  const tabForm = document.getElementById('tabForm');
  const tabPreview = document.getElementById('tabPreview');
  const isMobile = window.innerWidth < 768;

  if (!isMobile) return;

  if (tab === 'form') {
    formCol.style.display = '';
    previewCol.style.display = 'none';
    tabForm.classList.add('active');
    tabPreview.classList.remove('active');
  } else {
    formCol.style.display = 'none';
    previewCol.style.display = 'flex';
    tabPreview.classList.add('active');
    tabForm.classList.remove('active');
    scaleMobilePreview();
  }
}

function scaleMobilePreview() {
  const previewDoc = document.getElementById('cvPreviewInner');
  const previewCol = document.getElementById('cvPreviewCol');
  if (!previewDoc || !previewCol || window.innerWidth >= 768) return;
  // Use full viewport width with 16px margin each side
  const vw = window.innerWidth;
  const margin = 12;
  const availW = vw - margin * 2;
  const scale = availW / 595;
  const scaledH = Math.round(842 * scale);
  previewDoc.style.zoom = '';
  previewDoc.style.width = '595px';
  previewDoc.style.transform = `scale(${scale})`;
  previewDoc.style.transformOrigin = 'top left';
  previewDoc.style.position = 'relative';
  previewDoc.style.left = margin + 'px';
  previewDoc.style.top = '0';
  previewDoc.style.marginTop = '0';
  previewDoc.style.marginBottom = -(842 - scaledH) + 'px'; // collapse extra space
  previewDoc.style.flexShrink = '0';
  // Container: enough height for scaled content + label + bottom bar
  previewCol.style.minHeight = (scaledH + 60) + 'px';
  previewCol.style.overflow = 'auto';
  previewCol.style.paddingLeft = '0';
  previewCol.style.paddingRight = '0';
  previewCol.style.alignItems = 'flex-start';
}

// ── ZOOM KONTROLA PODGLĄDU ────────────────────────────────
var _cvZoom = 1.0;
var _cvZoomMin = 0.4;
var _cvZoomMax = 2.0;
var _cvZoomStep = 0.1;

function applyCvZoom() {
  var doc = document.getElementById('cvPreviewInner');
  if (!doc || window.innerWidth < 768) return;
  doc.style.zoom = _cvZoom;
  var el = document.getElementById('cvZoomLevel');
  if (el) el.textContent = Math.round(_cvZoom * 100) + '%';
}

function cvZoomStep(dir) {
  _cvZoom = Math.min(_cvZoomMax, Math.max(_cvZoomMin, Math.round((_cvZoom + dir * _cvZoomStep) * 100) / 100));
  applyCvZoom();
}

(function() {
  var col = document.getElementById('cvPreviewCol');
  if (!col) return;
  col.addEventListener('wheel', function(e) {
    if (window.innerWidth < 768) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      var dir = e.deltaY > 0 ? -1 : 1;
      cvZoomStep(dir);
    }
  }, { passive: false });
})();

window.addEventListener('resize', () => {
  if (window.innerWidth >= 768) {
    const formCol = document.getElementById('cvFormPanel');
    const previewCol = document.getElementById('cvPreviewCol');
    if (formCol) formCol.style.display = '';
    if (previewCol) { previewCol.style.display = ''; previewCol.style.minHeight = ''; }
    const previewDoc = document.getElementById('cvPreviewInner');
    if (previewDoc) {
      previewDoc.style.transform = '';
      previewDoc.style.width = '';
      previewDoc.style.position = '';
      previewDoc.style.left = '';
      previewDoc.style.flexShrink = '';
      previewDoc.style.marginBottom = '';
    }
    applyCvZoom();
  } else {
    scaleMobilePreview();
  }
});

// ── KREATOR CV ──────────────────────────────────────────────

const CV_STRIPE = 'https://buy.stripe.com/test_28E4gB0uqbzf18o0Bs1Jm00';

let cvData = {
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
let cvTemplate = 'nova';

const CV_TEMPLATES = [
  { id:'nova',         name:'Nova',         color1:'#1a3a2e', color2:'#2d6b52',  thumb:'linear-gradient(135deg,#1a3a2e 0%,#1a3a2e 30%,#f8f8f8 30%)' },
  { id:'maroon',       name:'Maroon',       color1:'#1a1a2e', color2:'#6b7280',  thumb:'linear-gradient(90deg,#fff 63%,#f8f8f8 63%)' },
  { id:'biznes',       name:'Biznes',       color1:'#1a3a5c', color2:'#2980b9',  thumb:'linear-gradient(90deg,#f5f7fa 34%,#fff 34%)' },
  { id:'prestige',     name:'Prestige',     color1:'#0d1b2a', color2:'#c9a84c',  thumb:'linear-gradient(180deg,#0d1b2a 30%,#c9a84c 30%,#c9a84c 32.5%,#f5f3ef 32.5%)' },
  { id:'nordic',       name:'Nordic',       color1:'#1a3a2e', color2:'#2d6b52',  thumb:'linear-gradient(180deg,#fff 0%,#fff 30%,#f8f8f8 30%)' },
  { id:'cascade',      name:'Cascade',      color1:'#0f766e', color2:'#14b8a6',  thumb:'linear-gradient(90deg,#0f766e 36%,#f0faf9 36%)' },
  { id:'metro',        name:'Metro',        color1:'#1a3a2e', color2:'#2d6b52',  thumb:'linear-gradient(180deg,#1a1a1a 25%,#f6f6f6 25%)' },
  { id:'sidebar',      name:'Sidebar',      color1:'#1a2744', color2:'#2c4a8a',  thumb:'linear-gradient(90deg,#1a2744 37%,#f8f8f8 37%)' },
  { id:'timeline',     name:'Timeline',     color1:'#1a3a2e', color2:'#2d6b52',  thumb:'linear-gradient(135deg,#1a3a2e,#2d6b52)' },
  { id:'creative',     name:'Creative',     color1:'#6b21a8', color2:'#a855f7',  thumb:'linear-gradient(135deg,#6b21a8,#a855f7)' },
  { id:'bold',         name:'Bold',         color1:'#c0392b', color2:'#e74c3c',  thumb:'linear-gradient(135deg,#111,#c0392b)' },
  { id:'teal',         name:'Teal',         color1:'#0f766e', color2:'#14b8a6',  thumb:'linear-gradient(135deg,#0f766e,#14b8a6)' },
  { id:'midnight',     name:'Midnight',     color1:'#0f172a', color2:'#334155',  thumb:'linear-gradient(135deg,#0f172a,#334155)' },
  { id:'coral',        name:'Coral',        color1:'#c2410c', color2:'#fb923c',  thumb:'linear-gradient(135deg,#c2410c,#fb923c)' },
  { id:'rose',         name:'Rose',         color1:'#9d174d', color2:'#ec4899',  thumb:'linear-gradient(135deg,#9d174d,#ec4899)' },
  { id:'dynamic',      name:'Dynamic',      color1:'#1e56b0', color2:'#0d3875',  thumb:'linear-gradient(135deg,#fff 55%,#1e56b0 55%)' },
  { id:'ocean',        name:'Ocean',        color1:'#1e40af', color2:'#38bdf8',  thumb:'linear-gradient(135deg,#1e40af,#38bdf8)' },
  { id:'shield',       name:'Shield',       color1:'#1a2744', color2:'#e8e4dc',  thumb:'linear-gradient(160deg,#1a2744 55%,#e8e4dc 55%)' },
  { id:'executive',    name:'Executive',    color1:'#92400e', color2:'#d97706',  thumb:'linear-gradient(135deg,#111 55%,#92400e 100%)' },
  { id:'athens',       name:'Athens',       color1:'#1e3a5f', color2:'#2563eb',  thumb:'linear-gradient(135deg,#1e3a5f,#2563eb)' },
  { id:'matrix',       name:'Matrix',       color1:'#00ff88', color2:'#00cc6a',  thumb:'linear-gradient(135deg,#0d1117 60%,#00ff88 100%)' },
  { id:'prism',        name:'Prism',        color1:'#7c3aed', color2:'#ec4899',  thumb:'linear-gradient(135deg,#7c3aed,#ec4899)' },
  { id:'oxford',       name:'Oxford',       color1:'#11355c', color2:'#2980b9',  thumb:'linear-gradient(90deg,#11355c 28%,#f8f8f8 28%)' },
  { id:'linen',        name:'Linen',        color1:'#92400e', color2:'#d97706',  thumb:'linear-gradient(135deg,#fef3c7,#fed7aa)' },
];

// ── DANE SEKCJI (kolejność drag&drop) ────────────────────────
let cvSectionOrder = ['podsumowanie','doswiadczenie','wyksztalcenie','umiejetnosci','certyfikaty','jezyki','zainteresowania'];

// ── WIZARD ──────────────────────────────────────────────────
// Read ?template= from URL — if present, skip step 0 (template picker)
(function() {
  const p = new URLSearchParams(window.location.search);
  const tpl = p.get('template');
  const mode = p.get('mode');
  const from = p.get('from');
  const known = ['nova','oxford','prestige','nordic','cascade','metro','sidebar','timeline','creative','bold','teal','midnight','coral','rose','ocean','shield','executive','athens','matrix','prism','linen','biznes','maroon','dynamic'];
  if (tpl && known.includes(tpl)) {
    cvTemplate = tpl; // Template chosen on picker page — continue to wizard
  } else if (mode === 'import' || mode === 'improve' || from === 'translate') {
    // Special cases: imported CV / AI improve — don't redirect, use default template
  } else {
    // No template — send user to template picker
    window.location.replace('wybierz-szablon.html');
  }
})();

let cvWizardStep = 0; // Step 0 = Dane osobowe (template chosen on separate page)

const CV_WIZARD_STEPS = [
  { label: 'Dane osobowe' },
  { label: 'Podsumowanie' },
  { label: 'Doświadczenie' },
  { label: 'Wykształcenie' },
  { label: 'Umiejętności' },
  { label: 'Finalizacja' },
];
function cvWizardNext() {
  if (cvWizardStep < CV_WIZARD_STEPS.length - 1) {
    cvWizardStep++;
    // autoOpen indexed from 0: 0=osobowe,1=podsumowanie,2=doswiadczenie,3=wyksztalcenie,4=umiejetnosci,5=finalizacja
    const autoOpen = [null,'podsumowanie','doswiadczenie','wyksztalcenie','umiejetnosci',null];
    if (autoOpen[cvWizardStep]) cvOpenSections.add(autoOpen[cvWizardStep]);
    renderCVForm();
    document.getElementById('cvFormPanel').scrollTop = 0;
  }
}
function cvWizardPrev() {
  if (cvWizardStep > 0) { cvWizardStep--; renderCVForm(); document.getElementById('cvFormPanel').scrollTop = 0; }
  else { window.location.href = 'wybierz-szablon.html'; } // Back from step 0 → template picker
}
function cvWizardGoTo(i) {
  if (i <= cvWizardStep) { cvWizardStep = i; renderCVForm(); document.getElementById('cvFormPanel').scrollTop = 0; }
}
function cvWizardTogglePreview() {
  if (window.innerWidth >= 768) return;
  const app = document.querySelector('.cv-app');
  const isActive = app.classList.toggle('cvw-mobile-preview-active');
  // Ensure back button exists
  let backBtn = document.getElementById('cvwMobileBack');
  if (!backBtn) {
    backBtn = document.createElement('button');
    backBtn.id = 'cvwMobileBack';
    backBtn.className = 'cvw-mobile-preview-back';
    backBtn.textContent = '← Wróć do edycji';
    backBtn.onclick = () => { app.classList.remove('cvw-mobile-preview-active'); };
    app.appendChild(backBtn); // must be inside .cv-app for CSS selector to work
  }
  if (isActive) scaleMobilePreview();
}
function cvWizardPickTpl(id) {
  cvTemplate = id;
  const t = CV_TEMPLATES.find(x => x.id === id);
  if (t) { const dot = document.getElementById('tplDot'); if (dot) dot.style.background = t.color1; }
  updateCVPreview();
  renderCVForm();
}
let cvCustomSections = []; // [{id, title, content}]
// Sections shown in sidebar for 2-col layouts (cascade/sidebar); rest go to main column
const CASCADE_SIDEBAR_DEFAULTS = ['umiejetnosci','jezyki','certyfikaty','kursy','staze','zainteresowania'];
let cvSidebarSections = new Set(CASCADE_SIDEBAR_DEFAULTS);
const CASCADE_MOVABLE = new Set(['umiejetnosci','jezyki','certyfikaty','kursy','staze','zainteresowania']);
const SIDEBAR_TPLS = new Set(['cascade','sidebar','athens','timeline','oxford','biznes','maroon','dynamic']);
function toggleCascadeSidebar(sec, e) {
  if (e) { e.stopPropagation(); }
  if (cvSidebarSections.has(sec)) cvSidebarSections.delete(sec);
  else cvSidebarSections.add(sec);
  renderCVForm(); updateCVPreview();
}

const POLISH_UNIVERSITIES = [
  'Uniwersytet Warszawski','Uniwersytet Jagielloński','Politechnika Warszawska',
  'Akademia Górniczo-Hutnicza w Krakowie','Politechnika Gdańska','Politechnika Wrocławska',
  'Politechnika Łódzka','Politechnika Poznańska','Politechnika Śląska','Politechnika Krakowska',
  'Uniwersytet Wrocławski','Uniwersytet im. Adama Mickiewicza w Poznaniu',
  'Uniwersytet Gdański','Uniwersytet Łódzki','Uniwersytet Śląski w Katowicach',
  'Szkoła Główna Handlowa w Warszawie','Szkoła Główna Gospodarstwa Wiejskiego',
  'Akademia Leona Koźmińskiego','Uczelnia Łazarskiego','SWPS Uniwersytet Humanistycznospołeczny',
  'Uniwersytet MERITO Warszawa','Wyższa Szkoła Informatyki i Zarządzania w Rzeszowie',
  'Akademia WSB','Collegium Civitas','Vistula University','Wojskowa Akademia Techniczna',
  'Akademia Marynarki Wojennej','Uniwersytet Medyczny w Warszawie','Gdański Uniwersytet Medyczny',
  'Katolicki Uniwersytet Lubelski','Polsko-Japońska Akademia Technik Komputerowych',
  'Wyższa Szkoła Bankowa','Akademia Humanistyczno-Ekonomiczna w Łodzi',
  'Liceum Ogólnokształcące','Technikum','Szkoła Policealna'
];

const KIERUNKI_SUGGESTIONS = [
  'Informatyka','Zarządzanie','Finanse i Rachunkowość','Marketing','Ekonomia',
  'Prawo','Psychologia','Pedagogika','Budownictwo','Architektura',
  'Mechanika i Budowa Maszyn','Elektrotechnika','Automatyka i Robotyka',
  'Inżynieria Oprogramowania','Cyberbezpieczeństwo','Analityka Danych',
  'Grafika Komputerowa','Wzornictwo Przemysłowe','Administracja','Logistyka',
  'Turystyka i Rekreacja','Filologia Angielska','Filologia Polska','Historia',
  'Socjologia','Dziennikarstwo','Stosunki Międzynarodowe','Politologia',
  'Medycyna','Pielęgniarstwo','Farmacja','Fizjoterapia','Stomatologia',
  'Matematyka','Fizyka','Chemia','Biologia','Biotechnologia',
  'Rolnictwo','Leśnictwo','Geodezja i Kartografia','Inżynieria Środowiska'
];

const TOP_LANGS = ['Angielski','Niemiecki','Francuski','Hiszpański','Włoski','Rosyjski','Chiński','Ukraiński','Niderlandzki','Portugalski'];
const TOP_CERTS = ['Google Analytics (GA4)','Google Ads','Meta Blueprint','HubSpot Marketing','HubSpot Sales','Scrum Master (PSM I)','Prince2 Foundation','PMP','AWS Cloud Practitioner','Microsoft Azure','Power BI','Excel (MOS)','ICDL/ECDL','Lean Six Sigma','TOEIC','IELTS'];

function addLangChip(lang) {
  // Check if this language is already in the list (empty slot or duplicate)
  const existing = cvData.jezyki.find(l => l.jezyk.toLowerCase() === lang.toLowerCase());
  if (existing) return;
  // Find first empty slot or add new
  const empty = cvData.jezyki.find(l => !l.jezyk);
  if (empty) {
    empty.jezyk = lang;
  } else {
    cvData.jezyki.push({ jezyk: lang, poziom: 'B2' });
  }
  // Re-render the jezyki section body
  const item = document.querySelector('.acc-item[data-section="jezyki"]');
  if (item) {
    const body = item.querySelector('.acc-body');
    if (body) {
      body.innerHTML = buildSectionBodyHTML('jezyki');
    }
  }
  updateCVPreview();
}

const SKILLS_SUGGESTIONS_HARD = [
  'Microsoft Office','Excel','Word','PowerPoint','Python','JavaScript','SQL','Photoshop',
  'Illustrator','Figma','AutoCAD','SAP','Salesforce','Google Analytics','Jira','Slack',
  'Adobe Premiere','After Effects','WordPress','React','Node.js','Git','Docker','Scrum','Lean/Agile'
];
const SKILLS_SUGGESTIONS_SOFT = {
  pl: ['Zarządzanie projektem','Praca w zespole','Komunikacja','Analiza danych','Prezentacje',
    'Obsługa klienta','Negocjacje','Zarządzanie czasem','Marketing','SEO','Social Media',
    'E-commerce','Księgowość','Kadry i płace','Prawo pracy','RODO'],
  en: ['Project Management','Teamwork','Communication','Data Analysis','Presentations',
    'Customer Service','Negotiation','Time Management','Marketing','SEO','Social Media',
    'E-commerce','Accounting','HR','Employment Law','GDPR'],
  de: ['Projektmanagement','Teamarbeit','Kommunikation','Datenanalyse','Präsentationen',
    'Kundenservice','Verhandlung','Zeitmanagement','Marketing','SEO','Social Media',
    'E-Commerce','Buchhaltung','Personalwesen','Arbeitsrecht','DSGVO'],
  uk: ['Управління проектами','Командна робота','Комунікація','Аналіз даних','Презентації',
    'Обслуговування клієнтів','Переговори','Управління часом','Маркетинг','SEO','Соціальні мережі',
    'E-commerce','Бухгалтерія','HR','Трудове право','GDPR'],
  es: ['Gestión de proyectos','Trabajo en equipo','Comunicación','Análisis de datos','Presentaciones',
    'Atención al cliente','Negociación','Gestión del tiempo','Marketing','SEO','Redes sociales',
    'E-commerce','Contabilidad','RRHH','Derecho laboral','RGPD'],
  cs: ['Řízení projektů','Týmová práce','Komunikace','Analýza dat','Prezentace',
    'Zákaznický servis','Vyjednávání','Time management','Marketing','SEO','Sociální sítě',
    'E-commerce','Účetnictví','HR','Pracovní právo','GDPR'],
  nl: ['Projectmanagement','Teamwork','Communicatie','Data-analyse','Presentaties',
    'Klantenservice','Onderhandelen','Tijdsbeheer','Marketing','SEO','Social Media',
    'E-commerce','Boekhouding','HR','Arbeidsrecht','AVG']
};
function getSkillSuggestions() {
  const soft = SKILLS_SUGGESTIONS_SOFT[cvCurrentLang] || SKILLS_SUGGESTIONS_SOFT.pl;
  return [...SKILLS_SUGGESTIONS_HARD, ...soft];
}

const INTERESTS_SUGGESTIONS_MAP = {
  pl: ['Fotografia','Sport','Muzyka','Gotowanie','Podróże','Czytanie','Gry planszowe',
    'Gry komputerowe','Siłownia','Bieganie','Kolarstwo','Pływanie','Wspinaczka',
    'Sztuki walki','Taniec','Malarstwo','Rysunek','Film','Wolontariat',
    'Programowanie','Elektronika','Motoryzacja','Szachy','Inwestowanie','Historia'],
  en: ['Photography','Sports','Music','Cooking','Travel','Reading','Board Games',
    'Video Games','Gym','Running','Cycling','Swimming','Rock Climbing',
    'Martial Arts','Dancing','Painting','Drawing','Film','Volunteering',
    'Programming','Electronics','Cars','Chess','Investing','History'],
  de: ['Fotografie','Sport','Musik','Kochen','Reisen','Lesen','Brettspiele',
    'Videospiele','Fitnessstudio','Laufen','Radfahren','Schwimmen','Klettern',
    'Kampfsport','Tanzen','Malen','Zeichnen','Film','Ehrenamt',
    'Programmierung','Elektronik','Autos','Schach','Investieren','Geschichte'],
  uk: ['Фотографія','Спорт','Музика','Кулінарія','Подорожі','Читання','Настільні ігри',
    'Відеоігри','Тренажерний зал','Біг','Велоспорт','Плавання','Скелелазіння',
    'Бойові мистецтва','Танці','Малювання','Кіно','Волонтерство',
    'Програмування','Електроніка','Автомобілі','Шахи','Інвестування','Історія'],
  es: ['Fotografía','Deporte','Música','Cocina','Viajes','Lectura','Juegos de mesa',
    'Videojuegos','Gimnasio','Running','Ciclismo','Natación','Escalada',
    'Artes marciales','Baile','Pintura','Dibujo','Cine','Voluntariado',
    'Programación','Electrónica','Automoción','Ajedrez','Inversiones','Historia'],
  cs: ['Fotografie','Sport','Hudba','Vaření','Cestování','Čtení','Deskovky',
    'Videohry','Posilovna','Běh','Cyklistika','Plavání','Horolezectví',
    'Bojová umění','Tanec','Malování','Kreslení','Film','Dobrovolnictví',
    'Programování','Elektronika','Auta','Šachy','Investování','Dějiny'],
  nl: ['Fotografie','Sport','Muziek','Koken','Reizen','Lezen','Bordspellen',
    'Videospellen','Fitness','Hardlopen','Fietsen','Zwemmen','Klimmen',
    'Vechtsport','Dansen','Schilderen','Tekenen','Film','Vrijwilligerswerk',
    'Programmeren','Elektronica',"Auto's",'Schaken','Beleggen','Geschiedenis']
};
function getInterestSuggestions() {
  return INTERESTS_SUGGESTIONS_MAP[cvCurrentLang] || INTERESTS_SUGGESTIONS_MAP.pl;
}

// Które sekcje są otwarte
let cvOpenSections = new Set(['doswiadczenie']);

const SEC_LABELS = {
  get podsumowanie() { return L('professionalSummary'); },
  get doswiadczenie() { return L('workExperience'); },
  get wyksztalcenie()  { return L('educationSection'); },
  get umiejetnosci()   { return L('skillsSection'); },
  get certyfikaty()    { return 'Certyfikaty'; },
  get kursy()          { return 'Kursy'; },
  get staze()          { return 'Staże'; },
  get jezyki()         { return L('languagesSection'); },
  get zainteresowania(){ return L('interestsSection'); }
};

function getSectionSummary(sec) {
  if (sec === 'podsumowanie') return cvData.podsumowanie ? cvData.podsumowanie.substring(0,55)+'…' : '';
  if (sec === 'doswiadczenie') {
    const f = cvData.doswiadczenie.filter(e=>e.firma||e.stanowisko);
    return f.length ? f.map(e=>e.firma||e.stanowisko).join(', ') : '';
  }
  if (sec === 'wyksztalcenie') {
    const f = cvData.wyksztalcenie.filter(e=>e.szkola);
    return f.length ? f.map(e=>e.szkola).join(', ') : '';
  }
  if (sec === 'umiejetnosci') return cvData.umiejetnosci ? cvData.umiejetnosci.substring(0,50) : '';
  if (sec === 'certyfikaty') { const f = (cvData.certyfikatyList||[]).filter(c=>c.nazwa); return f.length ? f.map(c=>c.nazwa).join(', ').substring(0,50) : ''; }
  if (sec === 'kursy') { const f = (cvData.kursy||[]).filter(k=>k.nazwa); return f.length ? f.map(k=>k.nazwa).join(', ').substring(0,50) : ''; }
  if (sec === 'staze') { const f = (cvData.staze||[]).filter(s=>s.firma); return f.length ? f.map(s=>s.firma).join(', ').substring(0,50) : ''; }
  if (sec === 'jezyki') return cvData.jezyki.filter(l=>l.jezyk).map(l=>l.jezyk).join(', ');
  if (sec === 'zainteresowania') return cvData.zainteresowania ? cvData.zainteresowania.substring(0,50) : '';
  return '';
}

function toggleAccSection(sec) {
  if (cvOpenSections.has(sec)) {
    cvOpenSections.delete(sec);
  } else {
    cvOpenSections.add(sec);
    setTimeout(() => {
      if (sec === 'umiejetnosci') updateSkillChips();
      if (sec === 'zainteresowania') updateInterestChips();
    }, 30);
  }
  const item = document.querySelector('.acc-item[data-section="'+sec+'"]');
  if (!item) return;
  item.classList.toggle('open', cvOpenSections.has(sec));
  const sumEl = item.querySelector('.acc-summary');
  if (sumEl) sumEl.textContent = getSectionSummary(sec);
}


// ── PERSONAL ACCORDION ──────────────────────────────────────
let personalOpen = true;
function toggleAccPersonal() {
  const item = document.getElementById('accPersonalItem');
  if (!item) return;
  personalOpen = !personalOpen;
  item.classList.toggle('open', personalOpen);
}

// ── CV LANGUAGE – STATIC LABELS (no AI needed) ───────────────
let cvCurrentLang = (function(){var l=new URLSearchParams(location.search).get('lang');return(l&&['pl','en','de','uk','es','cs','nl'].includes(l))?l:'pl';})();

// All section header translations
const CV_LABELS = {
  pl: {
    experience: 'Doświadczenie zawodowe', education: 'Wykształcenie',
    skills: 'Umiejętności', languages: 'Języki', summary: 'Podsumowanie',
    profile: 'Profil osobisty', interests: 'Hobby i zainteresowania',
    contact: 'Dane kontaktowe', present: 'Obecnie',
    consent: 'Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.',
    // UI labels
    personalData: 'Dane osobowe', professionalSummary: 'Profil osobisty',
    workExperience: 'Doświadczenie zawodowe', educationSection: 'Wykształcenie',
    skillsSection: 'Umiejętności', languagesSection: 'Języki', interestsSection: 'Hobby i zainteresowania',
    firstName: 'Imię', lastName: 'Nazwisko', position: 'Stanowisko / tytuł zawodowy',
    email: 'Email', phone: 'Telefon', city: 'Adres / Miasto', linkedin: 'LinkedIn',
    company: 'Firma', jobTitle: 'Stanowisko', from: 'Od', to: 'Do', duties: 'Obowiązki',
    school: 'Uczelnia / szkoła', field: 'Kierunek / tytuł',
    addMore: '＋ Dodaj kolejne', addLang: '＋ Dodaj język', addSection: '＋ Dodaj własną sekcję',
    sectionName: 'Nazwa sekcji', sectionContent: 'Treść sekcji...',
    remove: '✕ Usuń', removePhoto: '✕ Usuń zdjęcie',
    skillsPlaceholder: 'Excel, Python, Photoshop...', skillsHint: 'Oddzielaj przecinkami · klikaj propozycje:',
    summaryPlaceholder: 'Krótki opis swoich kompetencji i celów zawodowych (2–4 zdania)...',
    companyPlaceholder: 'Google Polska', jobPlaceholder: 'Marketing Manager',
    currentlyPlaceholder: 'obecnie', schoolPlaceholder: 'Uniwersytet Warszawski',
    fieldPlaceholder: 'Finanse i Rachunkowość', langPlaceholder: 'Angielski',
    fillBelow: 'Uzupełnij dane poniżej',
    fullNamePlaceholder: 'Twoje imię i nazwisko',
    autocorrectLabel: 'Sprawdzanie pisowni',
    hintSummary: 'Napisz 2–3 zdania: kim jesteś, co potrafisz i czego szukasz zawodowo.',
    hintExp: 'Wpisz każde miejsce pracy osobno. Zacznij od najnowszego.',
    hintEdu: 'Podaj szkołę, kierunek i daty nauki. Zacznij od najnowszego wykształcenia.',
    hintLang: 'Dodaj języki z poziomem wg skali CEFR (A1–C2) lub wybierz Ojczysty.',
    certHint: 'Wymień certyfikaty i kursy oddzielone przecinkami. Kliknij propozycję:',
    interestsHint: 'Wymień zainteresowania oddzielone przecinkami. Kliknij propozycję:',
  },
  en: {
    experience: 'Work Experience', education: 'Education',
    skills: 'Skills', languages: 'Languages', summary: 'Summary',
    profile: 'Professional Profile', interests: 'Interests & Hobbies',
    contact: 'Contact', present: 'Present',
    consent: 'I consent to the processing of my personal data for recruitment purposes.',
    personalData: 'Personal Details', professionalSummary: 'Personal Profile',
    workExperience: 'Work Experience', educationSection: 'Education',
    skillsSection: 'Skills', languagesSection: 'Languages', interestsSection: 'Interests & Hobbies',
    firstName: 'First Name', lastName: 'Last Name', position: 'Job Title',
    email: 'Email', phone: 'Phone', city: 'City / Address', linkedin: 'LinkedIn',
    company: 'Company', jobTitle: 'Position', from: 'From', to: 'To', duties: 'Responsibilities',
    school: 'University / School', field: 'Degree / Field of study',
    addMore: '＋ Add another', addLang: '＋ Add language', addSection: '＋ Add custom section',
    sectionName: 'Section name', sectionContent: 'Section content...',
    remove: '✕ Remove', removePhoto: '✕ Remove photo',
    skillsPlaceholder: 'Excel, Python, Photoshop...', skillsHint: 'Separate with commas · click suggestions:',
    summaryPlaceholder: 'Brief description of your skills and career goals (2–4 sentences)...',
    companyPlaceholder: 'Google', jobPlaceholder: 'Marketing Manager',
    currentlyPlaceholder: 'present', schoolPlaceholder: 'University of Warsaw',
    fieldPlaceholder: 'Finance and Accounting', langPlaceholder: 'English',
    fillBelow: 'Fill in details below',
    fullNamePlaceholder: 'Your full name',
    autocorrectLabel: 'Spell checking',
    hintSummary: 'Write 2–3 sentences: who you are, your skills, and what you\'re looking for.',
    hintExp: 'Add each job separately. Start with the most recent position.',
    hintEdu: 'Enter school, field of study and dates. Start with the most recent.',
    hintLang: 'Add languages with CEFR level (A1–C2) or select Native.',
    certHint: 'List certificates and courses separated by commas. Click a suggestion:',
    interestsHint: 'List interests separated by commas. Click a suggestion:',
  },
  de: {
    experience: 'Berufserfahrung', education: 'Ausbildung',
    skills: 'Kenntnisse', languages: 'Sprachen', summary: 'Zusammenfassung',
    profile: 'Profil', interests: 'Interessen & Hobbys',
    contact: 'Kontakt', present: 'Heute',
    consent: 'Ich stimme der Verarbeitung meiner personenbezogenen Daten für Rekrutierungszwecke zu.',
    personalData: 'Persönliche Daten', professionalSummary: 'Persönliches Profil',
    workExperience: 'Berufserfahrung', educationSection: 'Ausbildung',
    skillsSection: 'Kenntnisse', languagesSection: 'Sprachen', interestsSection: 'Interessen & Hobbys',
    firstName: 'Vorname', lastName: 'Nachname', position: 'Berufsbezeichnung',
    email: 'E-Mail', phone: 'Telefon', city: 'Stadt / Adresse', linkedin: 'LinkedIn',
    company: 'Unternehmen', jobTitle: 'Position', from: 'Von', to: 'Bis', duties: 'Aufgaben',
    school: 'Universität / Schule', field: 'Studiengang / Abschluss',
    addMore: '＋ Weiteres hinzufügen', addLang: '＋ Sprache hinzufügen', addSection: '＋ Eigenen Abschnitt',
    sectionName: 'Abschnittsname', sectionContent: 'Inhalt...',
    remove: '✕ Entfernen', removePhoto: '✕ Foto entfernen',
    skillsPlaceholder: 'Excel, Python, Photoshop...', skillsHint: 'Mit Komma trennen · Vorschläge anklicken:',
    summaryPlaceholder: 'Kurze Beschreibung Ihrer Kompetenzen und Karriereziele (2–4 Sätze)...',
    companyPlaceholder: 'Google Deutschland', jobPlaceholder: 'Marketing Manager',
    currentlyPlaceholder: 'heute', schoolPlaceholder: 'Universität Berlin',
    fieldPlaceholder: 'Betriebswirtschaft', langPlaceholder: 'Englisch',
    fillBelow: 'Daten unten ausfüllen',
    fullNamePlaceholder: 'Vor- und Nachname',
    autocorrectLabel: 'Rechtschreibprüfung',
    hintSummary: 'Schreiben Sie 2–3 Sätze: wer Sie sind, was Sie können und was Sie suchen.',
    hintExp: 'Geben Sie jede Stelle einzeln ein. Beginnen Sie mit der neuesten.',
    hintEdu: 'Geben Sie Schule, Studiengang und Daten an. Beginnen Sie mit dem neuesten.',
    hintLang: 'Sprachen mit CEFR-Niveau (A1–C2) hinzufügen oder Muttersprachler wählen.',
    certHint: 'Zertifikate durch Kommas getrennt auflisten. Vorschlag anklicken:',
    interestsHint: 'Interessen durch Kommas getrennt auflisten. Vorschlag anklicken:',
  },
  uk: {
    experience: 'Досвід роботи', education: 'Освіта',
    skills: 'Навички', languages: 'Мови', summary: 'Резюме',
    profile: 'Профіль', interests: 'Інтереси та хобі',
    contact: 'Контакти', present: 'Зараз',
    consent: 'Я даю згоду на обробку моїх персональних даних для цілей рекрутингу.',
    personalData: 'Особисті дані', professionalSummary: 'Особистий профіль',
    workExperience: 'Досвід роботи', educationSection: 'Освіта',
    skillsSection: 'Навички', languagesSection: 'Мови', interestsSection: 'Інтереси та хобі',
    firstName: "Ім'я", lastName: 'Прізвище', position: 'Посада / назва',
    email: 'Email', phone: 'Телефон', city: 'Місто / адреса', linkedin: 'LinkedIn',
    company: 'Компанія', jobTitle: 'Посада', from: 'З', to: 'По', duties: "Обов'язки",
    school: 'Університет / школа', field: 'Спеціальність / ступінь',
    addMore: '＋ Додати ще', addLang: '＋ Додати мову', addSection: '＋ Власний розділ',
    sectionName: 'Назва розділу', sectionContent: 'Зміст...',
    remove: '✕ Видалити', removePhoto: '✕ Видалити фото',
    skillsPlaceholder: 'Excel, Python, Photoshop...', skillsHint: 'Розділяйте комами · клікайте на підказки:',
    summaryPlaceholder: "Короткий опис ваших компетенцій і кар'єрних цілей (2–4 речення)...",
    companyPlaceholder: 'Google', jobPlaceholder: 'Менеджер з маркетингу',
    currentlyPlaceholder: 'зараз', schoolPlaceholder: 'Університет',
    fieldPlaceholder: 'Фінанси та бухгалтерія', langPlaceholder: 'Англійська',
    fillBelow: 'Заповніть дані нижче',
    fullNamePlaceholder: 'Ваше ім\'я та прізвище',
    autocorrectLabel: 'Перевірка орфографії',
    hintSummary: 'Напишіть 2–3 речення: хто ви, що вмієте і чого шукаєте.',
    hintExp: 'Вносьте кожне місце роботи окремо. Починайте з останнього.',
    hintEdu: 'Вкажіть школу, спеціальність і дати. Починайте з найновішого.',
    hintLang: 'Додайте мови з рівнем CEFR (A1–C2) або оберіть Рідна.',
    certHint: 'Перерахуйте сертифікати через кому. Клікніть на пропозицію:',
    interestsHint: 'Перерахуйте інтереси через кому. Клікніть на пропозицію:',
  },
  es: {
    experience: 'Experiencia laboral', education: 'Educación',
    skills: 'Habilidades', languages: 'Idiomas', summary: 'Perfil',
    profile: 'Perfil profesional', interests: 'Intereses y aficiones',
    contact: 'Contacto', present: 'Presente',
    consent: 'Doy mi consentimiento para el tratamiento de mis datos personales con fines de contratación.',
    personalData: 'Datos personales', professionalSummary: 'Perfil personal',
    workExperience: 'Experiencia laboral', educationSection: 'Educación',
    skillsSection: 'Habilidades', languagesSection: 'Idiomas', interestsSection: 'Intereses y aficiones',
    firstName: 'Nombre', lastName: 'Apellido', position: 'Cargo / título profesional',
    email: 'Email', phone: 'Teléfono', city: 'Ciudad / dirección', linkedin: 'LinkedIn',
    company: 'Empresa', jobTitle: 'Cargo', from: 'Desde', to: 'Hasta', duties: 'Responsabilidades',
    school: 'Universidad / escuela', field: 'Carrera / título',
    addMore: '＋ Añadir otro', addLang: '＋ Añadir idioma', addSection: '＋ Sección personalizada',
    sectionName: 'Nombre de sección', sectionContent: 'Contenido...',
    remove: '✕ Eliminar', removePhoto: '✕ Eliminar foto',
    skillsPlaceholder: 'Excel, Python, Photoshop...', skillsHint: 'Separar con comas · haz clic en sugerencias:',
    summaryPlaceholder: 'Breve descripción de tus competencias y objetivos (2–4 frases)...',
    companyPlaceholder: 'Google', jobPlaceholder: 'Director de Marketing',
    currentlyPlaceholder: 'presente', schoolPlaceholder: 'Universidad',
    fieldPlaceholder: 'Finanzas y Contabilidad', langPlaceholder: 'Inglés',
    fillBelow: 'Completa los datos abajo',
    fullNamePlaceholder: 'Tu nombre completo',
    autocorrectLabel: 'Corrector ortográfico',
    hintSummary: 'Escribe 2–3 frases: quién eres, qué sabes y qué buscas profesionalmente.',
    hintExp: 'Añade cada trabajo por separado. Empieza por el más reciente.',
    hintEdu: 'Indica escuela, carrera y fechas. Empieza por la más reciente.',
    hintLang: 'Añade idiomas con nivel MCER (A1–C2) o selecciona Nativo.',
    certHint: 'Lista certificados separados por comas. Haz clic en una sugerencia:',
    interestsHint: 'Lista intereses separados por comas. Haz clic en una sugerencia:',
  },
  cs: {
    experience: 'Pracovní zkušenosti', education: 'Vzdělání',
    skills: 'Dovednosti', languages: 'Jazyky', summary: 'Souhrn',
    profile: 'Profesní profil', interests: 'Zájmy a koníčky',
    contact: 'Kontakt', present: 'Současnost',
    consent: 'Souhlasím se zpracováním svých osobních údajů pro účely náboru.',
    personalData: 'Osobní údaje', professionalSummary: 'Osobní profil',
    workExperience: 'Pracovní zkušenosti', educationSection: 'Vzdělání',
    skillsSection: 'Dovednosti', languagesSection: 'Jazyky', interestsSection: 'Zájmy a koníčky',
    firstName: 'Jméno', lastName: 'Příjmení', position: 'Pracovní pozice',
    email: 'E-mail', phone: 'Telefon', city: 'Město / adresa', linkedin: 'LinkedIn',
    company: 'Společnost', jobTitle: 'Pozice', from: 'Od', to: 'Do', duties: 'Povinnosti',
    school: 'Univerzita / škola', field: 'Obor / titul',
    addMore: '＋ Přidat další', addLang: '＋ Přidat jazyk', addSection: '＋ Vlastní sekce',
    sectionName: 'Název sekce', sectionContent: 'Obsah...',
    remove: '✕ Odstranit', removePhoto: '✕ Odstranit foto',
    skillsPlaceholder: 'Excel, Python, Photoshop...', skillsHint: 'Oddělujte čárkami · klikněte na návrhy:',
    summaryPlaceholder: 'Stručný popis vašich kompetencí a kariérních cílů (2–4 věty)...',
    companyPlaceholder: 'Google', jobPlaceholder: 'Marketing Manager',
    currentlyPlaceholder: 'současnost', schoolPlaceholder: 'Univerzita Karlova',
    fieldPlaceholder: 'Finance a účetnictví', langPlaceholder: 'Angličtina',
    fillBelow: 'Vyplňte údaje níže',
    fullNamePlaceholder: 'Vaše jméno a příjmení',
    autocorrectLabel: 'Kontrola pravopisu',
    hintSummary: 'Napište 2–3 věty: kdo jste, co umíte a co hledáte pracovně.',
    hintExp: 'Zadejte každé pracoviště zvlášť. Začněte tím nejnovějším.',
    hintEdu: 'Uveďte školu, obor a data. Začněte nejnovějším vzděláním.',
    hintLang: 'Přidejte jazyky s úrovní CEFR (A1–C2) nebo vyberte Rodný jazyk.',
    certHint: 'Uveďte certifikáty oddělené čárkami. Klikněte na návrh:',
    interestsHint: 'Uveďte zájmy oddělené čárkami. Klikněte na návrh:',
  },
  nl: {
    experience: 'Werkervaring', education: 'Opleiding',
    skills: 'Vaardigheden', languages: 'Talen', summary: 'Samenvatting',
    profile: 'Professioneel profiel', interests: "Interesses & hobby's",
    contact: 'Contact', present: 'Heden',
    consent: 'Ik geef toestemming voor de verwerking van mijn persoonsgegevens voor wervingsdoeleinden.',
    personalData: 'Persoonlijke gegevens', professionalSummary: 'Persoonlijk profiel',
    workExperience: 'Werkervaring', educationSection: 'Opleiding',
    skillsSection: 'Vaardigheden', languagesSection: 'Talen', interestsSection: "Interesses & hobby's",
    firstName: 'Voornaam', lastName: 'Achternaam', position: 'Functietitel',
    email: 'E-mail', phone: 'Telefoon', city: 'Stad / adres', linkedin: 'LinkedIn',
    company: 'Bedrijf', jobTitle: 'Functie', from: 'Van', to: 'Tot', duties: 'Taken',
    school: 'Universiteit / school', field: 'Studie / graad',
    addMore: '＋ Nog een toevoegen', addLang: '＋ Taal toevoegen', addSection: '＋ Eigen sectie',
    sectionName: 'Sectienaam', sectionContent: 'Inhoud...',
    remove: '✕ Verwijderen', removePhoto: '✕ Foto verwijderen',
    skillsPlaceholder: 'Excel, Python, Photoshop...', skillsHint: "Scheiden met komma's · klik op suggesties:",
    summaryPlaceholder: "Korte beschrijving van uw competenties en carrièredoelen (2–4 zinnen)...",
    companyPlaceholder: 'Google', jobPlaceholder: 'Marketing Manager',
    currentlyPlaceholder: 'heden', schoolPlaceholder: 'Universiteit van Amsterdam',
    fieldPlaceholder: 'Financiën en Administratie', langPlaceholder: 'Engels',
    fillBelow: 'Vul gegevens in hieronder',
    fullNamePlaceholder: 'Uw volledige naam',
    autocorrectLabel: 'Spellingcontrole',
    hintSummary: 'Schrijf 2–3 zinnen: wie u bent, wat u kunt en wat u zoekt.',
    hintExp: 'Voeg elke baan afzonderlijk toe. Begin met de meest recente.',
    hintEdu: 'Voer school, studie en data in. Begin met de meest recente opleiding.',
    hintLang: 'Voeg talen toe met ERK-niveau (A1–C2) of selecteer Moedertaal.',
    certHint: "Geef certificaten op, gescheiden door komma's. Klik op een suggestie:",
    interestsHint: "Geef interesses op, gescheiden door komma's. Klik op een suggestie:",
  },
};

// Helper used inside buildCVHTML templates
function L(key) {
  return (CV_LABELS[cvCurrentLang] || CV_LABELS.pl)[key] || CV_LABELS.pl[key];
}

function setCVLang(lang) {
  cvCurrentLang = lang;
  renderCVForm();
  updateCVPreview();
}

function applySpellcheck() {
  document.querySelectorAll('.cvf-input').forEach(function(el) {
    el.setAttribute('spellcheck', 'true');
    el.setAttribute('autocorrect', 'on');
    el.setAttribute('autocapitalize', 'sentences');
  });
}

function renderCVForm() {
  const panel = document.getElementById('cvFormPanel');
  const fullName = [cvData.imie, cvData.nazwisko].filter(Boolean).join(' ');
  const totalSteps = CV_WIZARD_STEPS.length;
  const pct = Math.round((cvWizardStep / (totalSteps - 1)) * 100);

  // Preview always active
  const previewCol = document.getElementById('cvPreviewCol');
  if (previewCol) previewCol.classList.remove('cvw-preview-blur');

  // Progress bar + step dots
  const progressHTML = `
    <div class="cvw-header">
      <div class="cvw-progress-wrap"><div class="cvw-progress-bar" style="width:${pct}%"></div></div>
      <div class="cvw-steps-row">
        ${CV_WIZARD_STEPS.map((s,i) => `
          <div class="cvw-step-dot ${i<cvWizardStep?'done':i===cvWizardStep?'active':''}" onclick="${i<=cvWizardStep?'cvWizardGoTo('+i+')':''}">
            <div class="cvw-dot-circle">${i<cvWizardStep?'✓':i+1}</div>
            <span class="cvw-dot-label">${s.label}</span>
          </div>`).join('')}
      </div>
    </div>`;

  // Step content
  let stepContent = '';
  if (cvWizardStep === 0) {
    stepContent = `
      <div class="acc-item open" id="accPersonalItem">
        <div class="acc-row" onclick="toggleAccPersonal()">
          <span class="acc-drag-spacer"></span>
          <div class="acc-info">
            <span class="acc-label">${L("personalData")}</span>
          </div>
          <button class="acc-btn" onclick="event.stopPropagation();toggleAccPersonal()" aria-label="Rozwiń lub zwiń sekcję danych osobowych">
            <svg width="14" height="14" viewBox="0 0 14 14"><line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="acc-plus-v"/><line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="acc-body" id="accPersonalBody">
          <div class="acc-personal-inner">
            <div class="cv-photo-drop" id="cvPhotoDrop"
              onclick="document.getElementById('cvPhotoInput').click()"
              ondragover="cvPhotoDragOver(event)"
              ondragleave="cvPhotoDragLeave(event)"
              ondrop="cvPhotoDropHandler(event)">
              <div class="cv-photo-avatar">
                ${cvData.zdjecie
                  ? `<img src="${cvData.zdjecie}" alt="Twoje zdjęcie profilowe"><div class="cv-photo-overlay">
                      <button class="cv-photo-ov-btn" title="Zmień" aria-label="Zmień zdjęcie" onclick="event.stopPropagation();document.getElementById('cvPhotoInput').click()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="cv-photo-ov-btn" title="Usuń" aria-label="Usuń zdjęcie" onclick="event.stopPropagation();cvData.zdjecie=null;renderCVForm();updateCVPreview()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                      </button>
                    </div>`
                  : `<div class="cv-photo-placeholder"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`}
              </div>
              <div class="cv-photo-info">
                <span class="cv-photo-label">${cvData.zdjecie ? 'Zmień zdjęcie' : 'Wybierz plik lub przeciągnij go tutaj'}</span>
                <span class="cv-photo-hint">JPG, PNG • maks. 2 MB</span>
              </div>
            </div>
            <input type="file" id="cvPhotoInput" accept="image/jpeg,image/png" style="display:none" onchange="loadPhoto(this)">
            <div class="cvf-grid2">
              <div class="cvf-group"><label>${L("firstName")}</label><input class="cvf-input" oninput="cvData.imie=this.value;updateCVPreview()" value="${cvData.imie}" placeholder="Jan"></div>
              <div class="cvf-group"><label>${L("lastName")}</label><input class="cvf-input" oninput="cvData.nazwisko=this.value;updateCVPreview()" value="${cvData.nazwisko}" placeholder="Kowalski"></div>
              <div class="cvf-group cvf-full"><label>${L("position")}</label><input class="cvf-input" oninput="cvData.stanowisko=this.value;updateCVPreview()" value="${cvData.stanowisko}" placeholder="Specjalista ds. marketingu"></div>
              <div class="cvf-group"><label>${L("email")}</label><input class="cvf-input" type="email" oninput="cvData.email=this.value;updateCVPreview()" value="${cvData.email}" placeholder="jan@email.pl"></div>
              <div class="cvf-group"><label>${L("phone")}</label><input class="cvf-input" oninput="cvData.tel=this.value;updateCVPreview()" value="${cvData.tel}" placeholder="+48 600 000 000"></div>
              <div class="cvf-group"><label>${L("city")}</label><input class="cvf-input" oninput="cvData.adres=this.value;updateCVPreview()" value="${cvData.adres}" placeholder="Warszawa"></div>
              <div class="cvf-group"><label>${L("linkedin")}</label><input class="cvf-input" oninput="cvData.linkedin=this.value;updateCVPreview()" value="${cvData.linkedin}" placeholder="linkedin.com/in/..."></div>
            </div>
          </div>
        </div>
      </div>`;
  } else if (cvWizardStep === 1) {
    stepContent = `<div class="acc-list">${buildSectionFormHTML('podsumowanie')}</div>`;
  } else if (cvWizardStep === 2) {
    stepContent = `<div class="acc-list" id="cvSectionsContainer">${buildSectionFormHTML('doswiadczenie')}</div>`;
  } else if (cvWizardStep === 3) {
    stepContent = `<div class="acc-list" id="cvSectionsContainer">${buildSectionFormHTML('wyksztalcenie')}</div>`;
  } else if (cvWizardStep === 4) {
    stepContent = `<div class="acc-list">${buildSectionFormHTML('umiejetnosci')}${buildSectionFormHTML('jezyki')}</div>`;
  } else if (cvWizardStep === 5) {
    stepContent = `
      <div class="acc-list">
        ${buildSectionFormHTML('certyfikaty')}
        ${buildSectionFormHTML('kursy')}
        ${buildSectionFormHTML('staze')}
        ${buildSectionFormHTML('zainteresowania')}
        ${cvCustomSections.map(sec => buildCustomSectionHTML(sec)).join('')}
      </div>
      <div style="padding:12px 16px 8px">
        <button class="cvf-add-custom-btn" onclick="addCustomSection()">${L("addSection")}</button>
      </div>`;
  }

  // Nav buttons
  const navHTML = `
    <div class="cvw-nav">
      ${cvWizardStep > 0
        ? `<button class="cvw-btn cvw-btn-back" onclick="cvWizardPrev()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Wstecz</button>`
        : `<button class="cvw-btn cvw-btn-back" onclick="window.location.href='wybierz-szablon.html'"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Szablon</button>`}
      <button class="cvw-btn cvw-btn-preview" onclick="cvWizardTogglePreview()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Podgląd</button>
      ${cvWizardStep < totalSteps - 1
        ? `<button class="cvw-btn cvw-btn-next" onclick="cvWizardNext()">Dalej <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>`
        : `<button class="cvw-btn cvw-btn-done" onclick="downloadCV()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Pobierz PDF</button>`}
    </div>`;

  panel.innerHTML = `
    ${progressHTML}
    <div class="cvw-content cvw-slide-in" id="cvwContent">
      ${stepContent}
    </div>
    ${navHTML}
  `;

  initDragDrop();
  if (cvWizardStep === 4 && cvOpenSections.has('umiejetnosci')) updateSkillChips();
  if (cvWizardStep === 5 && cvOpenSections.has('zainteresowania')) updateInterestChips();
  applySpellcheck();
}

function buildSectionFormHTML(sec) {
  const isOpen = cvOpenSections.has(sec);
  const label = SEC_LABELS[sec] || sec;
  const summary = getSectionSummary(sec);
  const body = buildSectionBodyHTML(sec);
  const showSidebarToggle = SIDEBAR_TPLS.has(cvTemplate) && CASCADE_MOVABLE.has(sec);
  const inSidebar = cvSidebarSections.has(sec);
  const sidebarBtn = showSidebarToggle ? `
    <button onclick="toggleCascadeSidebar('${sec}',event)" title="${inSidebar?'Przesuń do kolumny głównej':'Przesuń do panelu bocznego'}" style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:20px;border:1px solid ${inSidebar?'#2563eb':'#d1d5db'};background:${inSidebar?'#eff6ff':'#f9fafb'};color:${inSidebar?'#2563eb':'#6b7280'};font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">
      ${inSidebar
        ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 19l7-7-7-7"/></svg> Główna`
        : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg> Boczny`}
    </button>` : '';
  return `
    <div class="acc-item${isOpen ? ' open' : ''}" data-section="${sec}" draggable="true">
      <div class="acc-row" onclick="toggleAccSection('${sec}')">
        <span class="acc-drag" onclick="event.stopPropagation()" title="Przeciągnij">⠿</span>
        <div class="acc-info">
          <span class="acc-label">${label}</span>
          ${summary ? `<span class="acc-summary">${summary}</span>` : ''}
        </div>
        ${sidebarBtn}
        <button class="acc-btn" tabindex="-1" aria-label="Rozwiń lub zwiń sekcję">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="acc-plus-v"/>
            <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="acc-body">
        ${body}
      </div>
    </div>`;
}

// ── DATE HELPERS ─────────────────────────────────────────
function fmtMonth(val) {
  // Konwertuje "2022-01" → "01.2022"
  if (!val) return '';
  const m = val.match(/^(\d{4})-(\d{2})$/);
  if (m) return m[2] + '.' + m[1];
  return val;
}
function monthVal(stored) {
  // Konwertuje "01.2022" → "2022-01" (dla atrybutu value w type=month)
  if (!stored) return '';
  const m = stored.match(/^(\d{2})\.(\d{4})$/);
  if (m) return m[2] + '-' + m[1];
  const y = stored.match(/^(\d{4})$/);
  if (y) return y[1] + '-01';
  return stored;
}
function monthPartM(stored) {
  if (!stored) return '';
  const m = stored.match(/^(\d{2})\.(\d{4})$/);
  return m ? m[1] : '';
}
function monthPartY(stored) {
  if (!stored) return '';
  const m = stored.match(/^(\d{2})\.(\d{4})$/);
  if (m) return m[2];
  const y = stored.match(/^(\d{4})$/);
  return y ? y[1] : '';
}
function cvPickMonth(wrap) {
  const sels = wrap.querySelectorAll('select');
  const m = sels[0].value, y = sels[1].value;
  if (!y) return '';
  return m ? m + '.' + y : y;
}
function buildMonthPickerHTML(dataPath, stored) {
  const MONTHS = [['','Miesiąc'],['01','Sty'],['02','Lut'],['03','Mar'],['04','Kwi'],['05','Maj'],['06','Cze'],['07','Lip'],['08','Sie'],['09','Wrz'],['10','Paź'],['11','Lis'],['12','Gru']];
  const curM = monthPartM(stored), curY = monthPartY(stored);
  const curYear = new Date().getFullYear();
  const years = [];
  for (let y = curYear + 1; y >= 1970; y--) years.push(y);
  const onch = dataPath + '=cvPickMonth(this.closest(\'.cvf-monthpick\'));updateCVPreview()';
  return '<div class="cvf-monthpick" style="display:flex;gap:6px">'
    + '<select class="cvf-input" style="flex:0 0 88px;min-width:0;padding-right:2px;font-size:0.82rem" onchange="' + onch + '">'
    + MONTHS.map(([v,l]) => '<option value="' + v + '"' + (curM === v ? ' selected' : '') + '>' + l + '</option>').join('')
    + '</select>'
    + '<select class="cvf-input" style="flex:1;min-width:0;font-size:0.82rem" onchange="' + onch + '">'
    + '<option value="">Rok</option>'
    + years.map(y => '<option value="' + y + '"' + (curY === String(y) ? ' selected' : '') + '>' + y + '</option>').join('')
    + '</select></div>';
}

function buildSectionBodyHTML(sec) {
  if (sec === 'podsumowanie') return `
    <p class="acc-hint" style="margin-bottom:10px">${L('hintSummary')}</p>
    <textarea class="cvf-input" id="summaryTextarea" rows="4" oninput="cvData.podsumowanie=this.value;updateCVPreview()" placeholder="${L('summaryPlaceholder')}">${cvData.podsumowanie}</textarea>
    <div style="margin-top:8px">
      <button class="acc-add-more" onclick="useAISummary()" id="aiSummaryBtn" style="background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:#fff;border:none">✨ Użyj AI</button>
    </div>
    <div id="aiSuggestionBox" style="display:none;margin-top:12px;padding:14px;background:#f8f7ff;border:1px solid #d3cffe;border-radius:10px">
      <div style="font-size:0.78rem;color:#6c5ce7;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">Sugestia AI</div>
      <div id="aiSuggestionText" style="font-size:0.9rem;color:#3d3c3a;line-height:1.6;white-space:pre-wrap"></div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="acc-add-more" onclick="applyAISummary()" style="background:#6c5ce7;color:#fff;border:none">Zastosuj</button>
        <button class="acc-add-more" onclick="document.getElementById('aiSuggestionBox').style.display='none'" style="background:#e8e5e0;color:#5a5754;border:none">Odrzuć</button>
      </div>
    </div>`;

  if (sec === 'doswiadczenie') return `
    <p class="acc-hint" style="margin-bottom:10px">${L('hintExp')}</p>
    <div id="cvExpList">
      ${cvData.doswiadczenie.map((e,i) => `
        <div class="cvf-card">
          <div class="cvf-grid2">
            <div class="cvf-group cvf-full"><label>${L("company")}</label><input class="cvf-input" oninput="cvData.doswiadczenie[${i}].firma=this.value;updateCVPreview()" value="${e.firma}" placeholder="${L('companyPlaceholder')}"></div>
            <div class="cvf-group cvf-full"><label>${L("jobTitle")}</label><input class="cvf-input" oninput="cvData.doswiadczenie[${i}].stanowisko=this.value;updateCVPreview()" value="${e.stanowisko}" placeholder="${L('jobPlaceholder')}"></div>
            <div class="cvf-group"><label>${L("from")}</label>${buildMonthPickerHTML('cvData.doswiadczenie['+i+'].od',e.od)}</div>
            <div class="cvf-group"><label>${L("to")}</label>${buildMonthPickerHTML('cvData.doswiadczenie['+i+'].do',e.do)}</div>
            <div class="cvf-group cvf-full"><label>${L("duties")}</label>
              <textarea class="cvf-input" id="dutiesTA-${i}" rows="2" oninput="cvData.doswiadczenie[${i}].opis=this.value;updateCVPreview()" placeholder="${L('duties')}...">${e.opis}</textarea>
              <div style="margin-top:6px">
                <button class="acc-add-more" onclick="useAIDuties(${i})" id="aiDutiesBtn-${i}" style="background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:#fff;border:none">✨ Użyj AI</button>
              </div>
              <div id="aiDutiesBox-${i}" style="display:none;margin-top:10px;padding:12px;background:#f8f7ff;border:1px solid #d3cffe;border-radius:10px">
                <div style="font-size:0.78rem;color:#6c5ce7;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">Sugestia AI</div>
                <div id="aiDutiesText-${i}" style="font-size:0.9rem;color:#3d3c3a;line-height:1.6;white-space:pre-wrap"></div>
                <div style="margin-top:10px;display:flex;gap:8px">
                  <button class="acc-add-more" onclick="applyAIDuties(${i})" style="background:#6c5ce7;color:#fff;border:none">Zastosuj</button>
                  <button class="acc-add-more" onclick="document.getElementById('aiDutiesBox-${i}').style.display='none'" style="background:#e8e5e0;color:#5a5754;border:none">Odrzuć</button>
                </div>
              </div>
            </div>
          </div>
          ${i>0 ? `<button class="cvf-remove-btn" onclick="removeCVExp(${i})">${L("remove")}</button>` : ''}
        </div>`).join('')}
    </div>
    <button class="acc-add-more" onclick="addCVExp()">${L("addMore")}</button>`;

  if (sec === 'wyksztalcenie') return `
    <p class="acc-hint" style="margin-bottom:10px">${L('hintEdu')}</p>
    <div id="cvEduList">
      ${cvData.wyksztalcenie.map((e,i) => `
        <div class="cvf-card">
          <div class="cvf-grid2">
            <div class="cvf-group cvf-full"><label>${L("school")}</label>
              <div class="cvf-autocomplete-wrap">
                <input class="cvf-input" id="szkola-${i}" onfocus="showUniSuggest(${i},this.value)" oninput="cvData.wyksztalcenie[${i}].szkola=this.value;updateCVPreview();showUniSuggest(${i},this.value)" value="${e.szkola}" placeholder="Uniwersytet Warszawski" autocomplete="off">
                <div class="cvf-autocomplete-list" id="uni-list-${i}"></div>
              </div>
            </div>
            <div class="cvf-group cvf-full"><label>${L("field")}</label>
              <div class="cvf-autocomplete-wrap">
                <input class="cvf-input" id="kierunek-${i}" onfocus="showKierunekSuggest(${i},this.value)" oninput="cvData.wyksztalcenie[${i}].kierunek=this.value;updateCVPreview();showKierunekSuggest(${i},this.value)" value="${e.kierunek}" placeholder="Finanse i Rachunkowość" autocomplete="off">
                <div class="cvf-autocomplete-list" id="kierunek-list-${i}"></div>
              </div>
            </div>
            <div class="cvf-group"><label>${L("from")}</label>${buildMonthPickerHTML('cvData.wyksztalcenie['+i+'].od',e.od)}</div>
            <div class="cvf-group"><label>${L("to")}</label>${buildMonthPickerHTML('cvData.wyksztalcenie['+i+'].do',e.do)}</div>
          </div>
          ${i>0 ? `<button class="cvf-remove-btn" onclick="removeCVEdu(${i})">${L("remove")}</button>` : ''}
        </div>`).join('')}
    </div>
    <button class="acc-add-more" onclick="addCVEdu()">${L("addMore")}</button>`;

  if (sec === 'umiejetnosci') return `
    <input class="cvf-input" id="skillsInput" oninput="cvData.umiejetnosci=this.value;updateCVPreview();updateSkillChips()" value="${cvData.umiejetnosci}" placeholder="${L('skillsPlaceholder')}">
    <p class="acc-hint">${L("skillsHint")}</p>
    <div class="cvf-suggestions" id="skillSuggestions"></div>`;

  if (sec === 'jezyki') return `
    <p class="acc-hint" style="margin-bottom:10px">${L('hintLang')}</p>
    <div id="cvLangList">
      ${cvData.jezyki.map((l,i) => `
        <div class="acc-lang-row">
          <input class="cvf-input" style="flex:1;min-width:0" oninput="cvData.jezyki[${i}].jezyk=this.value;updateCVPreview()" value="${l.jezyk}" placeholder="${L('langPlaceholder')}">
          <select class="cvf-input" style="width:100px;flex-shrink:0" onchange="cvData.jezyki[${i}].poziom=this.value;updateCVPreview()">
            ${['A1','A2','B1','B2','C1','C2','Ojczysty'].map(p=>`<option${l.poziom===p?' selected':''}>${p}</option>`).join('')}
          </select>
          <button class="acc-remove-x" onclick="removeCVLang(${i})" aria-label="Usuń język" ${i===0&&cvData.jezyki.length===1?'style="visibility:hidden"':''}>✕</button>
        </div>`).join('')}
    </div>
    <div style="margin-top:8px">
      <button class="acc-add-more" id="addLangBtn" onclick="toggleLangPicker()" style="display:flex;align-items:center;gap:6px">
        <span id="addLangArrow" style="font-size:0.7rem;transition:transform 0.2s">▼</span> ${L("addLang")}
      </button>
      <div id="langPicker" style="display:none;margin-top:4px;border:1px solid #dedad4;border-radius:8px;background:var(--white,#fff);overflow:hidden">
        ${TOP_LANGS.map(l => `<div style="padding:8px 14px;cursor:pointer;font-size:0.88rem;color:var(--ink,#3d3c3a);border-bottom:1px solid #f0ede8" onmousedown="event.preventDefault();addLangFromPicker('${l}')" onmouseenter="this.style.background='var(--bg,#f5f5f7)'" onmouseleave="this.style.background=''">${l}</div>`).join('')}
      </div>
    </div>`;

  if (sec === 'certyfikaty') return `
    <div id="certList">
      ${(cvData.certyfikatyList||[]).map((c,i) => `
        <div class="cvf-struct-entry" data-ci="${i}">
          <div class="cvf-grid2" style="margin-bottom:4px">
            <div class="cvf-group cvf-full"><label>Nazwa certyfikatu</label><input class="cvf-input" oninput="cvData.certyfikatyList[${i}].nazwa=this.value;updateCVPreview()" value="${c.nazwa||''}" placeholder="np. Google Analytics, AWS Certified..."></div>
            <div class="cvf-group"><label>Wydany przez</label><input class="cvf-input" oninput="cvData.certyfikatyList[${i}].wydawca=this.value;updateCVPreview()" value="${c.wydawca||''}" placeholder="np. Google, Amazon"></div>
            <div class="cvf-group"><label>Rok ukończenia</label><input class="cvf-input" oninput="cvData.certyfikatyList[${i}].rok=this.value;updateCVPreview()" value="${c.rok||''}" placeholder="2024"></div>
          </div>
          <button class="cvf-remove-btn" onclick="removeCert(${i})">✕ Usuń</button>
        </div>`).join('')}
    </div>
    <button class="acc-add-more" style="margin-top:8px" onclick="addCert()">+ Dodaj certyfikat</button>`;

  if (sec === 'kursy') return `
    <div id="kursyList">
      ${(cvData.kursy||[]).map((k,i) => `
        <div class="cvf-struct-entry" data-ki="${i}">
          <div class="cvf-grid2" style="margin-bottom:4px">
            <div class="cvf-group cvf-full"><label>Nazwa kursu</label><input class="cvf-input" oninput="cvData.kursy[${i}].nazwa=this.value;updateCVPreview()" value="${k.nazwa||''}" placeholder="np. Kurs Python, Adobe Photoshop..."></div>
            <div class="cvf-group cvf-full"><label>Prowadzony przez</label><input class="cvf-input" oninput="cvData.kursy[${i}].prowadzacy=this.value;updateCVPreview()" value="${k.prowadzacy||''}" placeholder="np. Udemy, Coursera"></div>
            <div class="cvf-group"><label>Data rozpoczęcia</label><input class="cvf-input" oninput="cvData.kursy[${i}].od=this.value;updateCVPreview()" value="${k.od||''}" placeholder="01.2024"></div>
            <div class="cvf-group"><label>Data zakończenia</label><input class="cvf-input" id="kurs-do-${i}" oninput="cvData.kursy[${i}].do=this.value;updateCVPreview()" value="${k.do||''}" placeholder="06.2024" ${k.obecnie?'disabled':''}></div>
            <div class="cvf-group cvf-full" style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" id="kurs-obecnie-${i}" ${k.obecnie?'checked':''} onchange="cvData.kursy[${i}].obecnie=this.checked;cvData.kursy[${i}].do=this.checked?'':cvData.kursy[${i}].do;document.getElementById('kurs-do-${i}').disabled=this.checked;document.getElementById('kurs-do-${i}').value='';updateCVPreview()">
              <label for="kurs-obecnie-${i}" style="font-size:0.85rem;cursor:pointer">Obecnie się uczę</label>
            </div>
          </div>
          <button class="cvf-remove-btn" onclick="removeKurs(${i})">✕ Usuń</button>
        </div>`).join('')}
    </div>
    <button class="acc-add-more" style="margin-top:8px" onclick="addKurs()">+ Dodaj kurs</button>`;

  if (sec === 'staze') return `
    <div id="stazeList">
      ${(cvData.staze||[]).map((s,i) => `
        <div class="cvf-struct-entry" data-si="${i}">
          <div class="cvf-grid2" style="margin-bottom:4px">
            <div class="cvf-group cvf-full"><label>Gdzie (firma / organizacja)</label><input class="cvf-input" oninput="cvData.staze[${i}].firma=this.value;updateCVPreview()" value="${s.firma||''}" placeholder="np. Google, Startup XYZ"></div>
            <div class="cvf-group"><label>Data rozpoczęcia</label><input class="cvf-input" oninput="cvData.staze[${i}].od=this.value;updateCVPreview()" value="${s.od||''}" placeholder="01.2024"></div>
            <div class="cvf-group"><label>Data zakończenia</label><input class="cvf-input" id="staz-do-${i}" oninput="cvData.staze[${i}].do=this.value;updateCVPreview()" value="${s.do||''}" placeholder="06.2024" ${s.obecnie?'disabled':''}></div>
            <div class="cvf-group cvf-full" style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" id="staz-obecnie-${i}" ${s.obecnie?'checked':''} onchange="cvData.staze[${i}].obecnie=this.checked;cvData.staze[${i}].do=this.checked?'':cvData.staze[${i}].do;document.getElementById('staz-do-${i}').disabled=this.checked;document.getElementById('staz-do-${i}').value='';updateCVPreview()">
              <label for="staz-obecnie-${i}" style="font-size:0.85rem;cursor:pointer">Trwa obecnie</label>
            </div>
          </div>
          <button class="cvf-remove-btn" onclick="removeStaz(${i})">✕ Usuń</button>
        </div>`).join('')}
    </div>
    <button class="acc-add-more" style="margin-top:8px" onclick="addStaz()">+ Dodaj staż</button>`;

  if (sec === 'zainteresowania') return `
    <input class="cvf-input" id="interestsInput" oninput="cvData.zainteresowania=this.value;updateCVPreview();updateInterestChips()" value="${cvData.zainteresowania}" placeholder="fotografia, sport, muzyka...">
    <p class="acc-hint">${L('interestsHint')}</p>
    <div class="cvf-suggestions" id="interestSuggestions"></div>`;

  return '';
}

// ── AUTOCOMPLETE UCZELNIE ──────────────────────────────────
function showUniSuggest(i, val) {
  const list = document.getElementById('uni-list-' + i);
  if (!list) return;
  const q = (val || '').toLowerCase();
  const matches = q.length === 0
    ? POLISH_UNIVERSITIES.slice(0, 7)
    : POLISH_UNIVERSITIES.filter(u => u.toLowerCase().includes(q)).slice(0, 7);
  if (!matches.length) { list.classList.remove('show'); return; }
  list.innerHTML = matches.map(u => `<div class="cvf-autocomplete-item" onmousedown="event.preventDefault();pickUni(${i},'${u.replace(/'/g,"\\'")}')">  ${u}</div>`).join('');
  list.classList.add('show');
}
function pickUni(i, val) {
  cvData.wyksztalcenie[i].szkola = val;
  const input = document.getElementById('szkola-' + i);
  if (input) input.value = val;
  const list = document.getElementById('uni-list-' + i);
  if (list) list.classList.remove('show');
  updateCVPreview();
}

// ── AUTOCOMPLETE KIERUNKI ──────────────────────────────────
function showKierunekSuggest(i, val) {
  const list = document.getElementById('kierunek-list-' + i);
  if (!list) return;
  const q = (val || '').toLowerCase();
  const matches = q.length === 0
    ? KIERUNKI_SUGGESTIONS.slice(0, 7)
    : KIERUNKI_SUGGESTIONS.filter(k => k.toLowerCase().includes(q)).slice(0, 7);
  if (!matches.length) { list.classList.remove('show'); return; }
  list.innerHTML = matches.map(k => `<div class="cvf-autocomplete-item" onmousedown="event.preventDefault();pickKierunek(${i},'${k.replace(/'/g,"\\'")}')">${k}</div>`).join('');
  list.classList.add('show');
}
function pickKierunek(i, val) {
  cvData.wyksztalcenie[i].kierunek = val;
  const input = document.getElementById('kierunek-' + i);
  if (input) input.value = val;
  const list = document.getElementById('kierunek-list-' + i);
  if (list) list.classList.remove('show');
  updateCVPreview();
}

document.addEventListener('mousedown', e => {
  document.querySelectorAll('.cvf-autocomplete-list').forEach(l => {
    if (!l.contains(e.target)) l.classList.remove('show');
  });
});

// ── INTERESTS CHIPS ───────────────────────────────────────
function updateInterestChips() {
  const container = document.getElementById('interestSuggestions');
  if (!container) return;
  const current = (cvData.zainteresowania || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  container.innerHTML = getInterestSuggestions().map(s => {
    const used = current.includes(s.toLowerCase());
    return `<span class="cvf-chip${used?' used':''}" onclick="addInterestChip('${s.replace(/'/g,"\\'")}')">${s}</span>`;
  }).join('');
}
function addInterestChip(interest) {
  const current = cvData.zainteresowania.split(',').map(s => s.trim()).filter(Boolean);
  if (current.map(s=>s.toLowerCase()).includes(interest.toLowerCase())) return;
  current.push(interest);
  cvData.zainteresowania = current.join(', ');
  const input = document.getElementById('interestsInput');
  if (input) input.value = cvData.zainteresowania;
  updateCVPreview();
  updateInterestChips();
}

// ── CERTYFIKATY / KURSY / STAŻE ───────────────────────────
function addCert() {
  if (!cvData.certyfikatyList) cvData.certyfikatyList = [];
  cvData.certyfikatyList.push({ nazwa:'', wydawca:'', rok:'' });
  cvOpenSections.add('certyfikaty');
  renderCVForm(); updateCVPreview();
}
function removeCert(i) {
  cvData.certyfikatyList.splice(i, 1);
  cvOpenSections.add('certyfikaty');
  renderCVForm(); updateCVPreview();
}
function addKurs() {
  if (!cvData.kursy) cvData.kursy = [];
  cvData.kursy.push({ nazwa:'', prowadzacy:'', od:'', do:'', obecnie:false });
  cvOpenSections.add('kursy');
  renderCVForm(); updateCVPreview();
}
function removeKurs(i) {
  cvData.kursy.splice(i, 1);
  cvOpenSections.add('kursy');
  renderCVForm(); updateCVPreview();
}
function addStaz() {
  if (!cvData.staze) cvData.staze = [];
  cvData.staze.push({ firma:'', od:'', do:'', obecnie:false });
  cvOpenSections.add('staze');
  renderCVForm(); updateCVPreview();
}
function removeStaz(i) {
  cvData.staze.splice(i, 1);
  cvOpenSections.add('staze');
  renderCVForm(); updateCVPreview();
}

// ── SEKCJE NIESTANDARDOWE ─────────────────────────────────
function buildCustomSectionHTML(sec) {
  const isOpen = cvOpenSections.has('custom-' + sec.id);
  const showSidebarToggle = SIDEBAR_TPLS.has(cvTemplate);
  const key = 'custom-' + sec.id;
  const inSidebar = cvSidebarSections.has(key);
  const sidebarBtn = showSidebarToggle ? `
    <button onclick="toggleCascadeSidebar('${key}',event)" title="${inSidebar?'Przesuń do kolumny głównej':'Przesuń do panelu bocznego'}" style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:20px;border:1px solid ${inSidebar?'#2563eb':'#d1d5db'};background:${inSidebar?'#eff6ff':'#f9fafb'};color:${inSidebar?'#2563eb':'#6b7280'};font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">
      ${inSidebar
        ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 19l7-7-7-7"/></svg> Główna`
        : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg> Boczny`}
    </button>` : '';
  return `
    <div class="acc-item${isOpen ? ' open' : ''}" data-section="custom-${sec.id}" draggable="true">
      <div class="acc-row" onclick="toggleAccSection('custom-${sec.id}')">
        <span class="acc-drag" onclick="event.stopPropagation()" title="Przeciągnij">⠿</span>
        <div class="acc-info">
          <input class="acc-custom-name" value="${sec.title}" placeholder="${L('sectionName')}"
            onclick="event.stopPropagation()"
            oninput="updateCustomSection('${sec.id}','title',this.value);updateCVPreview()">
        </div>
        ${sidebarBtn}
        <button class="acc-btn" tabindex="-1" aria-label="Rozwiń lub zwiń sekcję">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="acc-plus-v"/>
            <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="acc-body">
        <textarea class="cvf-input" rows="3" placeholder="${L('sectionContent')}"
          oninput="updateCustomSection('${sec.id}','content',this.value);updateCVPreview()">${sec.content}</textarea>
        <button class="cvf-remove-btn" style="margin-top:8px" onclick="removeCustomSection('${sec.id}')">✕ Usuń sekcję</button>
      </div>
    </div>`;
}
function addCustomSection() {
  const id = 'cs_' + Date.now();
  cvCustomSections.push({ id, title: 'Nowa sekcja', content: '' });
  cvOpenSections.add('custom-' + id); // auto-open new section
  renderCVForm();
  updateCVPreview();
  // Scroll new section into view
  const content = document.getElementById('cvwContent');
  if (content) setTimeout(() => { content.scrollTop = content.scrollHeight; }, 0);
}
function removeCustomSection(id) {
  cvCustomSections = cvCustomSections.filter(s => s.id !== id);
  renderCVForm();
  updateCVPreview();
}
function updateCustomSection(id, field, val) {
  const sec = cvCustomSections.find(s => s.id === id);
  if (sec) sec[field] = val;
}
function updateSkillChips() {
  const container = document.getElementById('skillSuggestions');
  if (!container) return;
  const current = (cvData.umiejetnosci || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  container.innerHTML = getSkillSuggestions().map(s => {
    const used = current.includes(s.toLowerCase());
    return `<span class="cvf-chip${used?' used':''}" onclick="addSkillChip('${s.replace(/'/g,"\\'")}')">${s}</span>`;
  }).join('');
}
function addSkillChip(skill) {
  const current = cvData.umiejetnosci.split(',').map(s => s.trim()).filter(Boolean);
  if (current.map(s=>s.toLowerCase()).includes(skill.toLowerCase())) return;
  current.push(skill);
  cvData.umiejetnosci = current.join(', ');
  const input = document.getElementById('skillsInput');
  if (input) input.value = cvData.umiejetnosci;
  updateCVPreview();
  updateSkillChips();
}

// ── DRAG & DROP SEKCJI ─────────────────────────────────────
let dragSrc = null;
function initDragDrop() {
  const blocks = document.querySelectorAll('.acc-item');
  blocks.forEach(block => {
    block.addEventListener('dragstart', e => {
      dragSrc = block;
      block.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    block.addEventListener('dragend', () => {
      block.classList.remove('dragging');
      document.querySelectorAll('.acc-item').forEach(b => b.classList.remove('drag-over'));
    });
    block.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.acc-item').forEach(b => b.classList.remove('drag-over'));
      if (block !== dragSrc) block.classList.add('drag-over');
    });
    block.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === block) return;
      const fromSec = dragSrc.dataset.section;
      const toSec = block.dataset.section;
      // Handle standard sections
      const fromIdx = cvSectionOrder.indexOf(fromSec);
      const toIdx = cvSectionOrder.indexOf(toSec);
      if (fromIdx !== -1 && toIdx !== -1) {
        cvSectionOrder.splice(fromIdx, 1);
        cvSectionOrder.splice(toIdx, 0, fromSec);
      }
      // Handle custom sections
      const fromCIdx = cvCustomSections.findIndex(s => 'custom-'+s.id === fromSec);
      const toCIdx = cvCustomSections.findIndex(s => 'custom-'+s.id === toSec);
      if (fromCIdx !== -1 && toCIdx !== -1) {
        const [moved] = cvCustomSections.splice(fromCIdx, 1);
        cvCustomSections.splice(toCIdx, 0, moved);
      }
      renderCVForm();
      updateCVPreview();
      updateSkillChips();
      updateInterestChips();
    });
  });
  // Init chips after render
  updateSkillChips();
  updateInterestChips();
}
function loadPhoto(input) {
  const file = input.files[0];
  if (file) loadPhotoFile(file);
}
function loadPhotoFile(file) {
  if (!['image/jpeg','image/png'].includes(file.type)) {
    alert('Akceptowane formaty: JPG, PNG'); return;
  }
  if (file.size > 2 * 1024 * 1024) {
    alert('Plik jest za duży. Maksymalny rozmiar to 2 MB'); return;
  }
  const reader = new FileReader();
  reader.onload = e => openCropModal(e.target.result);
  reader.readAsDataURL(file);
}
function cvPhotoDragOver(e) {
  e.preventDefault(); e.stopPropagation();
  document.getElementById('cvPhotoDrop')?.classList.add('drag-over');
}
function cvPhotoDragLeave(e) {
  e.stopPropagation();
  document.getElementById('cvPhotoDrop')?.classList.remove('drag-over');
}
function cvPhotoDropHandler(e) {
  e.preventDefault(); e.stopPropagation();
  document.getElementById('cvPhotoDrop')?.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadPhotoFile(file);
}

/* ── PHOTO CROP ── */
const CROP_SIZE = 260;
let _cropImg = null;
let _cropScale = 1.0;   // multiplier on top of base cover-scale
let _cropOffX = 0;
let _cropOffY = 0;
let _cropDragging = false;
let _cropDragStartX = 0, _cropDragStartY = 0;
let _cropDragBaseX = 0, _cropDragBaseY = 0;

function openCropModal(src) {
  _cropOffX = 0; _cropOffY = 0; _cropScale = 1.0;
  const slider = document.getElementById('cvCropSlider');
  const pct = document.getElementById('cvCropPct');
  slider.value = 100; pct.textContent = '100%';
  // Square crop for biznes (photo is a square in template), circle for all others
  const wrap = document.getElementById('cvCropCircleWrap');
  if (wrap) wrap.style.borderRadius = (cvTemplate === 'biznes') ? '6px' : '50%';
  document.getElementById('cvCropOverlay').classList.add('open');
  _cropImg = new Image();
  _cropImg.onload = () => { clampCropOffset(); renderCropCanvas(); };
  _cropImg.src = src;
  // global mouse/touch up handlers
  document.addEventListener('mousemove', cropMouseMove);
  document.addEventListener('mouseup', cropMouseUp);
}

function closeCropModal() {
  document.getElementById('cvCropOverlay').classList.remove('open');
  document.removeEventListener('mousemove', cropMouseMove);
  document.removeEventListener('mouseup', cropMouseUp);
  _cropImg = null;
  // reset file input so same file can be re-selected
  const inp = document.getElementById('cvPhotoInput');
  if (inp) inp.value = '';
}

function _cropBaseScale() {
  if (!_cropImg) return 1;
  return Math.max(CROP_SIZE / _cropImg.naturalWidth, CROP_SIZE / _cropImg.naturalHeight);
}

function clampCropOffset() {
  if (!_cropImg) return;
  const s = _cropBaseScale() * _cropScale;
  const hw = (_cropImg.naturalWidth * s - CROP_SIZE) / 2;
  const hh = (_cropImg.naturalHeight * s - CROP_SIZE) / 2;
  _cropOffX = Math.max(-Math.max(hw, 0), Math.min(Math.max(hw, 0), _cropOffX));
  _cropOffY = Math.max(-Math.max(hh, 0), Math.min(Math.max(hh, 0), _cropOffY));
}

function renderCropCanvas() {
  const canvas = document.getElementById('cvCropCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
  if (!_cropImg) return;
  const s = _cropBaseScale() * _cropScale;
  const w = _cropImg.naturalWidth * s;
  const h = _cropImg.naturalHeight * s;
  const x = (CROP_SIZE - w) / 2 + _cropOffX;
  const y = (CROP_SIZE - h) / 2 + _cropOffY;
  ctx.drawImage(_cropImg, x, y, w, h);
}

function cropSliderChange(val) {
  _cropScale = val / 100;
  document.getElementById('cvCropPct').textContent = val + '%';
  clampCropOffset();
  renderCropCanvas();
}

function cropMouseDown(e) {
  _cropDragging = true;
  _cropDragStartX = e.clientX; _cropDragStartY = e.clientY;
  _cropDragBaseX = _cropOffX; _cropDragBaseY = _cropOffY;
  e.preventDefault();
}
function cropMouseMove(e) {
  if (!_cropDragging) return;
  _cropOffX = _cropDragBaseX + (e.clientX - _cropDragStartX);
  _cropOffY = _cropDragBaseY + (e.clientY - _cropDragStartY);
  clampCropOffset();
  renderCropCanvas();
}
function cropMouseUp() { _cropDragging = false; }

function cropTouchStart(e) {
  if (e.touches.length !== 1) return;
  _cropDragging = true;
  _cropDragStartX = e.touches[0].clientX; _cropDragStartY = e.touches[0].clientY;
  _cropDragBaseX = _cropOffX; _cropDragBaseY = _cropOffY;
  e.preventDefault();
}
function cropTouchMove(e) {
  if (!_cropDragging || e.touches.length !== 1) return;
  _cropOffX = _cropDragBaseX + (e.touches[0].clientX - _cropDragStartX);
  _cropOffY = _cropDragBaseY + (e.touches[0].clientY - _cropDragStartY);
  clampCropOffset();
  renderCropCanvas();
}
function cropTouchEnd() { _cropDragging = false; }

function cropConfirm() {
  const canvas = document.getElementById('cvCropCanvas');
  cvData.zdjecie = canvas.toDataURL('image/png');
  closeCropModal();
  renderCVForm(); updateCVPreview();
}
function cropCancel() { closeCropModal(); }

function addCVExp() {
  cvData.doswiadczenie.push({ firma:'', stanowisko:'', od:'', do:'', opis:'' });
  renderCVForm();
}
function removeCVExp(i) {
  cvData.doswiadczenie.splice(i,1);
  renderCVForm(); updateCVPreview();
}
function addCVEdu() {
  cvData.wyksztalcenie.push({ szkola:'', kierunek:'', od:'', do:'', opis:'' });
  renderCVForm();
}
function removeCVEdu(i) {
  cvData.wyksztalcenie.splice(i,1);
  renderCVForm(); updateCVPreview();
}
function addCVLang() {
  cvData.jezyki.push({ jezyk:'', poziom:'B2' });
  renderCVForm();
}

function removeCVLang(i) {
  if (cvData.jezyki.length <= 1) return;
  cvData.jezyki.splice(i, 1);
  const item = document.querySelector('.acc-item[data-section="jezyki"]');
  if (item) { const body = item.querySelector('.acc-body'); if (body) body.innerHTML = buildSectionBodyHTML('jezyki'); }
  updateCVPreview();
}

function toggleLangPicker() {
  var picker = document.getElementById('langPicker');
  var arrow = document.getElementById('addLangArrow');
  if (!picker) return;
  var open = picker.style.display !== 'none';
  picker.style.display = open ? 'none' : 'block';
  if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
}
function addLangFromPicker(lang) {
  var picker = document.getElementById('langPicker');
  var arrow = document.getElementById('addLangArrow');
  if (picker) picker.style.display = 'none';
  if (arrow) arrow.style.transform = '';
  var existing = cvData.jezyki.find(function(l){ return l.jezyk.toLowerCase() === lang.toLowerCase(); });
  if (!existing) {
    var empty = cvData.jezyki.find(function(l){ return !l.jezyk; });
    if (empty) { empty.jezyk = lang; }
    else { cvData.jezyki.push({ jezyk: lang, poziom: 'B2' }); }
  }
  var item = document.querySelector('.acc-item[data-section="jezyki"]');
  if (item) { var body = item.querySelector('.acc-body'); if (body) body.innerHTML = buildSectionBodyHTML('jezyki'); }
  updateCVPreview();
}
function addLangFromDd(lang) { addLangFromPicker(lang); }

async function useAISummary() {
  const text = cvData.podsumowanie;
  if (!text || text.trim().length < 10) {
    alert('Najpierw wpisz kilka zdań w polu Profil osobisty.');
    return;
  }
  const btn = document.getElementById('aiSummaryBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generuję...'; }
  try {
    var langNames = {pl:'polskim',en:'English',de:'Deutsch',uk:'українською',es:'español',cs:'češtině',nl:'Nederlands'};
    var promptLang = langNames[cvCurrentLang || 'pl'] || 'polskim';
    var aiPrompt = 'Przepisz poniższy profil osobisty z CV tak, żeby brzmiał profesjonalnie i naturalnie. WAŻNE: zachowaj DOKŁADNIE te same informacje co w oryginale — nie dodawaj nowych faktów, nie usuwaj żadnych informacji, nie zmieniaj stanowisk ani doświadczeń. Tylko popraw styl, płynność i profesjonalizm. Odpowiedz w języku ' + promptLang + '. Zwróć TYLKO gotowy tekst, bez komentarzy:\n\n' + text;
    var _tok1597 = typeof window._fbToken === 'function' ? await window._fbToken() : (window._fbToken || '');
    var res = await fetch('/api/generate-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _tok1597 },
      body: JSON.stringify({ prompt: aiPrompt, type: 'cv' })
    });
    if (res.status === 429) { _showFreeAiLimitModal('cv'); return; }
    var data = await res.json();
    var suggestion = data.text || data.result || data.content || '';
    if (suggestion) {
      document.getElementById('aiSuggestionText').textContent = suggestion;
      document.getElementById('aiSuggestionBox').style.display = 'block';
    } else {
      alert('Brak odpowiedzi od AI. Spróbuj ponownie.');
    }
  } catch(e) {
    alert('Błąd generowania. Spróbuj ponownie.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Użyj AI'; }
  }
}

function applyAISummary() {
  var suggestion = document.getElementById('aiSuggestionText').textContent;
  if (!suggestion) return;
  cvData.podsumowanie = suggestion;
  var ta = document.getElementById('summaryTextarea');
  if (ta) ta.value = suggestion;
  document.getElementById('aiSuggestionBox').style.display = 'none';
  updateCVPreview();
}

async function useAIDuties(i) {
  var e = cvData.doswiadczenie[i];
  var btn = document.getElementById('aiDutiesBtn-' + i);
  if (!e) return;
  var context = [
    e.firma && ('Firma: ' + e.firma),
    e.stanowisko && ('Stanowisko: ' + e.stanowisko),
    e.opis && ('Obowiązki (wpisane przez użytkownika): ' + e.opis)
  ].filter(Boolean).join('\n');
  if (!context.trim()) { alert('Wpisz najpierw firmę, stanowisko lub obowiązki.'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generuję...'; }
  try {
    var langNames = {pl:'polskim',en:'English',de:'Deutsch',uk:'українською',es:'español',cs:'češtině',nl:'Nederlands'};
    var promptLang = langNames[cvCurrentLang || 'pl'] || 'polskim';
    var prompt = 'Przepisz poniższy opis obowiązków z CV tak, żeby brzmiał profesjonalnie i naturalnie. WAŻNE: zachowaj DOKŁADNIE te same informacje — nie dodawaj nowych obowiązków, nie usuwaj żadnych. Bez punktowania, bez list. Tylko ciągły, profesjonalny tekst. Bez żadnych komentarzy ani wstępów. Odpowiedz w języku ' + promptLang + '. Zwróć TYLKO gotowy tekst:\n\n' + context;
    var _tok1642 = typeof window._fbToken === 'function' ? await window._fbToken() : (window._fbToken || '');
    var res = await fetch('/api/generate-free', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+_tok1642}, body:JSON.stringify({ prompt:prompt, type:'cv' }) });
    if (res.status === 429) { _showFreeAiLimitModal('cv'); return; }
    var data = await res.json();
    var suggestion = (data.text || '').trim();
    if (suggestion) {
      document.getElementById('aiDutiesText-' + i).textContent = suggestion;
      document.getElementById('aiDutiesBox-' + i).style.display = 'block';
    } else { alert('Brak odpowiedzi od AI.'); }
  } catch(err) { alert('Błąd generowania. Spróbuj ponownie.'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '✨ Użyj AI'; } }
}

function applyAIDuties(i) {
  var suggestion = document.getElementById('aiDutiesText-' + i).textContent;
  if (!suggestion) return;
  cvData.doswiadczenie[i].opis = suggestion;
  var ta = document.getElementById('dutiesTA-' + i);
  if (ta) ta.value = suggestion;
  document.getElementById('aiDutiesBox-' + i).style.display = 'none';
  updateCVPreview();
}

function _fixCVFullHeight(root) {
  if (!root) return;

  // Detect sidebar/horizontal-flex layouts BEFORE modifying root styles
  const rootStyleStr = root.getAttribute('style') || '';
  const isHorizFlex = rootStyleStr.includes('display:flex') && !rootStyleStr.includes('flex-direction:column');

  // Ensure full A4 page: height + overflow:hidden so background fills the entire page
  root.style.minHeight = '842px';
  root.style.maxHeight = '842px';
  root.style.height    = '842px';
  root.style.overflow  = 'hidden';

  if (isHorizFlex) {
    // Sidebar templates: force every direct child (sidebar + main) to fill the full height
    for (const child of root.children) {
      child.style.minHeight = '842px';
      child.style.overflow  = 'hidden';
      const cs = child.getAttribute('style') || '';
      if ((cs.includes('flex:1') || cs.includes('flex: 1')) && !cs.match(/width:\s*\d/)) {
        // Main column: make it a flex column so margin-top:auto (consent) pins to bottom
        child.style.display = 'flex';
        child.style.flexDirection = 'column';
        const last = child.lastElementChild;
        if (last) last.style.marginTop = 'auto';
      }
    }
  } else {
    // Standard vertical layouts
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    // Pin the last direct child (consent div) to the bottom
    const last = root.lastElementChild;
    if (last) last.style.marginTop = 'auto';
    // Give the main content area flex:1 so it expands to fill space
    const children = Array.from(root.children);
    if (children.length >= 2) {
      for (let i = 1; i < children.length - 1; i++) {
        const cs = children[i].getAttribute('style') || '';
        if (cs.includes('display:grid') || cs.includes('padding:') || cs.includes('flex:1')) {
          children[i].style.flex = '1';
          break;
        }
      }
    }
  }
}

// Rebalance biznes template: move overflow sections between sidebar and main
function _fixBiznesOverflow(root) {
  if (!root) return;
  const sidebar = root.querySelector('[data-biz-sidebar]');
  const main    = root.querySelector('[data-biz-main]');
  const extra   = root.querySelector('[data-biz-extra]');
  if (!sidebar || !main || !extra) return;

  const PAGE_H = 842;

  // Measure natural content height by cloning element outside flex constraints
  function naturalH(el) {
    const w = el.getBoundingClientRect().width || el.offsetWidth || 202;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;top:-9999px;left:-9999px;visibility:hidden;width:' + w + 'px;pointer-events:none;overflow:visible;';
    const clone = el.cloneNode(true);
    clone.style.height = 'auto';
    clone.style.minHeight = '0';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    clone.style.width = '100%';
    clone.style.flex = 'none';
    wrap.appendChild(clone);
    document.body.appendChild(wrap);
    const h = clone.scrollHeight;
    document.body.removeChild(wrap);
    return h;
  }

  // Step 1: sidebar overflow → move last [data-biz-s] sections to main extra
  const sideSections = Array.from(sidebar.querySelectorAll('[data-biz-s]'));
  for (let i = sideSections.length - 1; i >= 0; i--) {
    if (naturalH(sidebar) <= PAGE_H) break;
    extra.appendChild(sideSections[i]);
  }

  // Step 2: main overflow → move last [data-biz-m] sections to sidebar bottom
  const mainSections = Array.from(main.querySelectorAll('[data-biz-m]'));
  for (let i = mainSections.length - 1; i >= 0; i--) {
    if (naturalH(main) <= PAGE_H) break;
    sidebar.appendChild(mainSections[i]);
  }
}

function updateCVPreview() {
  const el = document.getElementById('cvPreviewInner');
  if (!el) return;
  try {
    el.innerHTML = buildCVHTML(cvTemplate);
    _fixCVFullHeight(el.firstElementChild);
  } catch(e) {
    console.error('buildCVHTML error:', e);
    el.innerHTML = '<div style="padding:20px;color:red;font-size:12px">Błąd szablonu: ' + e.message + '</div>';
  }
  // Apply template primary color to form UI
  const tplDef = CV_TEMPLATES.find(t => t.id === cvTemplate);
  const tplC1 = (cvCustomColor && cvCustomColor.c1) ? cvCustomColor.c1 : (tplDef ? tplDef.color1 : '#111111');
  document.documentElement.style.setProperty('--tpl-c1', tplC1);
  if (typeof triggerDraftSave === 'function') triggerDraftSave();
  if (typeof applyCvZoom === 'function') applyCvZoom();
  renderQuickColorPicker();
}

// buildCVHTML → cv-templates.js

function confirmAndDownload() {
  downloadCV();
}

// ---- TEMPLATE DRAWER ----
function openTplDrawer() {
  const overlay = document.getElementById('cvTplOverlay');
  overlay.classList.add('open');
  renderTplGrid();
}
function closeTplDrawer() {
  document.getElementById('cvTplOverlay').classList.remove('open');
}
// Color themes
const COLOR_THEMES = [
  { name:'Zieleń (domyślny)', c1:'#1a3a2e', c2:'#2d6b52' },
  { name:'Granat',   c1:'#1a2744', c2:'#2c4a8a' },
  { name:'Czerń',    c1:'#111111', c2:'#444444' },
  { name:'Czerwień', c1:'#c0392b', c2:'#e74c3c' },
  { name:'Morski',   c1:'#0f766e', c2:'#14b8a6' },
  { name:'Ocean',    c1:'#1e40af', c2:'#3b82f6' },
  { name:'Fiolet',   c1:'#6b21a8', c2:'#a855f7' },
  { name:'Róż',      c1:'#9d174d', c2:'#ec4899' },
  { name:'Koralik',  c1:'#c2410c', c2:'#fb923c' },
  { name:'Szary',    c1:'#334155', c2:'#64748b' },
];
let cvCustomColor = null; // null = use template default

// Wczytaj CV do edycji jeśli przyszliśmy z moje-dokumenty.html
(function() {
  var saved = sessionStorage.getItem('dokumo_editCvData');
  if (!saved) return;
  sessionStorage.removeItem('dokumo_editCvData');
  try {
    var loaded = JSON.parse(saved);
    // Jeśli użytkownik wybrał szablon przez picker (?template=…), nie nadpisuj go
    var urlTpl = new URLSearchParams(window.location.search).get('template');
    if (loaded.__template && !urlTpl) cvTemplate = loaded.__template;
    if (loaded.__color) cvCustomColor = loaded.__color;
    delete loaded.__template;
    delete loaded.__color;
    Object.assign(cvData, loaded);
    window._cvEditLoaded = true; // nie nadpisuj wersją roboczą
  } catch(e) {}
})();

function renderQuickColorPicker() {
  const el = document.getElementById('cvQuickColors');
  if (!el) return;
  const currentTpl = CV_TEMPLATES.find(t => t.id === cvTemplate);
  const defaultC1 = currentTpl ? currentTpl.color1 : '#1a3a2e';
  el.innerHTML = COLOR_THEMES.map(theme => {
    const isActive = cvCustomColor ? cvCustomColor.c1 === theme.c1 : theme.c1 === defaultC1;
    return `<button title="${theme.name}" onclick="setColorTheme('${theme.c1}','${theme.c2}')"
      style="width:20px;height:20px;border-radius:50%;background:${theme.c1};
      border:${isActive ? '2.5px solid #fff' : '2px solid transparent'};
      box-shadow:${isActive ? '0 0 0 2px ' + theme.c1 + ',0 1px 4px rgba(0,0,0,0.35)' : '0 1px 3px rgba(0,0,0,0.2)'};
      cursor:pointer;flex-shrink:0;transition:all 0.15s"></button>`;
  }).join('') +
  `<button title="Domyślny kolor szablonu" onclick="resetColorTheme()"
    style="width:20px;height:20px;border-radius:50%;background:transparent;
    border:2px dashed ${cvCustomColor ? '#bbb' : '#444'};cursor:pointer;
    display:flex;align-items:center;justify-content:center;font-size:11px;
    color:${cvCustomColor ? '#bbb' : '#444'};flex-shrink:0;transition:all 0.15s;line-height:1">↺</button>`;
}

function renderColorPicker() {
  const el = document.getElementById('colorThemePicker');
  if (!el) return;
  const currentTpl = CV_TEMPLATES.find(t => t.id === cvTemplate);
  const defaultC1 = currentTpl ? currentTpl.color1 : '#1a3a2e';
  el.innerHTML = COLOR_THEMES.map(theme => {
    const isActive = cvCustomColor
      ? cvCustomColor.c1 === theme.c1
      : theme.c1 === defaultC1;
    return `<button title="${theme.name}" onclick="setColorTheme('${theme.c1}','${theme.c2}')"
      style="width:28px;height:28px;border-radius:50%;background:${theme.c1};border:${isActive?'3px solid #fff':'2px solid transparent'};
      box-shadow:${isActive?'0 0 0 2px '+theme.c1:'0 1px 4px rgba(0,0,0,0.2)'};
      cursor:pointer;transition:all 0.15s;flex-shrink:0"></button>`;
  }).join('');
  // Also add "default" reset option
  const hasCustom = !!cvCustomColor;
  el.innerHTML += `<button title="Domyślny kolor szablonu" onclick="resetColorTheme()"
    style="width:28px;height:28px;border-radius:50%;background:transparent;border:2px dashed #ccc;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:#aaa;${!hasCustom?'border-color:#666;color:#333':''}"
    >↺</button>`;
}

function setColorTheme(c1, c2) {
  cvCustomColor = { c1, c2 };
  updateCVPreview();
  renderColorPicker();
  renderTplGrid();
  renderQuickColorPicker();
  document.getElementById('tplDot').style.background = c1;
}

function resetColorTheme() {
  cvCustomColor = null;
  const t = CV_TEMPLATES.find(x => x.id === cvTemplate);
  if (t) document.getElementById('tplDot').style.background = t.color1;
  updateCVPreview();
  renderColorPicker();
  renderTplGrid();
  renderQuickColorPicker();
}

function getTplPreviewHTML(t) {
  const savedColor = cvCustomColor;
  const savedImie = cvData.imie, savedNazwisko = cvData.nazwisko, savedStan = cvData.stanowisko;
  const savedEmail = cvData.email, savedTel = cvData.tel, savedAdres = cvData.adres;
  const savedPods = cvData.podsumowanie, savedUm = cvData.umiejetnosci;
  const savedDosw = cvData.doswiadczenie, savedWyksztalcenie = cvData.wyksztalcenie, savedJezyki = cvData.jezyki;
  cvCustomColor = null;
  // Wypełnij przykładowymi danymi jeśli CV jest puste
  if (!cvData.imie && !cvData.nazwisko) {
    cvData.imie = 'Anna'; cvData.nazwisko = 'Kowalska';
    cvData.stanowisko = 'Marketing Manager';
    cvData.email = 'anna@email.pl'; cvData.tel = '+48 123 456 789'; cvData.adres = 'Warszawa';
    cvData.podsumowanie = 'Doświadczona specjalistka ds. marketingu z 5-letnim stażem w e-commerce. Zarządzam kampaniami reklamowymi i analityką.';
    cvData.umiejetnosci = 'Google Analytics, Facebook Ads, Excel, SEO, Copywriting';
    cvData.doswiadczenie = [
      {firma:'Sklep Online ABC', stanowisko:'Marketing Specialist', od:'01.2021', do:'Teraz', opis:'Zarządzanie kampaniami Google Ads i Meta. Wzrost konwersji o 35%.'},
      {firma:'Agencja XYZ', stanowisko:'Junior Marketer', od:'06.2018', do:'12.2020', opis:'Tworzenie treści i obsługa social media.'}
    ];
    cvData.wyksztalcenie = [{szkola:'Uniwersytet Warszawski', kierunek:'Zarządzanie i Marketing', od:'2014', do:'2018'}];
    cvData.jezyki = [{jezyk:'Angielski', poziom:'C1'}, {jezyk:'Niemiecki', poziom:'B1'}];
  }
  const html = buildCVHTML(t.id);
  // Przywróć oryginalne dane
  cvData.imie = savedImie; cvData.nazwisko = savedNazwisko; cvData.stanowisko = savedStan;
  cvData.email = savedEmail; cvData.tel = savedTel; cvData.adres = savedAdres;
  cvData.podsumowanie = savedPods; cvData.umiejetnosci = savedUm;
  cvData.doswiadczenie = savedDosw; cvData.wyksztalcenie = savedWyksztalcenie; cvData.jezyki = savedJezyki;
  cvCustomColor = savedColor;
  return `<div class="cv-tpl-thumb-inner">${html}</div>`;
}


function renderTplGrid() {
  const grid = document.getElementById('cvTplGrid');
  renderColorPicker();

  const groups = [
    { label: 'Premium',      ids: ['nova', 'maroon', 'biznes', 'nordic', 'cascade', 'metro'] },
    { label: 'Nowe 2026',    ids: ['dynamic', 'executive', 'athens', 'matrix', 'prism', 'linen'] },
    { label: 'Klasyczne',    ids: ['oxford', 'sidebar', 'timeline', 'bold', 'midnight'] },
    { label: 'Nowoczesne',   ids: ['teal', 'ocean'] },
    { label: 'Kreatywne',    ids: ['creative', 'coral', 'rose'] },
    { label: 'Wyraziste',    ids: ['shield'] },
  ];

  let html = '';
  groups.forEach(group => {
    const cards = CV_TEMPLATES.filter(t => group.ids.includes(t.id));
    if (!cards.length) return;
    html += `<div class="cv-tpl-section-label">${group.label}</div>`;
    html += cards.map(t => `
      <div class="cv-tpl-card${cvTemplate===t.id?' active':''}" data-tpl="${t.id}">
        <div class="cv-tpl-thumb">${getTplPreviewHTML(t)}</div>
        <div class="cv-tpl-name">${t.name}</div>
      </div>
    `).join('');
  });
  grid.innerHTML = html;

  // Use event delegation - click anywhere on grid picks the card
  grid.onclick = function(e) {
    const card = e.target.closest('[data-tpl]');
    if (card) pickTemplate(card.dataset.tpl);
  };
}
function pickTemplate(id) {
  cvTemplate = id;
  const t = CV_TEMPLATES.find(x => x.id === id);
  document.getElementById('tplDot').style.background = t.color1;
  updateCVPreview();
  closeTplDrawer();
}

// ---- INIT ----

// Check if coming from translate CV flow
(function() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('from') === 'translate') {
    try {
      const imported = sessionStorage.getItem('dokumo_cv_import');
      if (imported) {
        const d = JSON.parse(imported);
        sessionStorage.removeItem('dokumo_cv_import');
        Object.assign(cvData, {
          imie: d.imie || '',
          nazwisko: d.nazwisko || '',
          stanowisko: d.stanowisko || '',
          email: d.email || '',
          tel: d.tel || '',
          adres: d.adres || '',
          linkedin: d.linkedin || '',
          www: d.www || '',
          podsumowanie: d.podsumowanie || '',
          umiejetnosci: d.umiejetnosci || '',
          zainteresowania: d.zainteresowania || '',
        });
        if (Array.isArray(d.doswiadczenie) && d.doswiadczenie.length) cvData.doswiadczenie = d.doswiadczenie;
        if (Array.isArray(d.wyksztalcenie) && d.wyksztalcenie.length) cvData.wyksztalcenie = d.wyksztalcenie;
        if (Array.isArray(d.jezyki) && d.jezyki.length) cvData.jezyki = d.jezyki;
      }
    } catch(e) {}
  }
})();

(window.requestIdleCallback || function(cb){setTimeout(cb,0);})(function(){renderCVForm();updateCVPreview();});


async function downloadCV() {
  // Wymagane logowanie — bez konta nie można pobrać
  const _user = (() => { try { return JSON.parse(localStorage.getItem('dokumo_user')); } catch(e) { return null; } })();
  if (!_user) { window.location.href = 'konto.html'; return; }

  // Sprawdź plan — jeśli ma subskrypcję, sprawdź czy pasuje
  const _sub = (() => { try { return JSON.parse(localStorage.getItem('dokumo_sub')); } catch(e) { return null; } })();
  const _active = _sub && _sub.expiresAt && new Date(_sub.expiresAt) > new Date();
  const _validPlans = ['kariera','biznes','promax','start'];
  if (_active && !_validPlans.includes(_sub.plan)) {
    if (window.showPlanUpgradeModal) window.showPlanUpgradeModal(_sub.plan, 'kariera');
    return;
  }
  // Brak subskrypcji ale zalogowany → serwer sprawdzi darmowy slot (1× per konto)

  const fullName = [cvData.imie, cvData.nazwisko].filter(Boolean).join(' ') || 'CV';
  const safeName = 'CV_' + fullName.replace(/\s+/g, '_');
  const filename = safeName + '.pdf';
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // iOS blokuje window.open po async — otwieramy PRZED fetchem
  const iosWin = isIOS ? window.open('', '_blank') : null;

  const overlay = document.getElementById('pdfLoadingOverlay');
  if (overlay) overlay.style.display = 'flex';

  const btn = document.getElementById('tabPdf') || document.getElementById('cvNavDlBtn');
  const origText = btn ? btn.innerHTML : '';
  if (btn) btn.disabled = true;

  saveCVToMyDocs(fullName);

  const el = document.getElementById('cvPreviewInner');
  // Ensure biznes rebalancing is applied before reading innerHTML for PDF
  if (cvTemplate === 'biznes' && el && el.firstElementChild) _fixBiznesOverflow(el.firstElementChild);
  if (!el) {
    if (overlay) overlay.style.display = 'none';
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
    if (iosWin) iosWin.close();
    return;
  }

  try {
    for (let i = 0; i < 30 && !window._fbReady; i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    const token = typeof window._fbToken === 'function' ? await window._fbToken() : window._fbToken;
    if (!token) throw new Error('Brak autoryzacji – zaloguj się');

    const resp = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        html: el.innerHTML,
        filename: safeName,
        isCv: true,
        cvDocName: 'CV – ' + fullName,
        cvDataJson: JSON.stringify(Object.assign({}, cvData, { __template: cvTemplate, __color: cvCustomColor || null, __customSections: cvCustomSections || [], __sidebarSections: Array.from(cvSidebarSections) }))
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 403 && err.error === 'cv_free_used') {
        if (overlay) overlay.style.display = 'none';
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        if (iosWin) iosWin.close();
        // Modal — darmowe pobranie CV już wykorzystane
        var _ov = document.createElement('div');
        _ov.id = 'pgOverlay';
        _ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
        _ov.innerHTML = '<div style="background:#fff;border-radius:18px;padding:2.2rem 2rem;max-width:420px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,.25)">' +
          '<div style="font-size:3rem;margin-bottom:.75rem">📄</div>' +
          '<h2 style="font-size:1.2rem;font-weight:700;color:#1a1a2e;margin:0 0 .5rem">Darmowe pobranie już wykorzystane</h2>' +
          '<p style="color:#555;font-size:.93rem;line-height:1.5;margin:0 0 1.5rem">Każde konto może pobrać CV <strong>raz za darmo</strong>.<br>Kup pakiet, aby pobierać bez limitu.</p>' +
          '<a href="subskrypcja.html" style="display:block;width:100%;padding:.85rem 1rem;background:linear-gradient(135deg,#6c63ff,#a78bfa);color:#fff;border-radius:10px;font-size:1rem;font-weight:600;text-decoration:none;margin-bottom:.75rem;box-sizing:border-box">Zobacz plany →</a>' +
          '<button onclick="this.closest(\'#pgOverlay\').remove()" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:.88rem">Zamknij</button>' +
          '</div>';
        document.body.appendChild(_ov);
        _ov.addEventListener('click', function(e){ if(e.target===_ov) _ov.remove(); });
        return;
      }
      throw new Error(err.error || 'Błąd serwera: ' + resp.status);
    }
    const blob = await resp.blob();

    if (isIOS && iosWin) {
      // iOS: blob URL nie działa w nowym oknie — używamy data URL (base64)
      const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      iosWin.location.href = dataUrl;
    } else {
      if (iosWin) iosWin.close();
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: filename }); } catch(e) { if (e.name !== 'AbortError') throw e; }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    }
  } catch(e) {
    if (iosWin) iosWin.close();
    alert('Błąd generowania PDF: ' + e.message);
  } finally {
    if (overlay) overlay.style.display = 'none';
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
  }
}

async function saveCVToMyDocs(fullName) {
  try {
    for (var i = 0; i < 30 && !window._fbReady; i++) {
      await new Promise(function(r) { setTimeout(r, 100); });
    }
    var token = typeof window._fbToken === 'function' ? await window._fbToken() : window._fbToken;
    if (!token) return;
    var cvPreviewEl = document.getElementById('cvPreviewInner');
    var cvText = cvPreviewEl ? '__CV_HTML__:' + cvPreviewEl.outerHTML : [
      fullName,
      cvData.stanowisko,
      cvData.email && 'Email: ' + cvData.email,
      cvData.tel && 'Tel: ' + cvData.tel,
    ].filter(Boolean).join('\n');
    await fetch('/api/save-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        docId: 'cv',
        docName: 'CV – ' + fullName,
        docCat: 'kariera',
        docIcon: '📋',
        docCatLabel: 'Kariera',
        text: cvText,
        cvDataJson: JSON.stringify(Object.assign({}, cvData, { __template: cvTemplate, __color: cvCustomColor || null, __customSections: cvCustomSections || [], __sidebarSections: Array.from(cvSidebarSections) }))
      })
    });
  } catch(e) {}
}

// Modal przy przekroczeniu darmowego limitu AI
function _showFreeAiLimitModal(type) {
  var existing = document.getElementById('_freeAiLimitOverlay');
  if (existing) existing.remove();
  var max = type === 'letter' ? 5 : 10;
  var overlay = document.createElement('div');
  overlay.id = '_freeAiLimitOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;animation:pgFade .2s ease';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:18px;padding:2.2rem 2rem;max-width:400px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,.25);">' +
      '<div style="font-size:2.5rem;margin-bottom:.75rem;">⚡</div>' +
      '<h2 style="font-size:1.15rem;font-weight:700;color:#111;margin:0 0 .5rem">Wymagana subskrypcja</h2>' +
      '<p style="color:#555;font-size:.9rem;line-height:1.55;margin:0 0 1.5rem">Kreator CV i funkcje AI wymagają <strong>aktywnej subskrypcji</strong>.<br>Kup plan i korzystaj bez limitu.</p>' +
      '<a href="subskrypcja.html" style="display:block;width:100%;padding:.85rem 1rem;background:linear-gradient(135deg,#6c63ff,#a78bfa);color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;text-decoration:none;margin-bottom:.75rem;box-sizing:border-box;">Zobacz plany →</a>' +
      '<button onclick="document.getElementById(\'_freeAiLimitOverlay\').remove()" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:.88rem;">Zamknij</button>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
