/* doc-peek.js — wspólny moduł podglądu przed paywallem + wznowienia po płatności.
   Wymaga globali generatora: wizVals, SYSTEM_PROMPT oraz FORMS+selDoc lub FORM,
   a także funkcji doGenerate() (do dokończenia dokumentu po opłaceniu).
   Zero zależności. Sam wstrzykuje style. */
(function () {
  // ── style ──
  var css = [
    '.dpk-ov{position:fixed;inset:0;background:rgba(20,20,28,.66);z-index:99998;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:30px 16px;animation:dpkF .2s ease}',
    '@keyframes dpkF{from{opacity:0}to{opacity:1}}',
    '@keyframes dpkspin{to{transform:rotate(360deg)}}',
    '.dpk-wrap{width:100%;max-width:660px;margin:auto 0}',
    ".dpk-paper{background:#fff;border-radius:14px 14px 0 0;padding:52px 56px 0;font-family:'Times New Roman',Georgia,serif;color:#1a1a1a;box-shadow:0 30px 80px rgba(0,0,0,.4);position:relative;overflow:hidden}",
    '@media(max-width:560px){.dpk-paper{padding:34px 22px 0}}',
    '.dpk-title{text-align:center;font-size:1.35rem;font-weight:700;letter-spacing:.03em;margin-bottom:6px}',
    '.dpk-sub{text-align:center;font-size:.9rem;color:#444;margin-bottom:30px}',
    '.dpk-sec{margin-bottom:20px}',
    '.dpk-sec-h{font-weight:700;font-size:.95rem;margin-bottom:8px}',
    '.dpk-line{font-size:.92rem;line-height:1.7;margin-bottom:3px;color:#555}',
    '.dpk-key{color:#111;font-weight:600}',
    '.dpk-blur{height:.72rem;margin:7px 0;border-radius:3px;background:linear-gradient(90deg,#e6e6ec,#f1f1f5);user-select:none;pointer-events:none}',
    '.dpk-fade{position:relative;z-index:2;margin:-155px -56px 0;padding:0 24px 34px;background:linear-gradient(180deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.92) 44%,#fff 64%);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;text-align:center}',
    '@media(max-width:560px){.dpk-fade{margin:-155px -22px 0}}',
    ".dpk-badge{font-family:'DM Sans',system-ui,sans-serif;display:inline-flex;align-items:center;gap:6px;background:rgba(4,120,87,.1);color:#047857;font-size:.72rem;font-weight:700;padding:4px 11px;border-radius:20px;margin-bottom:14px}",
    '.dpk-lock{font-size:1.7rem;margin-bottom:6px}',
    ".dpk-h3{font-family:'DM Sans',system-ui,sans-serif;font-size:1.1rem;font-weight:800;color:#1a1a2e;margin-bottom:6px;letter-spacing:-.01em}",
    ".dpk-p{font-family:'DM Sans',system-ui,sans-serif;font-size:.86rem;color:#555;line-height:1.55;max-width:410px;margin:0 auto 18px}",
    ".dpk-cta{font-family:'DM Sans',system-ui,sans-serif;display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#db2777 50%,#0891b2 100%);color:#fff;font-weight:700;font-size:.95rem;padding:13px 32px;border-radius:12px;text-decoration:none;box-shadow:0 8px 24px rgba(124,58,237,.34);border:none;cursor:pointer}",
    '.dpk-cta:hover{filter:brightness(1.06)}',
    ".dpk-back{display:block;margin:14px auto 0;background:none;border:none;color:#999;font-family:'DM Sans',system-ui,sans-serif;font-size:.85rem;cursor:pointer}",
    '.dpk-back:hover{color:#555}',
    '.dpk-spin{width:30px;height:30px;border:3px solid #eee;border-top-color:#7c3aed;border-radius:50%;animation:dpkspin .8s linear infinite;margin:0 auto}',
    ".dpkr{position:fixed;left:16px;right:16px;bottom:18px;z-index:9997;max-width:640px;margin:0 auto;background:#fff;border:1px solid rgba(124,58,237,.25);border-radius:14px;box-shadow:0 14px 44px rgba(20,20,40,.18);padding:14px 16px;display:flex;align-items:center;gap:14px;font-family:'DM Sans',system-ui,sans-serif;animation:dpkF .25s ease}",
    '.dpkr-ico{font-size:1.5rem;flex-shrink:0}',
    '.dpkr-t{flex:1;min-width:0}',
    '.dpkr-t b{display:block;font-size:.92rem;color:#1a1a2e;font-weight:800;letter-spacing:-.01em}',
    '.dpkr-t span{font-size:.8rem;color:#666}',
    '.dpkr-go{flex-shrink:0;background:linear-gradient(135deg,#7c3aed 0%,#db2777 50%,#0891b2 100%);color:#fff;border:none;border-radius:10px;padding:10px 18px;font-weight:700;font-size:.85rem;cursor:pointer;font-family:inherit}',
    '.dpkr-x{flex-shrink:0;background:none;border:none;color:#bbb;font-size:1.1rem;cursor:pointer;padding:4px}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var RESUME_KEY = 'dokumo_resume:' + location.pathname;
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function val(v,ph){return v?'<span class="dpk-key">'+esc(v)+'</span>':'<span style="color:#bbb">'+ph+'</span>';}
  function blur(n){var w=[94,88,80,96,72,90],o='';for(var i=0;i<n;i++)o+='<div class="dpk-blur" style="width:'+w[i%w.length]+'%"></div>';return o;}
  function loggedIn(){try{return !!JSON.parse(localStorage.getItem('dokumo_user'));}catch(e){return false;}}
  function activeSub(){try{var s=JSON.parse(localStorage.getItem('dokumo_sub'));return !!(s&&s.expiresAt&&new Date(s.expiresAt)>new Date());}catch(e){return false;}}

  function peekForm(){
    if(window.FORMS && window.selDoc && window.FORMS[window.selDoc]) return window.FORMS[window.selDoc];
    if(window.FORM) return window.FORM;
    return null;
  }
  function peekDocId(){ return window.selDoc || (window.FORM && window.FORM.docId) || location.pathname.replace(/.*\//,'').replace('.html','') || 'doc'; }
  function peekTitle(f){ return (f && f.title) || 'dokument'; }
  function buildPrompt(f){
    var pr = f.prompt(window.wizVals || {});
    if(window.wizVals && window.wizVals._extra_info) pr += '\nDodatkowe informacje: '+window.wizVals._extra_info;
    return pr;
  }

  // Podgląd strukturalny (0 tokenów) — dane usera + rozmyta reszta. Generyczny.
  function buildStructural(f){
    var vals = window.wizVals || {}, html = '', shown = 0;
    html += '<div class="dpk-title">'+esc(peekTitle(f).toUpperCase())+'</div>';
    html += '<div class="dpk-sub">Dokument przygotowany z Twoich danych</div>';
    (f.steps || []).forEach(function(step){
      var rows = '';
      (step.fields || []).forEach(function(fld){
        if(fld.showIf) return;
        var v = vals[fld.id]; if(!v) return;
        rows += '<div class="dpk-line">'+esc(fld.label)+': '+val(v,'')+'</div>'; shown++;
      });
      if(rows) html += '<div class="dpk-sec"><div class="dpk-sec-h">'+esc(step.label||'')+'</div>'+rows+'</div>';
    });
    if(!shown) html += '<div class="dpk-sec">'+blur(2)+'</div>';
    html += '<div class="dpk-sec"><div class="dpk-sec-h">Treść dokumentu</div>'+blur(4)+'</div>';
    return html;
  }
  function renderExcerpt(text){
    var lines = String(text||'').split('\n'), html = '', first = true;
    lines.forEach(function(l){
      var t = l.trim();
      if(!t){ html += '<div style="height:.55rem"></div>'; return; }
      if(first && !/^§/.test(t)){ html += '<div class="dpk-title">'+esc(t)+'</div>'; first=false; return; }
      first = false;
      if(/^(§|PARAGRAF|Paragraf|Art\.)/.test(t)) html += '<div class="dpk-sec-h" style="margin-top:16px">'+esc(t)+'</div>';
      else html += '<div class="dpk-line" style="color:#1a1a1a">'+esc(t)+'</div>';
    });
    return html;
  }
  function fade(title){
    return '<div class="dpk-fade">'
      + '<div class="dpk-badge">🔒 To dopiero początek dokumentu</div>'
      + '<div class="dpk-lock">🔒</div>'
      + '<div class="dpk-h3">Odblokuj pełny dokument</div>'
      + '<div class="dpk-p">Widzisz nagłówek i pierwsze paragrafy wygenerowane z Twoich danych. Pełna treść '+esc(title ? '„'+title+'"' : 'dokumentu')+' z wszystkimi klauzulami oraz pobranie PDF/DOCX są w pakiecie.</div>'
      + '<a href="subskrypcja.html?return='+encodeURIComponent(location.pathname)+'" class="dpk-cta">Odblokuj i pobierz →</a>'
      + '<button class="dpk-back" onclick="window.closeDocPeek()">← Wróć do edycji</button>'
      + '</div>';
  }

  function saveResume(docId, title, excerpt, vals){
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({
        docId: docId, title: title, url: location.pathname,
        excerpt: excerpt || '', vals: vals || {}, ts: Date.now()
      }));
    } catch(e) {}
  }
  window.clearDocResume = function(){ try{ localStorage.removeItem(RESUME_KEY); }catch(e){} };
  // Jednorazowy odczyt zapisanego wstępu — używany w body fetcha każdego generatora.
  window.takeResumeExcerpt = function(){ var e = window.__resumeExcerpt || null; window.__resumeExcerpt = null; return e; };

  window.closeDocPeek = function(){ var el = document.getElementById('dpkOv'); if(el) el.remove(); };

  window.showDocPeek = async function(){
    var f = peekForm(); if(!f) return;
    window.closeDocPeek();
    var ov = document.createElement('div'); ov.id = 'dpkOv'; ov.className = 'dpk-ov';
    ov.innerHTML = '<div class="dpk-wrap"><div class="dpk-paper" id="dpkPaper">'
      + '<div style="text-align:center;padding:36px 0"><div class="dpk-spin"></div>'
      + '<p style="font-family:\'DM Sans\',system-ui,sans-serif;color:#999;font-size:.85rem;margin-top:14px">Przygotowuję podgląd Twojego dokumentu…</p></div>'
      + '</div></div>';
    ov.addEventListener('click', function(e){ if(e.target === ov) window.closeDocPeek(); });
    document.body.appendChild(ov);

    var title = peekTitle(f), docId = peekDocId(), excerpt = '', inner;
    try {
      var pr = buildPrompt(f);
      var token = window._fbToken || '';
      var res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ preview: true, prompt: pr, systemPrompt: (window.SYSTEM_PROMPT || ''), docId: docId, docName: title })
      });
      var data = await res.json();
      var ok = res.ok && data.text && !/["']?error["']?\s*:\s*["']?missing_fields/i.test(data.text) && data.text.trim().charAt(0) !== '{';
      if(ok){ excerpt = data.text; inner = renderExcerpt(data.text) + blur(3); }
      else { inner = buildStructural(f); }
    } catch(e){ inner = buildStructural(f); }

    // Zapisz stan do wznowienia po płatności (dane + realny wstęp jeśli jest).
    saveResume(docId, title, excerpt, window.wizVals || {});
    var paper = document.getElementById('dpkPaper');
    if(!paper) return; // zamknięto w międzyczasie
    paper.innerHTML = inner + fade(title);
  };

  // Intercept dla doGenerate: zalogowany bez aktywnej subskrypcji → podgląd.
  window.tryDocPeek = function(){
    if(loggedIn() && !activeSub()){ window.showDocPeek(); return true; }
    return false;
  };

  // Baner wznowienia — po opłaceniu i powrocie na stronę generatora.
  var RESUME_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 dni — starszych podglądów nie wznawiamy
  function showResumeBanner(){
    var r; try{ r = JSON.parse(localStorage.getItem(RESUME_KEY)); }catch(e){ return; }
    if(!r || r.url !== location.pathname || !activeSub()) return;
    if(Date.now() - (r.ts || 0) > RESUME_MAX_AGE){ window.clearDocResume(); return; }
    if(document.getElementById('dpkResume')) return;
    var el = document.createElement('div'); el.id = 'dpkResume'; el.className = 'dpkr';
    el.innerHTML = '<div class="dpkr-ico">📄</div>'
      + '<div class="dpkr-t"><b>Masz rozpoczęty dokument: '+esc(r.title||'dokument')+'</b>'
      + '<span>Dokończymy go od miejsca, które widziałeś w podglądzie.</span></div>'
      + '<button class="dpkr-go" id="dpkrGo">Dokończ dokument →</button>'
      + '<button class="dpkr-x" id="dpkrX" aria-label="Zamknij">✕</button>';
    document.body.appendChild(el);
    // ✕ = odrzuć na stałe (wyczyść zapis), żeby baner nie wracał przy każdej wizycie.
    document.getElementById('dpkrX').onclick = function(){ window.clearDocResume(); el.remove(); };
    document.getElementById('dpkrGo').onclick = function(){
      try {
        // DokumoDraft zwykle już przywrócił formularz. Jeśli nie — użyj kopii z resume.
        var empty = !window.wizVals || Object.keys(window.wizVals).length < 2;
        if(empty){ window.wizVals = r.vals || {}; if(window.FORMS && r.docId) window.selDoc = r.docId; }
        window.__resumeExcerpt = r.excerpt || null; // dokończenie od §3
      } catch(e){}
      window.clearDocResume(); el.remove();
      if(typeof window.doGenerate === 'function') window.doGenerate();
    };
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(showResumeBanner, 600); });
  else setTimeout(showResumeBanner, 600);
})();
