(function(){
  const demo = document.getElementById('wizardDemo');
  if(!demo) return;

  // ── helpers ──────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function pillOn(el){ el.style.background='#111827'; el.style.color='#fff'; el.style.borderColor='#111827'; }
  function pillOff(el){ el.style.background='#fff'; el.style.color='#6b7280'; el.style.borderColor='#e5e7eb'; }

  function setStep(i){
    const labels=['Zleceniodawca','Zleceniobiorca','Zakres','Wynagrodzenie'];
    for(let k=0;k<4;k++){
      const dot=$('wds'+k), lbl=$('wdl'+k), pb=$('wpb'+k);
      if(k<i){
        dot.style.background='#111827'; dot.style.color='#fff'; dot.style.borderColor='#111827';
        dot.textContent='✓'; lbl.style.color='#111827'; pb.style.background='#111827';
      } else if(k===i){
        dot.style.background='#111827'; dot.style.color='#fff'; dot.style.borderColor='#111827';
        dot.textContent=k+1; lbl.style.color='#111827'; pb.style.background='#2563eb';
      } else {
        dot.style.background='#fff'; dot.style.color='#6b7280'; dot.style.borderColor='#d1d5db';
        dot.textContent=k+1; lbl.style.color='#6b7280'; pb.style.background='#e5e7eb';
      }
    }
  }

  function showStep(i){
    ['wStep0','wStep1','wStep2','wStep3','wStepGen','wStepDone'].forEach(id=>{
      const el=$(id); if(el){ el.style.display='none'; el.style.flexDirection=''; }
    });
    const el=$('wStep'+i);
    if(el){ el.style.display='block'; }
    restoreFormGrid();
  }

  function showSpecial(id){
    ['wStep0','wStep1','wStep2','wStep3','wStepGen','wStepDone'].forEach(sid=>{
      const el=$(sid); if(el){ el.style.display='none'; el.style.flexDirection=''; }
    });
    const el=$(id);
    if(el){ el.style.display='flex'; el.style.flexDirection='column'; }
    // full-width: hide preview panel, expand form panel
    const pp=$('wPreviewPanel'), fp=$('wFormPanel'), fg=$('wFormGrid');
    if(pp) pp.style.display='none';
    if(fp) fp.style.borderRight='none';
    if(fg) fg.style.gridTemplateColumns='1fr';
  }

  function restoreFormGrid(){
    const pp=$('wPreviewPanel'), fp=$('wFormPanel'), fg=$('wFormGrid');
    if(pp) pp.style.display='';
    if(fp) fp.style.borderRight='1px solid #f1f5f9';
    if(fg) fg.style.gridTemplateColumns='1fr 1fr';
  }

  // cursor
  const cursor = $('wCursor');
  let curX=60, curY=60;

  function showCursor(){ cursor.style.display='block'; }

  function getDemoScale(){
    const m = window.getComputedStyle(demo).transform;
    if(!m || m==='none') return 1;
    const match = m.match(/matrix\(([^,]+)/);
    return match ? parseFloat(match[1]) : 1;
  }

  async function moveTo(el, offsetX=0, offsetY=0){
    const dRect = demo.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const scale = getDemoScale();
    curX = (eRect.left - dRect.left + (offsetX || eRect.width/2)) / scale;
    curY = (eRect.top  - dRect.top  + (offsetY || eRect.height/2)) / scale;
    cursor.style.transform = `translate(${curX}px,${curY}px)`;
    await sleep(480);
  }

  async function clickAt(el, offsetX, offsetY){
    await moveTo(el, offsetX, offsetY);
    // ripple
    const rDiv = document.createElement('div');
    rDiv.style.cssText=`position:absolute;left:${curX}px;top:${curY}px;width:28px;height:28px;border-radius:50%;background:rgba(37,99,235,.3);transform:translate(-50%,-50%) scale(0);animation:wRippleAnim .5s ease-out forwards;pointer-events:none;`;
    $('wRipples').appendChild(rDiv);
    setTimeout(()=>rDiv.remove(), 600);
    await sleep(220);
  }

  async function typeInto(inputEl, text, delay=38){
    await moveTo(inputEl);
    inputEl.style.borderColor='#2563eb';
    inputEl.value='';
    for(const ch of text){
      inputEl.value += ch;
      updatePreview();
      await sleep(delay + Math.random()*18);
    }
    inputEl.style.borderColor='#e5e7eb';
    await sleep(180);
  }

  // preview panel
  const previewData = {};
  const previewOrder = [
    ['NIP','wNip'],['Nazwa firmy','wFirma'],['Adres siedziby','wAdres'],
    ['Imię i nazwisko','wImie'],['PESEL','wPesel'],['Student <26','wStudentVal'],
    ['Ubezpieczenie','wUbezpVal'],['Zakres','wZakres'],['Data od','wDataOd'],
    ['Data do','wDataDo'],['Wynagrodzenie','wKwota'],['Forma płatności','wFormaVal'],
    ['Termin płatności','wTerminVal'],['Ewidencja czasu','wEwidVal'],
  ];
  const previewValues = {};

  function updatePreview(){
    const pv = $('wPreview');
    if(!pv) return;
    previewOrder.forEach(([label, srcId])=>{
      let val;
      if(srcId.endsWith('Val')){ val = previewValues[srcId]||''; }
      else { const el=$(srcId); val = el ? el.value : ''; }
      let row = pv.querySelector('[data-wpk="'+srcId+'"]');
      if(val && val.trim()){
        if(!row){
          row = document.createElement('div');
          row.dataset.wpk = srcId;
          row.style.cssText='animation:wFadeIn .3s ease;';
          row.innerHTML='<div style="font-size:.52rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;margin-bottom:0;">'+label+'</div><div class="wpv-val" style="font-size:.68rem;font-weight:600;color:#111827;line-height:1.25;">'+val+'</div>';
          pv.appendChild(row);
        } else {
          const valEl = row.querySelector('.wpv-val');
          if(valEl && valEl.textContent !== val) valEl.textContent = val;
        }
      } else {
        if(row) row.remove();
      }
    });
  }

  function setPreviewVal(key, val){
    previewValues[key]=val;
    updatePreview();
  }

  // ── main animation loop ───────────────────────────────────
  async function resetAll(){
    ['wNip','wFirma','wAdres','wImie','wPesel','wZakres','wDataOd','wDataDo','wKwota'].forEach(id=>{
      const el=$(id); if(el) el.value='';
    });
    Object.keys(previewValues).forEach(k=>delete previewValues[k]);
    ['wStudentTak','wStudentNie','wUbezpTak','wUbezpNie','wPillRyczalt','wPillGodzin','wPill14','wPill7','wEwidTak','wEwidNie'].forEach(id=>{
      const el=$(id); if(el) pillOff(el);
    });
    $('wNipHint').style.display='none';
    $('wNipHint').textContent='';
    const pv=$('wPreview'); if(pv) pv.innerHTML='';
    restoreFormGrid();
  }

  async function runDemo(){
    await resetAll();
    showCursor();
    showStep(0);
    setStep(0);
    await sleep(400);

    // ── STEP 1: Zleceniodawca ──
    const nipEl=$('wNip'), firmaEl=$('wFirma'), adresEl=$('wAdres');
    await typeInto(nipEl,'5831014898',35);
    // GUS hint
    const hint=$('wNipHint');
    hint.style.display='block';
    hint.style.color='#9ca3af';
    hint.textContent='⏳ Pobieranie z GUS…';
    await sleep(700);
    hint.textContent='✅ Dane uzupełnione automatycznie';
    hint.style.color='#16a34a';
    // auto-fill firma & adres
    firmaEl.value=''; adresEl.value='';
    const firmaText='Dokumo Sp. z o.o.';
    const adresText='ul. Długa 5, 80-828 Gdańsk';
    for(let i=0;i<Math.max(firmaText.length,adresText.length);i++){
      if(i<firmaText.length) firmaEl.value+=firmaText[i];
      if(i<adresText.length) adresEl.value+=adresText[i];
      updatePreview();
      await sleep(28);
    }
    await sleep(300);
    await clickAt($('wBtn0'));
    await sleep(200);

    // ── STEP 2: Zleceniobiorca ──
    showStep(1); setStep(1); updatePreview();
    await sleep(300);
    await typeInto($('wImie'),'Anna Kowalska',38);
    await typeInto($('wPesel'),'98050512345',32);
    await clickAt($('wStudentTak'));
    pillOn($('wStudentTak')); pillOff($('wStudentNie'));
    setPreviewVal('wStudentVal','Tak');
    await sleep(200);
    await clickAt($('wUbezpTak'));
    pillOn($('wUbezpTak')); pillOff($('wUbezpNie'));
    setPreviewVal('wUbezpVal','Tak');
    await sleep(260);
    await clickAt($('wBtn1'));
    await sleep(200);

    // ── STEP 3: Zakres ──
    showStep(2); setStep(2); updatePreview();
    await sleep(300);
    await typeInto($('wZakres'),'Obsługa mediów społecznościowych',36);
    await typeInto($('wDataOd'),'01.04.2026',34);
    await typeInto($('wDataDo'),'30.06.2026',34);
    await sleep(200);
    await clickAt($('wBtn2'));
    await sleep(200);

    // ── STEP 4: Wynagrodzenie ──
    showStep(3); setStep(3); updatePreview();
    await sleep(300);
    await typeInto($('wKwota'),'4 500 zł brutto',36);
    await clickAt($('wPillRyczalt'));
    pillOn($('wPillRyczalt')); pillOff($('wPillGodzin'));
    setPreviewVal('wFormaVal','Ryczałt miesięczny');
    await sleep(200);
    await clickAt($('wPill14'));
    pillOn($('wPill14')); pillOff($('wPill7'));
    setPreviewVal('wTerminVal','14 dni od rachunku');
    await sleep(200);
    await clickAt($('wEwidNie'));
    pillOff($('wEwidTak')); pillOn($('wEwidNie'));
    setPreviewVal('wEwidVal','Nie');
    await sleep(260);
    await clickAt($('wBtn3'));
    await sleep(200);

    // ── GENERATING ──
    showSpecial('wStepGen');
    cursor.style.display='none';
    await sleep(1100);

    // ── DONE ──
    showSpecial('wStepDone');
    for(let k=0;k<4;k++){
      $('wpb'+k).style.background='#16a34a';
      $('wds'+k).style.background='#16a34a';
      $('wds'+k).style.borderColor='#16a34a';
      $('wds'+k).textContent='✓';
      $('wdl'+k).style.color='#16a34a';
    }
    await sleep(1700);

    // restart
    runDemo();
  }

  // start when section visible
  const obs = new IntersectionObserver(entries=>{
    if(entries[0].isIntersecting){ obs.disconnect(); runDemo(); }
  },{threshold:0.3});
  obs.observe(demo);
})();

// ── timeline IntersectionObserver ────────────────────────────
(function(){
  const tl = document.getElementById('htdTimeline');
  if(!tl) return;
  const steps = tl.querySelectorAll('.tl-step');
  const obs = new IntersectionObserver(entries => {
    if(!entries[0].isIntersecting) return;
    obs.disconnect();
    steps.forEach((step, i) => {
      setTimeout(() => {
        const dot  = step.querySelector('.tl-dot');
        const line = step.querySelector('.tl-line');
        const txt  = step.querySelector('.tl-text');
        if(dot) dot.classList.add('lit');
        if(txt) txt.classList.add('lit');
        if(line) setTimeout(() => line.classList.add('lit'), 80);
      }, i * 350);
    });
  }, { threshold: 0.3 });
  obs.observe(tl);
})();
