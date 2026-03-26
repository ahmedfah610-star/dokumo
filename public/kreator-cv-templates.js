// cv-templates.js – szablony CV
// Ten plik jest ładowany przez kreator-cv.html

function renderCustomSections(c1, c2) {
  if (typeof cvCustomSections === 'undefined' || !cvCustomSections.length) return '';
  const sections = cvCustomSections.filter(s => s.title || s.content);
  if (!sections.length) return '';
  const tpl = typeof cvTemplate !== 'undefined' ? cvTemplate : '';

  // Section title style matching each template's own certGroups header
  const ts = ({
    sidebar:   `font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.8px;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:5px;margin-bottom:9px`,
    cascade:   `font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.8px;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:5px;margin-bottom:9px`,
    nova:      `font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.8px;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:5px;margin-bottom:14px`,
    coral:     `font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.8px;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:5px;margin-bottom:9px`,
    metro:     `font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:4px;margin-bottom:12px`,
    midnight:  `font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c2||c1};margin-bottom:8px`,
    bold:      `font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#111;border-bottom:2px solid ${c1};padding-bottom:3px;margin-bottom:8px`,
    nordic:    `font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:8px`,
    rose:      `font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:8px`,
    teal:      `font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px`,
    creative:  `font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px`,
    timeline:  `font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};padding-bottom:4px;border-bottom:2px solid ${c1};margin-bottom:10px`,
    shield:    `font-size:13px;font-weight:700;color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:4px;margin-bottom:8px`,
    athens:    `font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:9px`,
    matrix:    `font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:4px;opacity:0.9;margin-bottom:10px`,
    executive: `font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c2};border-bottom:1.5px solid ${c2};padding-bottom:3px;opacity:0.85;margin-bottom:10px`,
    prism:     `font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:3px;opacity:0.85;margin-bottom:6px`,
    linen:     `font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:3px;opacity:0.85;margin-bottom:6px`,
    oxford:    `font-size:9.5px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:${c1};padding-left:9px;border-left:3px solid ${c1};margin-bottom:10px`,
  })[tpl] || `font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px`;

  const isDark = tpl === 'matrix';
  const contentStyle = `font-size:12px;color:${isDark?'#c9d1d9':'#555'};line-height:1.65`;

  const html = sections.map(s =>
    `<div style="margin-bottom:16px"><div style="${ts}">${s.title}</div><div style="${contentStyle}">${s.content}</div></div>`
  ).join('');

  return html ? `<div style="margin-top:16px">${html}</div>` : '';
}

function buildCVHTML(tpl) {
  const d = cvData;
  const t = CV_TEMPLATES.find(x => x.id === tpl) || CV_TEMPLATES[0];
  const c1 = (typeof cvCustomColor !== 'undefined' && cvCustomColor) ? cvCustomColor.c1 : t.color1;
  const c2 = (typeof cvCustomColor !== 'undefined' && cvCustomColor) ? cvCustomColor.c2 : t.color2;
  const name = [d.imie, d.nazwisko].filter(Boolean).join(' ') || 'Imię Nazwisko';
  const skills = d.umiejetnosci ? d.umiejetnosci.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const certItems = (d.certyfikatyList||[]).filter(c=>c.nazwa).map(c => c.nazwa + (c.wydawca ? ' – '+c.wydawca : '') + (c.rok ? ', '+c.rok : ''));
  const kursyItems = (d.kursy||[]).filter(k=>k.nazwa).map(k => { let dates=''; if(k.od&&k.do) dates=' '+k.od+' – '+k.do; else if(k.od&&k.obecnie) dates=' '+k.od+' – obecnie'; else if(k.od) dates=' '+k.od; return k.nazwa+(k.prowadzacy?' – '+k.prowadzacy:'')+dates; });
  const stazeItems = (d.staze||[]).filter(s=>s.firma).map(s => { let dates=''; if(s.od&&s.do) dates=' '+s.od+' – '+s.do; else if(s.od&&s.obecnie) dates=' '+s.od+' – obecnie'; else if(s.od) dates=' '+s.od; else if(s.do) dates=' do '+s.do; return s.firma+dates; });
  const certGroups = [
    ...(certItems.length ? [{ key: 'certyfikaty', label: 'Certyfikaty', items: certItems }] : []),
    ...(kursyItems.length ? [{ key: 'kursy', label: 'Kursy', items: kursyItems }] : []),
    ...(stazeItems.length ? [{ key: 'staze', label: 'Staże', items: stazeItems }] : []),
  ];
  const photo = d.zdjecie ? `<img src="${d.zdjecie}" alt="${[d.imie,d.nazwisko].filter(Boolean).join(' ') || 'Zdjęcie profilowe'}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : '';
  const contact = [
    d.email && `<span>✉ ${d.email}</span>`,
    d.tel && `<span>📞 ${d.tel}</span>`,
    d.adres && `<span>📍 ${d.adres}</span>`,
    d.linkedin && `<span>🔗 ${d.linkedin}</span>`,
  ].filter(Boolean).join('');

  // ── TIMELINE ──────────────────────────────────────────────
  if (tpl === 'timeline') {
    const sb = cvSidebarSections;
    const skillsInSb = sb.has('umiejetnosci') && skills.length;
    const jezykiInSb = sb.has('jezyki') && d.jezyki.some(l=>l.jezyk);
    const intInSb    = sb.has('zainteresowania') && d.zainteresowania;
    const customSects = (typeof cvCustomSections!=='undefined'?cvCustomSections:[]).filter(s=>s.title||s.content);

    // Section header — duży węzeł na linii + podkreślenie
    const sh = (lbl) => `<div style="position:relative;margin-bottom:10px">
      <div style="position:absolute;left:-25px;top:2px;width:12px;height:12px;border-radius:50%;background:${c1};z-index:1;box-shadow:0 0 0 2px #fff,0 0 0 3.5px ${c1}55"></div>
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};padding-bottom:4px;border-bottom:2px solid ${c1}">${lbl}</div>
    </div>`;
    // Mały węzeł dla pozycji (item)
    const idot = `<div style="position:absolute;left:-23px;top:5px;width:8px;height:8px;border-radius:50%;background:${c2};z-index:1"></div>`;

    // Prawa kolumna — nagłówek i itemy z własną linią (bez absolute)
    const rsh = (lbl) => `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};padding-bottom:4px;border-bottom:2px solid ${c1};margin-bottom:10px">${lbl}</div>`;
    const rdot = (last=false) => `<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:7px">
      <div style="width:7px;height:7px;border-radius:50%;background:${c1};margin-top:4px"></div>
      ${!last?`<div style="width:1.5px;flex:1;background:#e8e8e8;margin-top:2px;min-height:9px"></div>`:''}
    </div>`;

    return `
    <div style="font-family:Arial,sans-serif;background:#fff;min-height:842px">
      <div style="background:linear-gradient(135deg,${c1},${c2});padding:32px 40px 26px;display:flex;align-items:center;gap:22px">
        ${d.zdjecie?`<div style="width:88px;height:88px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,0.5);flex-shrink:0">${photo}</div>`:''}
        <div>
          <div style="font-size:26px;font-weight:700;color:#fff;line-height:1.1">${name}</div>
          ${d.stanowisko?`<div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:5px;letter-spacing:1.5px;text-transform:uppercase">${d.stanowisko}</div>`:''}
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;font-size:12px;color:rgba(255,255,255,0.75)">${contact}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 185px;padding:24px 40px 20px;gap:0;align-items:start">
        <!-- LEWA KOLUMNA: ciągła linia pionowa -->
        <div style="padding-right:28px;border-right:2px solid #f0f0f0;position:relative;padding-left:28px">
          <!-- Ciągła linia przez całą kolumnę -->
          <div style="position:absolute;left:8px;top:0;bottom:0;width:2px;background:#e8e8e8;z-index:0"></div>
          ${d.podsumowanie?`
          <div style="position:relative;margin-bottom:20px">
            ${sh(L("profile"))}
            <div style="position:relative;padding-left:2px">
              ${idot}
              <div style="font-size:12px;line-height:1.7;color:#555">${d.podsumowanie}</div>
            </div>
          </div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="position:relative;margin-bottom:20px">
            ${sh(L("experience"))}
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
            <div style="position:relative;margin-bottom:14px;padding-left:2px">
              ${idot}
              <div style="font-size:11px;font-weight:700;color:#1a1a1a">${e.stanowisko||''}</div>
              <div style="font-size:10px;color:${c2};font-weight:600">${e.firma||''}</div>
              <div style="font-size:10.5px;color:#aaa;margin-bottom:3px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
              ${e.opis?`<div style="font-size:12px;color:#666;line-height:1.6">${e.opis}</div>`:''}
            </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div style="position:relative;margin-bottom:20px">
            ${sh(L("education"))}
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
            <div style="position:relative;margin-bottom:12px;padding-left:2px">
              ${idot}
              <div style="font-size:11px;font-weight:700;color:#1a1a1a">${e.kierunek||''}</div>
              <div style="font-size:10px;color:#666">${e.szkola}</div>
              <div style="font-size:10.5px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>`).join('')}
          </div>`:''}
          ${!skillsInSb&&skills.length?`
          <div style="position:relative;margin-bottom:20px">
            ${sh(L("skills"))}
            ${skills.map(s=>`
            <div style="position:relative;margin-bottom:6px;padding-left:2px">
              ${idot}
              <div style="font-size:12px;color:#444">${s}</div>
            </div>`).join('')}
          </div>`:''}
          ${!jezykiInSb&&d.jezyki.some(l=>l.jezyk)?`
          <div style="position:relative;margin-bottom:20px">
            ${sh(L("languages"))}
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`
            <div style="position:relative;margin-bottom:6px;padding-left:2px">
              ${idot}
              <div style="font-size:12px;color:#444"><strong>${l.jezyk}</strong><span style="color:#aaa"> – ${l.poziom}</span></div>
            </div>`).join('')}
          </div>`:''}
          ${certGroups.filter(cg=>!sb.has(cg.key)).map(({label,items})=>`
          <div style="position:relative;margin-bottom:20px">
            ${sh(label)}
            ${items.map(c=>`
            <div style="position:relative;margin-bottom:6px;padding-left:2px">
              ${idot}
              <div style="font-size:12px;color:#444">${c}</div>
            </div>`).join('')}
          </div>`).join('')}
          ${!intInSb&&d.zainteresowania?`
          <div style="position:relative;margin-bottom:20px">
            ${sh(L("interests"))}
            <div style="position:relative;padding-left:2px">
              ${idot}
              <div style="font-size:12px;color:#555;line-height:1.6">${d.zainteresowania}</div>
            </div>
          </div>`:''}
          ${customSects.filter(s=>!sb.has('custom-'+s.id)).map(s=>`
          <div style="position:relative;margin-bottom:20px">
            ${sh(s.title||'')}
            <div style="position:relative;padding-left:2px">
              ${idot}
              <div style="font-size:12px;color:#555;line-height:1.65">${s.content||''}</div>
            </div>
          </div>`).join('')}
        </div>
        <!-- PRAWA KOLUMNA: sekcje przeniesione do bocznego -->
        <div style="padding-left:20px">
          ${skillsInSb?`
          <div style="margin-bottom:18px">
            ${rsh(L("skills"))}
            ${skills.map((s,i,arr)=>`
            <div style="display:flex;gap:9px">
              ${rdot(i===arr.length-1)}
              <div style="font-size:10.5px;color:#444;padding-bottom:${i<arr.length-1?'5':'1'}px">${s}</div>
            </div>`).join('')}
          </div>`:''}
          ${jezykiInSb?`
          <div style="margin-bottom:18px">
            ${rsh(L("languages"))}
            ${d.jezyki.filter(l=>l.jezyk).map((l,i,arr)=>`
            <div style="display:flex;gap:9px">
              ${rdot(i===arr.length-1)}
              <div style="font-size:10.5px;padding-bottom:${i<arr.length-1?'5':'1'}px"><strong>${l.jezyk}</strong><span style="color:#aaa"> – ${l.poziom}</span></div>
            </div>`).join('')}
          </div>`:''}
          ${certGroups.filter(cg=>sb.has(cg.key)).map(({label,items})=>`
          <div style="margin-bottom:18px">
            ${rsh(label)}
            ${items.map((c,i,arr)=>`
            <div style="display:flex;gap:9px">
              ${rdot(i===arr.length-1)}
              <div style="font-size:10.5px;color:#444;padding-bottom:${i<arr.length-1?'5':'1'}px">${c}</div>
            </div>`).join('')}
          </div>`).join('')}
          ${intInSb?`
          <div>
            ${rsh(L("interests"))}
            <div style="display:flex;gap:9px">
              ${rdot(true)}
              <div style="font-size:10.5px;color:#666;line-height:1.6">${d.zainteresowania}</div>
            </div>
          </div>`:''}
          ${customSects.filter(s=>sb.has('custom-'+s.id)).map(s=>`
          <div style="margin-bottom:18px">
            ${rsh(s.title||'')}
            <div style="display:flex;gap:9px">
              ${rdot(true)}
              <div style="font-size:10.5px;color:#555;line-height:1.65">${s.content||''}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:10px;border-top:1px solid #f0f0f0">${L("consent")}</div>
    </div>`;
  }

  // ── SIDEBAR ───────────────────────────────────────────────
  if (tpl === 'sidebar') {
    const sb = cvSidebarSections;
    const sbHdr = (lbl) => `<div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:2px;margin-bottom:9px">${lbl}</div>`;
    const mnHdr = (lbl) => `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.8px;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:5px;margin-bottom:9px">${lbl}</div>`;
    const skillsInSb = sb.has('umiejetnosci') && skills.length;
    const jezykiInSb = sb.has('jezyki') && d.jezyki.some(l=>l.jezyk);
    const intInSb    = sb.has('zainteresowania') && d.zainteresowania;
    return `
    <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif;display:flex;min-height:842px;background:#fff">
      <div style="width:215px;background:${c1};flex-shrink:0;display:flex;flex-direction:column;min-height:842px">
        <div style="padding:28px 20px 22px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1)">
          ${d.zdjecie?`<div style="width:82px;height:82px;border-radius:50%;overflow:hidden;margin:0 auto 14px;border:3px solid rgba(255,255,255,0.28)">${photo}</div>`:''}
          <div style="font-size:16px;font-weight:700;color:#fff;line-height:1.2;letter-spacing:-0.2px">${name}</div>
          ${d.stanowisko?`<div style="font-size:9.5px;color:rgba(255,255,255,0.55);margin-top:5px;text-transform:uppercase;letter-spacing:1.2px;line-height:1.4">${d.stanowisko}</div>`:''}
        </div>
        <div style="padding:16px 20px 0;flex:1">
          <div style="margin-bottom:15px">
            ${sbHdr(L("contact"))}
            ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<div style="font-size:11px;color:rgba(255,255,255,0.72);margin-bottom:5px;line-height:1.45;word-break:break-word">${x}</div>`).join('')}
          </div>
          ${skillsInSb?`
          <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:13px;margin-bottom:15px">
            ${sbHdr(L("skills"))}
            ${skills.map(s=>`<div style="font-size:11px;color:rgba(255,255,255,0.78);margin-bottom:5px;display:flex;align-items:flex-start;gap:5px"><span style="color:rgba(255,255,255,0.3);flex-shrink:0;margin-top:2px;font-size:8px">▸</span>${s}</div>`).join('')}
          </div>`:''}
          ${jezykiInSb?`
          <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:13px;margin-bottom:15px">
            ${sbHdr(L("languages"))}
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:11px;color:rgba(255,255,255,0.78);margin-bottom:5px">${l.jezyk} <span style="color:rgba(255,255,255,0.4)">· ${l.poziom}</span></div>`).join('')}
          </div>`:''}
          ${certGroups.filter(cg=>sb.has(cg.key)).map(({label,items})=>`<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:13px;margin-bottom:15px">${sbHdr(label)}${items.map(c=>`<div style="font-size:11px;color:rgba(255,255,255,0.72);margin-bottom:4px">· ${c}</div>`).join('')}</div>`).join('')}
          ${intInSb?`
          <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:13px;margin-bottom:15px">
            ${sbHdr(L("interests"))}
            <div style="font-size:11px;color:rgba(255,255,255,0.65);line-height:1.65">${d.zainteresowania}</div>
          </div>`:''}
          ${(typeof cvCustomSections!=='undefined'?cvCustomSections:[]).filter(s=>sb.has('custom-'+s.id)&&(s.title||s.content)).map(s=>`<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:13px;margin-bottom:15px">${sbHdr(s.title||'')}<div style="font-size:11px;color:rgba(255,255,255,0.72);line-height:1.65">${s.content}</div></div>`).join('')}
        </div>
      </div>
      <div style="flex:1;padding:28px 28px 20px;display:flex;flex-direction:column;min-width:0">
        ${d.podsumowanie?`
        <div style="margin-bottom:20px">
          ${mnHdr(L("profile"))}
          <div style="font-size:10px;line-height:1.75;color:#484848">${d.podsumowanie}</div>
        </div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:20px">
          ${mnHdr(L("experience"))}
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
          <div style="margin-bottom:18px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div style="font-size:11px;font-weight:700;color:#1c1c1c;line-height:1.3">${e.stanowisko||''}</div>
              <div style="font-size:11px;color:#aaa;white-space:nowrap;flex-shrink:0;margin-top:1px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:12px;color:${c1};font-weight:600;margin:2px 0 4px">${e.firma||''}</div>
            ${e.opis?`<div style="font-size:12px;color:#555;line-height:1.65">${e.opis}</div>`:''}
          </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div style="margin-bottom:20px">
          ${mnHdr(L("education"))}
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div style="font-size:11px;font-weight:700;color:#1c1c1c">${e.kierunek||''}</div>
              <div style="font-size:11px;color:#aaa;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:12px;color:#555">${e.szkola}</div>
          </div>`).join('')}
        </div>`:''}
        ${!skillsInSb&&skills.length?`<div style="margin-bottom:18px">${mnHdr(L("skills"))}<div style="display:flex;flex-wrap:wrap;gap:5px">${skills.map(s=>`<span style="font-size:11px;padding:3px 10px;background:rgba(0,0,0,0.06);color:#1e293b;border-radius:99px;font-weight:600">${s}</span>`).join('')}</div></div>`:''}
        ${!jezykiInSb&&d.jezyki.some(l=>l.jezyk)?`<div style="margin-bottom:18px">${mnHdr(L("languages"))}<div style="display:flex;flex-wrap:wrap;gap:6px 20px">${d.jezyki.filter(l=>l.jezyk).map(l=>`<span style="font-size:12px;color:#1c1c1c;font-weight:600">${l.jezyk}<span style="color:#aaa;font-weight:400"> – ${l.poziom}</span></span>`).join('')}</div></div>`:''}
        ${certGroups.filter(cg=>!sb.has(cg.key)).map(({label,items})=>`<div style="margin-bottom:18px">${mnHdr(label)}${items.map(c=>`<div style="font-size:12px;color:#555;margin-bottom:3px">· ${c}</div>`).join('')}</div>`).join('')}
        ${!intInSb&&d.zainteresowania?`<div style="margin-bottom:18px">${mnHdr(L("interests"))}<div style="font-size:12px;color:#555;line-height:1.65">${d.zainteresowania}</div></div>`:''}
        ${(typeof cvCustomSections!=='undefined'?cvCustomSections:[]).filter(s=>!sb.has('custom-'+s.id)&&(s.title||s.content)).map(s=>`<div style="margin-bottom:18px">${mnHdr(s.title||'')}<div style="font-size:12px;color:#555;line-height:1.65">${s.content}</div></div>`).join('')}
        <div style="margin-top:auto;font-size:9px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:8px;text-align:center">${L("consent")}</div>
      </div>
    </div>`;
  }

  // ── CREATIVE (fioletowy gradient) ─────────────────────────
  if (tpl === 'creative') return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#fff;min-height:842px">
      <div style="background:linear-gradient(160deg,${c1} 0%,${c2} 100%);padding:0 0 40px 0;position:relative;overflow:hidden">
        <div style="position:absolute;top:-40px;right:-40px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,0.05)"></div>
        <div style="position:absolute;bottom:-20px;left:60%;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,0.05)"></div>
        <div style="position:relative;z-index:1;padding:36px 40px;display:flex;align-items:center;gap:24px">
          ${d.zdjecie ? `<div style="width:96px;height:96px;border-radius:50%;overflow:hidden;border:4px solid rgba(255,255,255,0.4);flex-shrink:0">${photo}</div>` : ''}
          <div>
            <div style="font-size:28px;font-weight:800;color:#fff;line-height:1.1;letter-spacing:-0.5px">${name}</div>
            ${d.stanowisko?`<div style="font-size:11px;color:rgba(255,255,255,0.75);margin-top:6px;letter-spacing:2px;text-transform:uppercase">${d.stanowisko}</div>`:''}
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;padding:0 40px;position:relative;z-index:1">
          ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(c=>`<span style="background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.9);font-size:10.5px;padding:4px 10px;border-radius:20px">${c}</span>`).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 180px;padding:28px 40px;gap:28px">
        <div>
          ${d.podsumowanie?`<div style="margin-bottom:20px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px;display:flex;align-items:center;gap:8px"><span style="width:20px;height:3px;background:${c2};border-radius:2px;display:inline-block"></span>${L("summary")}</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:20px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px;display:flex;align-items:center;gap:8px"><span style="width:20px;height:3px;background:${c2};border-radius:2px;display:inline-block"></span>${L("experience")}</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:16px;background:#faf9fe;padding:10px 14px;border-left:3px solid ${c2}">
                <div style="font-size:11px;font-weight:700;color:#222">${e.stanowisko||''}</div>
                <div style="display:flex;justify-content:space-between;margin-top:2px"><div style="font-size:12px;color:${c1};font-weight:600">${e.firma||''}</div><div style="font-size:10.5px;color:#bbb">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
                ${e.opis?`<div style="font-size:12px;color:#666;margin-top:4px;line-height:1.6">${e.opis}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px;display:flex;align-items:center;gap:8px"><span style="width:20px;height:3px;background:${c2};border-radius:2px;display:inline-block"></span>${L("education")}</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:14px;background:#faf9fe;padding:10px 14px;border-left:3px solid ${c2}">
                <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:12px;color:#555">${e.szkola}</div><div style="font-size:10.5px;color:#bbb">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              </div>`).join('')}
          </div>`:''}${renderCustomSections(c1, c2)}
        </div>
        <div>
          ${skills.length?`
          <div style="margin-bottom:18px">
            <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${L("skills")}</div>
            ${skills.map(s=>`<div style="font-size:10.5px;background:linear-gradient(135deg,${c1}15,${c2}15);padding:4px 8px;margin-bottom:4px;color:#333;border-radius:3px">${s}</div>`).join('')}
          </div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`
          <div style="margin-bottom:18px">
            <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${L("languages")}</div>
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:12px;margin-bottom:5px;color:#444">${l.jezyk} <span style="color:#bbb">– ${l.poziom}</span></div>`).join('')}
          </div>`:''}
          ${certGroups.map(({label,items}) => `<div style="margin-bottom:16px"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${label}</div>${items.map(c=>`<div style="font-size:12px;margin-bottom:4px;display:flex;align-items:center;gap:6px"><span style="width:5px;height:5px;border-radius:50%;background:${c1};flex-shrink:0;display:inline-block"></span>${c}</div>`).join('')}</div>`).join('')}
          ${d.zainteresowania?`
          <div>
            <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${L("interests")}</div>
            <div style="font-size:12px;color:#666;line-height:1.6">${d.zainteresowania}</div>
          </div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:8px;border-top:1px solid #f0f0f0">${L("consent")}</div>
    </div>`;

  // ── BOLD (czerwony) ───────────────────────────────────────
  if (tpl === 'bold') {
    const bsh = (lbl) => `<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#fff;background:${c1};padding:6px 14px;margin-bottom:10px">${lbl}</div>`;
    return `
    <div style="font-family:Arial,sans-serif;background:#fff">
      <div style="background:#111;padding:28px 36px 22px;display:flex;align-items:center;gap:20px">
        ${d.zdjecie?`<div style="width:80px;height:80px;border-radius:50%;overflow:hidden;border:3px solid ${c1};flex-shrink:0">${photo}</div>`:''}
        <div style="flex:1">
          <div style="font-size:24px;font-weight:900;color:#fff;line-height:1.1;text-transform:uppercase;letter-spacing:-0.5px">${name}</div>
          ${d.stanowisko?`<div style="font-size:10px;color:${c1};margin-top:5px;font-weight:700;text-transform:uppercase;letter-spacing:2px">${d.stanowisko}</div>`:''}
          <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:12px">
            ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(v=>`<span style="font-size:11px;color:rgba(255,255,255,0.65)">${v}</span>`).join('')}
          </div>
        </div>
      </div>
      <div style="padding:20px 36px">
        ${d.podsumowanie?`<div style="margin-bottom:18px">${bsh(L('profile'))}<div style="font-size:12px;line-height:1.7;color:#555;padding:0 2px">${d.podsumowanie}</div></div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:18px">${bsh(L('experience'))}
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
          <div style="margin-bottom:14px;padding:0 2px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <div style="font-size:11px;font-weight:700;color:#111">${e.stanowisko||''}</div>
              <div style="font-size:11px;color:#999;white-space:nowrap">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:12px;color:${c1};font-weight:700">${e.firma||''}</div>
            ${e.opis?`<div style="font-size:10.5px;color:#666;margin-top:3px;line-height:1.6">${e.opis}</div>`:''}
          </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div style="margin-bottom:18px">${bsh(L('education'))}
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
          <div style="margin-bottom:12px;padding:0 2px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <div style="font-size:10px;font-weight:700;color:#111">${e.kierunek||''}</div>
              <div style="font-size:11px;color:#999">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:10.5px;color:#555">${e.szkola}</div>
          </div>`).join('')}
        </div>`:''}
        ${skills.length?`
        <div style="margin-bottom:18px">${bsh(L('skills'))}
          <div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 2px">
            ${skills.map(s=>`<span style="font-size:10.5px;background:#f5f5f5;border-left:3px solid ${c1};padding:3px 8px;color:#333">${s}</span>`).join('')}
          </div>
        </div>`:''}
        ${d.jezyki.some(l=>l.jezyk)?`
        <div style="margin-bottom:18px">${bsh(L('languages'))}
          <div style="display:flex;flex-wrap:wrap;gap:8px;padding:0 2px">
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<span style="font-size:10.5px;color:#444">${l.jezyk} <span style="color:${c1};font-weight:700">${l.poziom}</span></span>`).join('')}
          </div>
        </div>`:''}
        ${certGroups.map(({label,items})=>`
        <div style="margin-bottom:18px">${bsh(label)}
          <div style="padding:0 2px">${items.map(c=>`<div style="font-size:10.5px;color:#444;padding:2px 0;border-bottom:1px solid #f0f0f0">${c}</div>`).join('')}</div>
        </div>`).join('')}
        ${d.zainteresowania?`
        <div style="margin-bottom:18px">${bsh(L('interests'))}
          <div style="font-size:10.5px;color:#555;line-height:1.6;padding:0 2px">${d.zainteresowania}</div>
        </div>`:''}
        ${renderCustomSections(c1,c2)}
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:6px;border-top:1px solid #f0f0f0">${L("consent")}</div>
    </div>`;};

  // ── TEAL ──────────────────────────────────────────────────
  const tealSH = (label) => `<div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin:18px 0 10px;display:flex;align-items:center;gap:8px"><span style="width:24px;height:2px;background:${c1};display:inline-block"></span>${label}</div>`;
  if (tpl === 'teal') return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f8fffe;min-height:842px">
      <div style="background:#fff;border-bottom:4px solid ${c1};padding:28px 40px;display:flex;align-items:center;gap:22px">
        ${d.zdjecie ? `<div style="width:90px;height:90px;border-radius:50%;overflow:hidden;border:2px solid ${c1};flex-shrink:0">${photo}</div>` : ''}
        <div style="flex:1">
          <div style="font-size:26px;font-weight:700;color:#1a1a1a;line-height:1.1">${name}</div>
          ${d.stanowisko?`<div style="font-size:11px;color:${c1};font-weight:600;margin-top:4px;text-transform:uppercase;letter-spacing:1.5px">${d.stanowisko}</div>`:''}
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;font-size:10.5px;color:#666">${contact}</div>
        </div>
      </div>
      <div style="padding:4px 40px 24px">
        ${d.podsumowanie?`<div style="margin-top:18px;background:#fff;padding:14px;border-left:4px solid ${c1};box-shadow:0 2px 8px rgba(0,0,0,0.04)"><div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:6px">${L("profile")}</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        ${tealSH(L("experience"))}
        ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
          <div style="background:#fff;padding:12px 16px;margin-bottom:10px;box-shadow:0 1px 6px rgba(0,0,0,0.06);border-radius:4px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <div style="font-size:11px;font-weight:700;color:#1a1a1a">${e.stanowisko||''}</div>
              <div style="font-size:10.5px;color:#aaa;white-space:nowrap">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:10px;color:${c1};font-weight:600">${e.firma||''}</div>
            ${e.opis?`<div style="font-size:12px;color:#666;margin-top:4px;line-height:1.6">${e.opis}</div>`:''}
          </div>`).join('')}`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        ${tealSH(L("education"))}
        ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
          <div style="background:#fff;padding:12px 16px;margin-bottom:10px;box-shadow:0 1px 6px rgba(0,0,0,0.06);border-radius:4px">
            <div style="font-size:11px;font-weight:700;color:#1a1a1a">${e.kierunek||''}</div>
            <div style="display:flex;justify-content:space-between"><div style="font-size:12px;color:#555">${e.szkola}</div><div style="font-size:10.5px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
          </div>`).join('')}`:''}
        ${skills.length?`
        ${tealSH(L("skills"))}
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${skills.map(s=>`<div style="background:#fff;padding:6px 14px;box-shadow:0 1px 6px rgba(0,0,0,0.06);border-radius:4px;font-size:12px;color:#333;border-top:2px solid ${c1}">${s}</div>`).join('')}
        </div>`:''}
        ${d.jezyki.some(l=>l.jezyk)?`
        ${tealSH(L("languages"))}
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="background:#fff;padding:6px 14px;box-shadow:0 1px 6px rgba(0,0,0,0.06);border-radius:4px;font-size:12px;color:#333"><span style="font-weight:600">${l.jezyk}</span> <span style="color:#aaa">– ${l.poziom}</span></div>`).join('')}
        </div>`:''}
        ${certGroups.map(({label,items})=>items.length?`
        ${tealSH(label)}
        <div style="display:flex;flex-direction:column;gap:8px">
          ${items.map(c=>`<div style="background:#fff;padding:8px 14px;box-shadow:0 1px 6px rgba(0,0,0,0.06);border-radius:4px;font-size:12px;color:#444">${c}</div>`).join('')}
        </div>`:'').join('')}
        ${d.zainteresowania?`
        ${tealSH(L("interests"))}
        <div style="background:#fff;padding:12px 16px;box-shadow:0 1px 6px rgba(0,0,0,0.06);border-radius:4px;font-size:12px;color:#666;line-height:1.6">${d.zainteresowania}</div>`:''}
        ${renderCustomSections(c1,c2)}
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:8px">${L("consent")}</div>
    </div>`;

  // ── MIDNIGHT ──────────────────────────────────────────────
  const midSH = (label) => `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c2};border-bottom:1.5px solid ${c2};padding-bottom:4px;margin-bottom:10px">${label}</div>`;
  if (tpl === 'midnight') return `
    <div style="font-family:Arial,sans-serif;background:#fff;min-height:842px">
      <div style="background:#0f172a;padding:32px 40px;display:flex;gap:24px;align-items:center">
        ${d.zdjecie?`<div style="width:84px;height:84px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid rgba(255,255,255,0.15)">${photo}</div>`:''}
        <div style="flex:1">
          <div style="font-size:24px;font-weight:700;color:#f8fafc;letter-spacing:-0.3px">${name}</div>
          ${d.stanowisko?`<div style="font-size:10px;color:#94a3b8;margin-top:5px;letter-spacing:2px;text-transform:uppercase">${d.stanowisko}</div>`:''}
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px">${[d.email,d.tel,d.adres].filter(Boolean).map(x=>`<span style="font-size:10.5px;color:#94a3b8">${x}</span>`).join(' · ')}</div>
        </div>
      </div>
      <div style="height:3px;background:linear-gradient(90deg,${c1},${c2},transparent)"></div>
      <div style="padding:20px 40px 24px">
        ${d.podsumowanie?`<div style="margin-bottom:18px">${midSH(L("profile"))}<div style="font-size:10px;line-height:1.75;color:#444">${d.podsumowanie}</div></div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:18px">${midSH(L("experience"))}
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
            <div style="margin-bottom:12px;padding:10px 14px;background:#f8fafc;border-radius:4px">
              <div style="display:flex;justify-content:space-between;align-items:baseline">
                <div style="font-size:11px;font-weight:700;color:#1e293b">${e.stanowisko||''}</div>
                <div style="font-size:11px;color:#94a3b8;white-space:nowrap">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
              </div>
              <div style="font-size:12px;color:${c2};font-weight:600;margin-top:1px">${e.firma||''}</div>
              ${e.opis?`<div style="font-size:12px;color:#555;margin-top:4px;line-height:1.6">${e.opis}</div>`:''}
            </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div style="margin-bottom:18px">${midSH(L("education"))}
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
            <div style="margin-bottom:10px;padding:10px 14px;background:#f8fafc;border-radius:4px">
              <div style="font-size:11px;font-weight:700;color:#1e293b">${e.kierunek||''}</div>
              <div style="display:flex;justify-content:space-between"><div style="font-size:12px;color:#555">${e.szkola}</div><div style="font-size:11px;color:#94a3b8">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
            </div>`).join('')}
        </div>`:''}
        ${skills.length?`
        <div style="margin-bottom:18px">${midSH(L("skills"))}
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${skills.map(s=>`<span style="font-size:10.5px;padding:4px 10px;background:#f1f5f9;border-radius:3px;color:#334155">${s}</span>`).join('')}
          </div>
        </div>`:''}
        ${d.jezyki.some(l=>l.jezyk)?`
        <div style="margin-bottom:18px">${midSH(L("languages"))}
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<span style="font-size:12px;color:#334155">${l.jezyk} <span style="color:#94a3b8">– ${l.poziom}</span></span>`).join('')}
          </div>
        </div>`:''}
        ${certGroups.map(({label,items})=>items.length?`
        <div style="margin-bottom:18px">${midSH(label)}
          ${items.map(c=>`<div style="font-size:12px;margin-bottom:4px;display:flex;align-items:center;gap:6px;color:#334155"><span style="width:5px;height:5px;border-radius:50%;background:${c2};flex-shrink:0;display:inline-block"></span>${c}</div>`).join('')}
        </div>`:'').join('')}
        ${d.zainteresowania?`
        <div style="margin-bottom:18px">${midSH(L("interests"))}
          <div style="font-size:12px;color:#555;line-height:1.6">${d.zainteresowania}</div>
        </div>`:''}
        ${renderCustomSections(c1,c2)}
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:8px;border-top:1px solid #f0f0f0">${L("consent")}</div>
    </div>`;

  // ── CORAL ─────────────────────────────────────────────────
  if (tpl === 'coral') return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#fff;min-height:842px">
      <div style="display:grid;grid-template-columns:210px 1fr;min-height:842px">
        <div style="background:linear-gradient(180deg,${c1},${c2});padding:28px 20px;display:flex;flex-direction:column;gap:0;min-height:842px">
          ${d.zdjecie?`<div style="width:80px;height:80px;border-radius:50%;overflow:hidden;margin:0 auto 16px;border:3px solid rgba(255,255,255,0.4)">${photo}</div>`:''}
          <div style="text-align:center;margin-bottom:20px">
            <div style="font-size:15px;font-weight:700;color:#fff;line-height:1.2">${name}</div>
            ${d.stanowisko?`<div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:4px;text-transform:uppercase;letter-spacing:1px">${d.stanowisko}</div>`:''}
          </div>
          <div style="font-size:9.5px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:5px">${L("contact")}</div>
          ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<div style="font-size:11px;color:rgba(255,255,255,0.75);margin-bottom:5px;word-break:break-all">${x}</div>`).join('')}
          ${skills.length?`<div style="font-size:9.5px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;margin:14px 0 8px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:5px">${L("skills")}</div>${skills.map(s=>`<div style="font-size:11px;color:rgba(255,255,255,0.8);margin-bottom:4px">· ${s}</div>`).join('')}`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="font-size:9.5px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;margin:14px 0 8px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:5px">${L("languages")}</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:11px;color:rgba(255,255,255,0.8);margin-bottom:4px">${l.jezyk} – ${l.poziom}</div>`).join('')}`:''}
          ${certGroups.map(({label,items}) => `<div style="font-size:9.5px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;margin:14px 0 8px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:5px">${label}</div>${items.map(c=>`<div style="font-size:11px;color:rgba(255,255,255,0.8);margin-bottom:4px">· ${c}</div>`).join('')}`).join('')}
          ${d.zainteresowania?`<div style="font-size:9.5px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;margin:14px 0 8px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:5px">${L("interests")}</div><div style="font-size:11px;color:rgba(255,255,255,0.75);line-height:1.65">${d.zainteresowania}</div>`:''}
        </div>
        <div style="padding:28px 28px;display:flex;flex-direction:column">
          ${d.podsumowanie?`<div style="margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #f0f0f0"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:7px">${L("profile")}</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:18px">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px">${L("experience")}</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:14px;padding-left:10px;border-left:2px solid ${c2}">
                <div style="font-size:11px;font-weight:700;color:#222">${e.stanowisko||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:12px;color:${c1}">${e.firma||''}</div><div style="font-size:10.5px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
                ${e.opis?`<div style="font-size:12px;color:#666;margin-top:3px;line-height:1.6">${e.opis}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px">${L("education")}</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:12px;padding-left:10px;border-left:2px solid ${c2}">
                <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:12px;color:#555">${e.szkola}</div><div style="font-size:10.5px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              </div>`).join('')}
          </div>`:''}${renderCustomSections(c1, c2)}
          <div style="margin-top:auto;font-size:9px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:8px;text-align:center">${L("consent")}</div>
        </div>
      </div>
    </div>`;

  // ── ROSE ──────────────────────────────────────────────────
  if (tpl === 'rose') return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#fff;min-height:842px">
      <div style="background:linear-gradient(135deg,${c1},${c2});padding:36px 40px;text-align:center;position:relative">
        ${d.zdjecie?`<div style="width:90px;height:90px;border-radius:50%;overflow:hidden;margin:0 auto 14px;border:4px solid rgba(255,255,255,0.5)">${photo}</div>`:'<div style="width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,0.2);margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:1.8rem">👤</div>'}
        <div style="font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.3px">${name}</div>
        ${d.stanowisko?`<div style="font-size:10px;color:rgba(255,255,255,0.75);margin-top:6px;letter-spacing:2px;text-transform:uppercase">${d.stanowisko}</div>`:''}
        <div style="display:flex;justify-content:center;flex-wrap:wrap;gap:14px;margin-top:12px">${[d.email,d.tel,d.adres].filter(Boolean).map(x=>`<span style="font-size:10.5px;color:rgba(255,255,255,0.8);background:rgba(255,255,255,0.15);padding:3px 10px;border-radius:20px">${x}</span>`).join('')}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 180px;padding:24px 40px;gap:24px">
        <div>
          ${d.podsumowanie?`<div style="margin-bottom:18px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:7px;padding-bottom:5px;border-bottom:2px solid ${c1}">${L("summary")}</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:18px">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px;padding-bottom:5px;border-bottom:2px solid ${c1}">${L("experience")}</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:15px;display:flex;gap:10px">
                <div style="width:8px;height:8px;border-radius:50%;background:${c1};flex-shrink:0;margin-top:3px"></div>
                <div>
                  <div style="font-size:11px;font-weight:700;color:#222">${e.stanowisko||''}</div>
                  <div style="display:flex;justify-content:space-between"><div style="font-size:12px;color:${c2};font-weight:600">${e.firma||''}</div><div style="font-size:10.5px;color:#bbb">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
                  ${e.opis?`<div style="font-size:12px;color:#666;margin-top:3px;line-height:1.6">${e.opis}</div>`:''}
                </div>
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px;padding-bottom:5px;border-bottom:2px solid ${c1}">${L("education")}</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:12px;display:flex;gap:10px">
                <div style="width:8px;height:8px;border-radius:50%;background:${c1};flex-shrink:0;margin-top:3px"></div>
                <div>
                  <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
                  <div style="display:flex;justify-content:space-between"><div style="font-size:12px;color:#555">${e.szkola}</div><div style="font-size:10.5px;color:#bbb">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
                </div>
              </div>`).join('')}
          </div>`:''}${renderCustomSections(c1, c2)}
        </div>
        <div>
          ${skills.length?`<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${L("skills")}</div>${skills.map(s=>`<div style="font-size:10.5px;margin-bottom:4px;padding:3px 8px;background:${c1}15;border-radius:3px;color:#444">${s}</div>`).join('')}</div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${L("languages")}</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:12px;margin-bottom:4px;color:#444">${l.jezyk} <span style="color:#bbb">– ${l.poziom}</span></div>`).join('')}</div>`:''}
          ${certGroups.map(({label,items}) => `<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${label}</div>${items.map(c=>`<div style="font-size:12px;margin-bottom:4px;display:flex;align-items:center;gap:6px"><span style="width:5px;height:5px;border-radius:50%;background:${c1};flex-shrink:0;display:inline-block"></span>${c}</div>`).join('')}</div>`).join('')}
          ${d.zainteresowania?`<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${L("interests")}</div><div style="font-size:10.5px;color:#555;line-height:1.6">${d.zainteresowania}</div></div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:8px;border-top:1px solid #f0f0f0">${L("consent")}</div>
    </div>`;


  // ── OCEAN ─────────────────────────────────────────────────
  if (tpl === 'ocean') return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f0f9ff;min-height:842px;display:flex;flex-direction:column">
      <div style="background:linear-gradient(135deg,${c1},${c2});padding:32px 40px;display:flex;align-items:center;gap:22px;clip-path:polygon(0 0,100% 0,100% 85%,0 100%)">
        ${d.zdjecie?`<div style="width:88px;height:88px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,0.5);flex-shrink:0">${photo}</div>`:''}
        <div>
          <div style="font-size:25px;font-weight:700;color:#fff;line-height:1.1">${name}</div>
          ${d.stanowisko?`<div style="font-size:10px;color:rgba(255,255,255,0.8);margin-top:5px;letter-spacing:1.5px;text-transform:uppercase">${d.stanowisko}</div>`:''}
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px">${[d.email,d.tel,d.adres].filter(Boolean).map(x=>`<span style="font-size:10.5px;color:rgba(255,255,255,0.8)">${x}</span>`).join('')}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 185px;padding:8px 40px 24px;gap:24px;flex:1;align-content:start">
        <div>
          ${d.podsumowanie?`<div style="margin-bottom:18px;background:#fff;padding:14px;border-radius:6px;box-shadow:0 1px 8px rgba(30,64,175,0.07)"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:6px">${L("profile")}</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:18px">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px">${L("experience")}</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="background:#fff;padding:12px;margin-bottom:12px;border-radius:6px;box-shadow:0 1px 6px rgba(30,64,175,0.06);border-left:3px solid ${c2}">
                <div style="display:flex;justify-content:space-between">
                  <div style="font-size:11px;font-weight:700;color:#1e293b">${e.stanowisko||''}</div>
                  <div style="font-size:10.5px;color:#94a3b8">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
                </div>
                <div style="font-size:12px;color:${c1};font-weight:600">${e.firma||''}</div>
                ${e.opis?`<div style="font-size:12px;color:#666;margin-top:4px;line-height:1.6">${e.opis}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px">${L("education")}</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="background:#fff;padding:10px;margin-bottom:10px;border-radius:6px;box-shadow:0 1px 6px rgba(30,64,175,0.06);border-left:3px solid ${c2}">
                <div style="font-size:11px;font-weight:700;color:#1e293b">${e.kierunek||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:12px;color:#555">${e.szkola}</div><div style="font-size:10.5px;color:#94a3b8">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              </div>`).join('')}
          </div>`:''}${renderCustomSections(c1, c2)}
        </div>
        <div>
          ${skills.length?`<div style="background:#fff;padding:12px;border-radius:6px;box-shadow:0 1px 6px rgba(30,64,175,0.06);margin-bottom:10px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${L("skills")}</div>${skills.map(s=>`<div style="font-size:10.5px;background:${c1}12;padding:3px 8px;margin-bottom:4px;border-radius:3px;color:#334155">${s}</div>`).join('')}</div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="background:#fff;padding:12px;border-radius:6px;box-shadow:0 1px 6px rgba(30,64,175,0.06);margin-bottom:10px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${L("languages")}</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:12px;margin-bottom:4px;color:#334155">${l.jezyk} <span style="color:#94a3b8">– ${l.poziom}</span></div>`).join('')}</div>`:''}
          ${certGroups.map(({label,items}) => `<div style="background:#fff;padding:12px;border-radius:6px;box-shadow:0 1px 6px rgba(30,64,175,0.06);margin-bottom:10px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${label}</div>${items.map(c=>`<div style="font-size:12px;margin-bottom:4px;display:flex;align-items:center;gap:6px"><span style="width:5px;height:5px;border-radius:50%;background:${c1};flex-shrink:0;display:inline-block"></span>${c}</div>`).join('')}</div>`).join('')}
          ${d.zainteresowania?`<div style="background:#fff;padding:12px;border-radius:6px;box-shadow:0 1px 6px rgba(30,64,175,0.06)"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">${L("interests")}</div><div style="font-size:12px;color:#555;line-height:1.6">${d.zainteresowania}</div></div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:8px;margin-top:auto">${L("consent")}</div>
    </div>`;


  // ── SHIELD (ciemna sidebar z trójkątem wyciętym) ──────────
  if (tpl === 'shield') return `
    <div style="font-family:Arial,sans-serif;background:#fff;min-height:842px;display:flex">
      <!-- Sidebar with arrow/shield cut -->
      <div style="width:215px;flex-shrink:0;position:relative;background:#1a2744;overflow:visible">
        <div style="background:#1a2744;min-height:842px;padding:28px 20px;display:flex;flex-direction:column;position:relative;z-index:1">
          <!-- Arrow-shaped cut at right edge -->
          <div style="position:absolute;top:0;right:-20px;bottom:0;width:40px;background:#fff;clip-path:polygon(50% 50%,0 0,0 100%);z-index:2"></div>
          ${d.zdjecie?`<div style="width:82px;height:82px;border-radius:50%;overflow:hidden;margin:0 auto 16px;border:3px solid rgba(255,255,255,0.25)">${photo}</div>`:''}
          <div style="font-size:16px;font-weight:700;color:#fff;text-align:center;line-height:1.2;margin-bottom:4px">${name}</div>
          ${d.stanowisko?`<div style="font-size:11px;color:rgba(255,255,255,0.55);text-align:center;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px">${d.stanowisko}</div>`:''}
          <div style="font-size:9.5px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px">${L("contact")}</div>
          ${[d.email,d.tel,d.adres].filter(Boolean).map(x=>`<div style="font-size:10.5px;color:rgba(255,255,255,0.7);margin-bottom:5px;word-break:break-all">${x}</div>`).join('')}
          ${skills.length?`<div style="font-size:9.5px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;margin:16px 0 8px">${L("skills")}</div>${skills.map(s=>`<div style="font-size:10.5px;color:rgba(255,255,255,0.7);margin-bottom:4px">· ${s}</div>`).join('')}`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="font-size:9.5px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;margin:16px 0 8px">${L("languages")}</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:10.5px;color:rgba(255,255,255,0.7);margin-bottom:4px">${l.jezyk} – ${l.poziom}</div>`).join('')}`:''}
        </div>
      </div>
      <!-- Main content -->
      <div style="flex:1;padding:30px 28px 28px 36px">
        ${d.podsumowanie?`<div style="margin-bottom:18px"><div style="font-size:13px;font-weight:700;color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:4px;margin-bottom:8px">${L("summary")}</div><div style="font-size:10px;line-height:1.75;color:#555">${d.podsumowanie}</div></div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:18px">
          <div style="font-size:13px;font-weight:700;color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:4px;margin-bottom:10px">${L("experience")}</div>
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
            <div style="margin-bottom:17px">
              <div style="font-size:11px;font-weight:700;color:#111">${e.stanowisko||''}, <span style="color:#1a2744">${e.firma||''}</span></div>
              <div style="font-size:10.5px;color:#aaa;margin-bottom:4px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
              ${e.opis?`<div style="font-size:10px;color:#555;line-height:1.7">${e.opis.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>`<div style="display:flex;gap:6px;margin-bottom:3px"><span style="color:#1a2744">•</span>${l}</div>`).join('')}</div>`:''}
            </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div>
          <div style="font-size:13px;font-weight:700;color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:4px;margin-bottom:10px">${L("education")}</div>
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
            <div style="margin-bottom:14px;display:flex;gap:10px">
              <div style="width:7px;height:7px;border-radius:50%;background:#1a2744;flex-shrink:0;margin-top:4px"></div>
              <div>
                <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
                <div style="font-size:12px;color:#555">${e.szkola}</div>
                <div style="font-size:10.5px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
              </div>
            </div>`).join('')}
        </div>`:''}
        ${certGroups.map(({label,items}) => `<div style="margin-top:14px"><div style="font-size:13px;font-weight:700;color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:4px;margin-bottom:8px">${label}</div>${items.map(c=>`<div style="font-size:12px;margin-bottom:4px;display:flex;align-items:center;gap:6px"><span style="width:5px;height:5px;border-radius:50%;background:#1a2744;flex-shrink:0;display:inline-block"></span>${c}</div>`).join('')}</div>`).join('')}
        ${d.zainteresowania?`<div style="margin-top:14px"><div style="font-size:13px;font-weight:700;color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:4px;margin-bottom:8px">${L("interests")}</div><div style="font-size:12px;color:#555;line-height:1.6">${d.zainteresowania}</div></div>`:''}${renderCustomSections(c1, c2)}
        <div style="margin-top:16px;font-size:9px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:8px;text-align:center">${L("consent")}</div>
      </div>
    </div>`;

  // ── METRO (ciemny header, single-column) ─────────────────────
  if (tpl === 'metro') return `
    <div style="font-family:Arial,sans-serif;background:#fff;min-height:842px;display:flex;flex-direction:column">
      <div style="background:#1a1a1a;padding:28px 36px 22px;flex-shrink:0">
        ${d.zdjecie?`<div style="width:72px;height:72px;border-radius:50%;overflow:hidden;margin-bottom:12px;border:2px solid rgba(255,255,255,0.15)">${photo}</div>`:''}
        <div style="font-size:30px;font-weight:800;color:#fff;letter-spacing:-0.5px;line-height:1.1">${name}</div>
        ${d.stanowisko?`<div style="font-size:14px;color:${c2};margin-top:6px">${d.stanowisko}</div>`:''}
        <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:10px">
          ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<span style="margin-right:16px">${x}</span>`).join('')}
        </div>
      </div>
      <div style="flex:1;padding:20px 36px 24px">
        ${d.podsumowanie?`
        <div style="margin-bottom:18px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:#1a1a1a;border-bottom:1.5px solid #1a1a1a;padding-bottom:3px;opacity:0.85;margin-bottom:8px">${L("summary")}</div>
          <div style="font-size:11px;color:#475569;line-height:1.75">${d.podsumowanie}</div>
        </div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:18px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:#1a1a1a;border-bottom:1.5px solid #1a1a1a;padding-bottom:3px;opacity:0.85;margin-bottom:12px">${L("experience")}</div>
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
              <div style="font-size:13px;font-weight:700;color:#1e293b">${e.firma||''}</div>
              <div style="font-size:10px;color:#94a3b8;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:11px;color:#1a1a1a;font-weight:600;margin-top:2px">${e.stanowisko||''}</div>
            ${e.opis?`<div style="font-size:12px;color:#475569;margin-top:5px;line-height:1.5">${e.opis}</div>`:''}
          </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div style="margin-bottom:18px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:#1a1a1a;border-bottom:1.5px solid #1a1a1a;padding-bottom:3px;opacity:0.85;margin-bottom:12px">${L("education")}</div>
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="font-size:13px;font-weight:700;color:#1e293b">${e.szkola}</div>
              <div style="font-size:10px;color:#94a3b8;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">${e.kierunek||''}</div>
          </div>`).join('')}
        </div>`:''}
        ${skills.length?`
        <div style="margin-bottom:16px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:#1a1a1a;border-bottom:1.5px solid #1a1a1a;padding-bottom:3px;opacity:0.85;margin-bottom:10px">${L("skills")}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${skills.map(s=>`<span style="font-size:11px;padding:3px 10px;background:rgba(0,0,0,0.06);color:#1e293b;border-radius:99px;font-weight:600">${s}</span>`).join('')}
          </div>
        </div>`:''}
        ${d.jezyki.some(l=>l.jezyk)?`
        <div style="margin-bottom:16px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:#1a1a1a;border-bottom:1.5px solid #1a1a1a;padding-bottom:3px;opacity:0.85;margin-bottom:10px">${L("languages")}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px 24px">
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<span style="font-size:10px;color:#1e293b;font-weight:600">${l.jezyk}<span style="color:#94a3b8;font-weight:400"> — ${l.poziom}</span></span>`).join('')}
          </div>
        </div>`:''}
        ${certGroups.map(({label,items})=>`
        <div style="margin-bottom:16px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:#1a1a1a;border-bottom:1.5px solid #1a1a1a;padding-bottom:3px;opacity:0.85;margin-bottom:10px">${label}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px 24px">
            ${items.map(c=>`<span style="font-size:10px;color:#444">${c}</span>`).join('')}
          </div>
        </div>`).join('')}
        ${d.zainteresowania?`
        <div style="margin-bottom:16px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:#1a1a1a;border-bottom:1.5px solid #1a1a1a;padding-bottom:3px;opacity:0.85;margin-bottom:10px">${L("interests")}</div>
          <div style="font-size:10px;color:#64748b;line-height:1.6">${d.zainteresowania}</div>
        </div>`:''}
        ${renderCustomSections(c1, c2)}
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:8px;border-top:1px solid #f0f0f0">${L("consent")}</div>
    </div>`;

  // ── NORDIC (Novorésumé Oslo: daty na lewo, elegancki) ─────
  if (tpl === 'nordic') return `
    <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif;background:#fff;min-height:842px;padding:40px 48px 32px">
      <div style="display:flex;align-items:flex-start;gap:18px;margin-bottom:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:32px;font-weight:800;color:#111;letter-spacing:-0.8px;line-height:1">${name}</div>
          ${d.stanowisko?`<div style="font-size:12px;color:${c1};font-weight:600;margin-top:6px">${d.stanowisko}</div>`:''}
        </div>
        ${d.zdjecie?`<div style="width:74px;height:74px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid #eee">${photo}</div>`:''}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:3px 14px;margin-top:9px">
        ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<span style="font-size:10.5px;color:#666">${x}</span>`).join('')}
      </div>
      <div style="height:2px;background:${c1};margin:14px 0 18px"></div>
      ${d.podsumowanie?`
      <div style="margin-bottom:20px;padding:13px 16px;background:${c1}0d;border-left:3px solid ${c1}">
        <div style="font-size:10px;line-height:1.78;color:#444;font-style:italic">${d.podsumowanie}</div>
      </div>`:''}
      ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:12px">${L("experience")}</div>
        ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
        <div style="margin-bottom:17px;display:grid;grid-template-columns:68px 1fr;gap:0 14px">
          <div style="padding-top:2px;text-align:right">
            <div style="font-size:9.5px;color:#aaa;line-height:1.5">${[e.od,e.do].filter(Boolean).join('\n')}</div>
          </div>
          <div style="border-left:2px solid ${c1}25;padding-left:12px">
            <div style="font-size:11px;font-weight:700;color:#111">${e.stanowisko||''}</div>
            <div style="font-size:12px;color:${c1};font-weight:600;margin-bottom:3px">${e.firma||''}</div>
            ${e.opis?`<div style="font-size:12px;color:#555;line-height:1.65">${e.opis}</div>`:''}
          </div>
        </div>`).join('')}
      </div>`:''}
      ${d.wyksztalcenie.some(e=>e.szkola)?`
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:12px">${L("education")}</div>
        ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
        <div style="margin-bottom:14px;display:grid;grid-template-columns:68px 1fr;gap:0 14px">
          <div style="padding-top:2px;text-align:right">
            <div style="font-size:9.5px;color:#aaa;line-height:1.5">${[e.od,e.do].filter(Boolean).join('\n')}</div>
          </div>
          <div style="border-left:2px solid ${c1}25;padding-left:12px">
            <div style="font-size:11px;font-weight:700;color:#111">${e.kierunek||''}</div>
            <div style="font-size:12px;color:#555">${e.szkola}</div>
          </div>
        </div>`).join('')}
      </div>`:''}
      <div style="height:1px;background:#eee;margin-bottom:16px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 28px">
        ${skills.length?`
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:10px">${L("skills")}</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${skills.map(s=>`<span style="font-size:11px;padding:3px 9px;background:${c1}12;color:${c1};border-radius:3px">${s}</span>`).join('')}
          </div>
        </div>`:''}
        ${d.jezyki.some(l=>l.jezyk)?`
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:10px">${L("languages")}</div>
          ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:12px;color:#444;margin-bottom:4px">${l.jezyk}<span style="color:#aaa"> – ${l.poziom}</span></div>`).join('')}
        </div>`:''}
        ${certGroups.map(({label,items}) => `<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:8px">${label}</div><div style="display:flex;flex-wrap:wrap;gap:5px">${items.map(c=>`<span style="font-size:11px;padding:3px 9px;background:#f5f5f5;color:#555;border-radius:3px">${c}</span>`).join('')}</div></div>`).join('')}
        ${d.zainteresowania?`
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:8px">${L("interests")}</div>
          <div style="font-size:12px;color:#555;line-height:1.65">${d.zainteresowania}</div>
        </div>`:''}
      </div>${renderCustomSections(c1, c2)}
      <div style="text-align:center;font-size:9px;color:#ccc;padding:12px 0 0;border-top:1px solid #eee;margin-top:6px">${L("consent")}</div>
    </div>`;

  // ── CASCADE (dark sidebar, styl Resume.io) ──────────────────
  if (tpl === 'cascade') {
    const sb = cvSidebarSections;
    const sbHdr = (lbl) => `<div style="font-size:9.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:rgba(255,255,255,0.55);margin-top:18px;margin-bottom:6px;border-bottom:1.5px solid rgba(255,255,255,0.55);padding-bottom:3px">${lbl}</div>`;
    const mnHdr = (lbl) => `<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:4px;margin-bottom:10px;opacity:0.85">${lbl}</div>`;
    const skillsInSb = sb.has('umiejetnosci') && skills.length;
    const jezykiInSb = sb.has('jezyki') && d.jezyki.some(l=>l.jezyk);
    const intInSb    = sb.has('zainteresowania') && d.zainteresowania;
    return `
    <div style="font-family:Arial,sans-serif;display:flex;min-height:842px;background:#fff">
      <div style="width:220px;flex-shrink:0;background:${c1};padding:28px 20px 24px;overflow:hidden;display:flex;flex-direction:column;">
        ${d.zdjecie?`<div style="width:64px;height:64px;border-radius:50%;overflow:hidden;margin-bottom:14px;border:3px solid rgba(255,255,255,0.25)">${photo}</div>`:`<div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.2);margin-bottom:16px"></div>`}
        <div style="font-size:18px;font-weight:800;color:#fff;line-height:1.2;word-break:break-word">${name}</div>
        ${d.stanowisko?`<div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:5px;word-break:break-word">${d.stanowisko}</div>`:''}
        ${sbHdr(L("contact"))}
        <div style="font-size:12px;color:rgba(255,255,255,0.9);line-height:1.7">${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).join('<br>')}</div>
        ${skillsInSb?`${sbHdr(L("skills"))}<div style="display:flex;flex-wrap:wrap;gap:4px">${skills.map(s=>`<span style="font-size:9.5px;padding:2px 8px;background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.9);border-radius:99px;font-weight:600">${s}</span>`).join('')}</div>`:''}
        ${jezykiInSb?`${sbHdr(L("languages"))}<div style="font-size:12px;color:rgba(255,255,255,0.9);line-height:1.7">${d.jezyki.filter(l=>l.jezyk).map(l=>`${l.jezyk} — ${l.poziom}`).join('<br>')}</div>`:''}
        ${certGroups.filter(cg=>sb.has(cg.key)).map(({label:lbl,items})=>`${sbHdr(lbl)}<div style="font-size:12px;color:rgba(255,255,255,0.9);line-height:1.7">${items.join('<br>')}</div>`).join('')}
        ${intInSb?`${sbHdr(L("interests"))}<div style="font-size:12px;color:rgba(255,255,255,0.9);line-height:1.65">${d.zainteresowania}</div>`:''}
        ${(typeof cvCustomSections!=='undefined'?cvCustomSections:[]).filter(s=>sb.has('custom-'+s.id)&&(s.title||s.content)).map(s=>`${sbHdr(s.title||'')}<div style="font-size:12px;color:rgba(255,255,255,0.9);line-height:1.65">${s.content}</div>`).join('')}
      </div>
      <div style="flex:1;padding:28px 24px 20px;display:flex;flex-direction:column;min-width:0">
        ${d.podsumowanie?`
        <div style="margin-bottom:18px">
          ${mnHdr(L("profile"))}
          <div style="font-size:12px;line-height:1.75;color:#475569">${d.podsumowanie}</div>
        </div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:18px">
          ${mnHdr(L("experience"))}
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
              <div style="font-size:11px;font-weight:700;color:#1e293b">${e.firma||''}</div>
              <div style="font-size:11px;color:#94a3b8;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:12px;color:${c1};font-weight:600;margin-top:2px">${e.stanowisko||''}</div>
            ${e.opis?`<div style="font-size:12px;color:#475569;margin-top:4px;line-height:1.6">${e.opis}</div>`:''}
          </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div style="margin-bottom:18px">
          ${mnHdr(L("education"))}
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
          <div style="margin-bottom:13px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="font-size:11px;font-weight:700;color:#1e293b">${e.szkola}</div>
              <div style="font-size:11px;color:#94a3b8;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">${e.kierunek||''}</div>
          </div>`).join('')}
        </div>`:''}
        ${!skillsInSb&&skills.length?`<div style="margin-bottom:16px">${mnHdr(L("skills"))}<div style="display:flex;flex-wrap:wrap;gap:5px">${skills.map(s=>`<span style="font-size:11px;padding:3px 10px;background:rgba(0,0,0,0.06);color:#1e293b;border-radius:99px;font-weight:600">${s}</span>`).join('')}</div></div>`:''}
        ${!jezykiInSb&&d.jezyki.some(l=>l.jezyk)?`<div style="margin-bottom:16px">${mnHdr(L("languages"))}<div style="display:flex;flex-wrap:wrap;gap:6px 24px">${d.jezyki.filter(l=>l.jezyk).map(l=>`<span style="font-size:12px;color:#1e293b;font-weight:600">${l.jezyk}<span style="color:#94a3b8;font-weight:400"> — ${l.poziom}</span></span>`).join('')}</div></div>`:''}
        ${certGroups.filter(cg=>!sb.has(cg.key)).map(({label:lbl,items})=>`<div style="margin-bottom:16px">${mnHdr(lbl)}<div style="display:flex;flex-wrap:wrap;gap:6px 24px">${items.map(c=>`<span style="font-size:10.5px;color:#444">${c}</span>`).join('')}</div></div>`).join('')}
        ${!intInSb&&d.zainteresowania?`<div style="margin-bottom:16px">${mnHdr(L("interests"))}<div style="font-size:12px;color:#64748b;line-height:1.6">${d.zainteresowania}</div></div>`:''}
        ${(typeof cvCustomSections!=='undefined'?cvCustomSections:[]).filter(s=>!sb.has('custom-'+s.id)&&(s.title||s.content)).map(s=>`<div style="margin-bottom:16px">${mnHdr(s.title||'')}<div style="font-size:12px;color:#555;line-height:1.65">${s.content}</div></div>`).join('')}
        <div style="margin-top:auto;font-size:9px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:8px;text-align:center">${L("consent")}</div>
      </div>
    </div>`;
  }

  // ── NOVA (czysty single-column, resume.io style) ─────────
  if (tpl === 'nova') return `
    <div style="font-family:Arial,sans-serif;background:#fff;min-height:842px">
      <div style="padding:36px 48px 22px;border-bottom:3px solid ${c1}">
        <div style="display:flex;align-items:flex-start;gap:20px">
          <div style="flex:1;min-width:0">
            <div style="font-size:30px;font-weight:800;color:#111;letter-spacing:-0.5px;line-height:1.05">${name}</div>
            ${d.stanowisko?`<div style="font-size:12px;color:${c1};font-weight:600;margin-top:5px;letter-spacing:0.2px">${d.stanowisko}</div>`:''}
            <div style="display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:11px">
              ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<span style="font-size:10.5px;color:#64748b">${x}</span>`).join('')}
            </div>
          </div>
          ${d.zdjecie?`<div style="width:78px;height:78px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid #eee">${photo}</div>`:''}
        </div>
      </div>
      <div style="padding:22px 48px 28px">
        ${d.podsumowanie?`
        <div style="margin-bottom:20px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:8px;border-bottom:1.5px solid ${c1};padding-bottom:4px;opacity:0.85">${L("summary")}</div>
          <div style="font-size:12px;line-height:1.75;color:#475569">${d.podsumowanie}</div>
        </div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:20px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:12px;border-bottom:1.5px solid ${c1};padding-bottom:4px;opacity:0.85">${L("experience")}</div>
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
              <div style="font-size:11.5px;font-weight:700;color:#1e293b">${e.firma||''}</div>
              <div style="font-size:10.5px;color:#94a3b8;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:10px;color:${c1};font-weight:600;margin-top:2px">${e.stanowisko||''}</div>
            ${e.opis?`<div style="font-size:12px;color:#475569;margin-top:5px;line-height:1.5">${e.opis}</div>`:''}
          </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div style="margin-bottom:20px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:12px;border-bottom:1.5px solid ${c1};padding-bottom:4px;opacity:0.85">${L("education")}</div>
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="font-size:11.5px;font-weight:700;color:#1e293b">${e.szkola}</div>
              <div style="font-size:10.5px;color:#94a3b8;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:10px;color:#64748b;margin-top:2px">${e.kierunek||''}</div>
          </div>`).join('')}
        </div>`:''}
        ${skills.length?`
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:10px;border-bottom:1.5px solid ${c1};padding-bottom:4px;opacity:0.85">${L("skills")}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${skills.map(s=>`<span style="font-size:11px;padding:3px 10px;background:rgba(0,0,0,0.06);color:#1e293b;border-radius:99px;font-weight:600">${s}</span>`).join('')}
          </div>
        </div>`:''}
        ${d.jezyki.some(l=>l.jezyk)?`
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:10px;border-bottom:1.5px solid ${c1};padding-bottom:4px;opacity:0.85">${L("languages")}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px 24px">
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<span style="font-size:12px;color:#1e293b;font-weight:600">${l.jezyk}<span style="color:#94a3b8;font-weight:400"> — ${l.poziom}</span></span>`).join('')}
          </div>
        </div>`:''}
        ${certGroups.map(({label,items}) => `
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:10px;border-bottom:1.5px solid ${c1};padding-bottom:4px;opacity:0.85">${label}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px 24px">
            ${items.map(c=>`<span style="font-size:10.5px;color:#444">${c}</span>`).join('')}
          </div>
        </div>`).join('')}
        ${d.zainteresowania?`
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:10px;border-bottom:1.5px solid ${c1};padding-bottom:4px;opacity:0.85">${L("interests")}</div>
          <div style="font-size:12px;color:#64748b;line-height:1.6">${d.zainteresowania}</div>
        </div>`:''}
        ${renderCustomSections(c1, c2)}
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:8px;border-top:1px solid #f0f0f0">${L("consent")}</div>
    </div>`;

  // ── EXECUTIVE ─────────────────────────────────────────────
  if (tpl === 'executive') return `
    <div style="font-family:Georgia,serif;background:#fff;min-height:842px;display:flex;flex-direction:column">
      <div style="padding:32px 40px 0">
        <div style="display:flex;align-items:flex-start;gap:16px">
          <div style="flex:1;min-width:0">
            <div style="font-size:30px;font-weight:700;color:#0a0a0a;letter-spacing:-0.5px;line-height:1.1">${name}</div>
            ${d.stanowisko?`<div style="font-size:12px;color:${c2};font-weight:600;margin-top:6px;letter-spacing:0.05em;text-transform:uppercase">${d.stanowisko}</div>`:''}
          </div>
          ${d.zdjecie?`<div style="width:72px;height:72px;border-radius:50%;overflow:hidden;flex-shrink:0;border:1px solid #ddd">${photo}</div>`:''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px 16px;padding:10px 0;border-top:1px solid #ddd;border-bottom:3px solid ${c1};margin-top:12px;font-size:10px;color:#666">
          ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<span>${x}</span>`).join('')}
        </div>
      </div>
      <div style="flex:1;padding:20px 40px 24px">
        ${d.podsumowanie?`
        <div style="margin-bottom:18px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c2};border-bottom:1.5px solid ${c2};padding-bottom:3px;opacity:0.85;margin-bottom:8px">${L("summary")}</div>
          <div style="font-size:12px;line-height:1.85;color:#444">${d.podsumowanie}</div>
        </div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:18px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c2};border-bottom:1.5px solid ${c2};padding-bottom:3px;opacity:0.85;margin-bottom:12px">${L("experience")}</div>
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
              <div style="font-size:13px;font-weight:700;color:#0a0a0a">${e.firma||''}</div>
              <div style="font-size:10.5px;color:#999;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:11px;color:${c2};font-weight:600;margin-top:2px">${e.stanowisko||''}</div>
            ${e.opis?`<div style="font-size:10px;color:#555;line-height:1.75;margin-top:4px">${e.opis}</div>`:''}
          </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div style="margin-bottom:18px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c2};border-bottom:1.5px solid ${c2};padding-bottom:3px;opacity:0.85;margin-bottom:12px">${L("education")}</div>
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="font-size:13px;font-weight:700;color:#0a0a0a">${e.szkola}</div>
              <div style="font-size:10.5px;color:#999;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:10px;color:#666;margin-top:2px">${e.kierunek||''}</div>
          </div>`).join('')}
        </div>`:''}
        ${skills.length?`
        <div style="margin-bottom:16px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c2};border-bottom:1.5px solid ${c2};padding-bottom:3px;opacity:0.85;margin-bottom:10px">${L("skills")}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${skills.map(s=>`<span style="display:inline-block;background:rgba(0,0,0,0.06);color:#1e293b;font-size:10.5px;font-weight:600;padding:3px 10px;border-radius:99px">${s}</span>`).join('')}
          </div>
        </div>`:''}
        ${d.jezyki.some(l=>l.jezyk)?`
        <div style="margin-bottom:16px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c2};border-bottom:1.5px solid ${c2};padding-bottom:3px;opacity:0.85;margin-bottom:10px">${L("languages")}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px 24px">
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<span style="font-size:10px;color:#1e293b;font-weight:600">${l.jezyk}<span style="color:#999;font-weight:400"> — ${l.poziom}</span></span>`).join('')}
          </div>
        </div>`:''}
        ${certGroups.map(({label,items})=>`
        <div style="margin-bottom:16px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c2};border-bottom:1.5px solid ${c2};padding-bottom:3px;opacity:0.85;margin-bottom:10px">${label}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px 24px">
            ${items.map(c=>`<span style="font-size:10px;color:#444">${c}</span>`).join('')}
          </div>
        </div>`).join('')}
        ${d.zainteresowania?`
        <div style="margin-bottom:16px">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c2};border-bottom:1.5px solid ${c2};padding-bottom:3px;opacity:0.85;margin-bottom:10px">${L("interests")}</div>
          <div style="font-size:10px;color:#666;line-height:1.65">${d.zainteresowania}</div>
        </div>`:''}
        ${renderCustomSections(c1, c2)}
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:8px;border-top:1px solid #eee;font-family:Georgia,serif">${L("consent")}</div>
    </div>`;

  // ── ATHENS ────────────────────────────────────────────────
  if (tpl === 'athens') {
    const sb = cvSidebarSections;
    const sbHdr = (lbl) => `<div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:#64748b;border-bottom:1.5px solid #64748b;padding-bottom:3px;opacity:0.85;margin-bottom:6px;margin-top:16px">${lbl}</div>`;
    const mnHdr = (lbl) => `<div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:3px;opacity:0.85;margin-bottom:10px">${lbl}</div>`;
    const skillsInSb = sb.has('umiejetnosci') && skills.length;
    const jezykiInSb = sb.has('jezyki') && d.jezyki.some(l=>l.jezyk);
    const intInSb = sb.has('zainteresowania') && d.zainteresowania;
    return `
    <div style="font-family:Arial,sans-serif;background:#fff;min-height:842px;display:flex;flex-direction:column">
      <div style="background:${c1};padding:26px 32px 22px;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:16px">
          ${d.zdjecie?`<div style="width:68px;height:68px;border-radius:50%;overflow:hidden;flex-shrink:0;border:3px solid rgba(255,255,255,0.25)">${photo}</div>`:''}
          <div style="flex:1;min-width:0">
            <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px;line-height:1.1">${name}</div>
            ${d.stanowisko?`<div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:5px">${d.stanowisko}</div>`:''}
            <div style="margin-top:8px;font-size:10px;color:rgba(255,255,255,0.6)">
              ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<span style="margin-right:14px">${x}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
      <div style="display:flex;flex:1">
        <div style="width:34%;background:#eff6ff;padding:16px 18px 24px;flex-shrink:0;overflow:hidden">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:#64748b;border-bottom:1.5px solid #64748b;padding-bottom:3px;opacity:0.85;margin-bottom:6px">${L("contact")}</div>
          <div style="font-size:12px;color:#1e293b;line-height:1.7">${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).join('<br>')}</div>
          ${skillsInSb?`${sbHdr(L("skills"))}<div style="display:flex;flex-wrap:wrap;gap:4px">${skills.map(s=>`<span style="font-size:9.5px;padding:2px 8px;background:rgba(0,0,0,0.07);color:#1e293b;border-radius:99px;font-weight:600">${s}</span>`).join('')}</div>`:''}
          ${jezykiInSb?`${sbHdr(L("languages"))}<div style="font-size:12px;color:#1e293b;line-height:1.7">${d.jezyki.filter(l=>l.jezyk).map(l=>`${l.jezyk} — ${l.poziom}`).join('<br>')}</div>`:''}
          ${certGroups.filter(cg=>sb.has(cg.key)).map(({label:lbl,items})=>`${sbHdr(lbl)}<div style="font-size:12px;color:#1e293b;line-height:1.7">${items.join('<br>')}</div>`).join('')}
          ${intInSb?`${sbHdr(L("interests"))}<div style="font-size:12px;color:#1e293b;line-height:1.65">${d.zainteresowania}</div>`:''}
          ${(typeof cvCustomSections!=='undefined'?cvCustomSections:[]).filter(s=>sb.has('custom-'+s.id)&&(s.title||s.content)).map(s=>`${sbHdr(s.title||'')}<div style="font-size:12px;color:#1e293b;line-height:1.65">${s.content}</div>`).join('')}
        </div>
        <div style="flex:1;padding:20px 22px 24px;min-width:0">
          ${d.podsumowanie?`
          <div style="margin-bottom:16px">
            ${mnHdr(L("summary"))}
            <div style="font-size:12px;line-height:1.75;color:#475569">${d.podsumowanie}</div>
          </div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:16px">
            ${mnHdr(L("experience"))}
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
            <div style="margin-bottom:13px">
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
                <div style="font-size:11.5px;font-weight:700;color:#1e293b">${e.firma||''}</div>
                <div style="font-size:10.5px;color:#94a3b8;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
              </div>
              <div style="font-size:10px;color:${c1};font-weight:600;margin-top:2px">${e.stanowisko||''}</div>
              ${e.opis?`<div style="font-size:12px;color:#475569;margin-top:4px;line-height:1.6">${e.opis}</div>`:''}
            </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div style="margin-bottom:16px">
            ${mnHdr(L("education"))}
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
            <div style="margin-bottom:11px">
              <div style="display:flex;justify-content:space-between;gap:8px">
                <div style="font-size:11.5px;font-weight:700;color:#1e293b">${e.szkola}</div>
                <div style="font-size:10.5px;color:#94a3b8;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
              </div>
              <div style="font-size:10px;color:#64748b;margin-top:2px">${e.kierunek||''}</div>
            </div>`).join('')}
          </div>`:''}
          ${!skillsInSb&&skills.length?`<div style="margin-bottom:14px">${mnHdr(L("skills"))}<div style="display:flex;flex-wrap:wrap;gap:4px">${skills.map(s=>`<span style="font-size:11px;padding:3px 10px;background:rgba(0,0,0,0.06);color:#1e293b;border-radius:99px;font-weight:600">${s}</span>`).join('')}</div></div>`:''}
          ${!jezykiInSb&&d.jezyki.some(l=>l.jezyk)?`<div style="margin-bottom:14px">${mnHdr(L("languages"))}<div style="display:flex;flex-wrap:wrap;gap:6px 24px">${d.jezyki.filter(l=>l.jezyk).map(l=>`<span style="font-size:12px;color:#1e293b;font-weight:600">${l.jezyk}<span style="color:#94a3b8;font-weight:400"> — ${l.poziom}</span></span>`).join('')}</div></div>`:''}
          ${certGroups.filter(cg=>!sb.has(cg.key)).map(({label:lbl,items})=>`<div style="margin-bottom:14px">${mnHdr(lbl)}<div style="display:flex;flex-wrap:wrap;gap:6px 24px">${items.map(c=>`<span style="font-size:10.5px;color:#444">${c}</span>`).join('')}</div></div>`).join('')}
          ${!intInSb&&d.zainteresowania?`<div style="margin-bottom:14px">${mnHdr(L("interests"))}<div style="font-size:12px;color:#64748b;line-height:1.6">${d.zainteresowania}</div></div>`:''}
          ${(typeof cvCustomSections!=='undefined'?cvCustomSections:[]).filter(s=>!sb.has('custom-'+s.id)&&(s.title||s.content)).map(s=>`<div style="margin-bottom:14px">${mnHdr(s.title||'')}<div style="font-size:12px;color:#555;line-height:1.65">${s.content}</div></div>`).join('')}
        </div>
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:8px;border-top:1px solid #f0f0f0">${L("consent")}</div>
    </div>`;
  }

  // ── MATRIX ────────────────────────────────────────────────
  if (tpl === 'matrix') {
    const mhdr = (lbl) => `<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${c1};border-bottom:1.5px solid ${c1};padding-bottom:4px;margin-bottom:10px;opacity:0.9">${lbl}</div>`;
    return `
    <div style="font-family:'Courier New',Courier,monospace;background:#0d1117;min-height:842px;display:flex;flex-direction:column">
      <div style="padding:28px 32px 22px;background:#0d1117;flex-shrink:0">
        <div style="font-size:30px;font-weight:800;color:${c1};letter-spacing:-0.03em;line-height:1.1">${name}</div>
        ${d.stanowisko?`<div style="font-size:14px;color:rgba(0,255,136,0.65);margin-top:6px">${d.stanowisko}</div>`:''}
        <div style="height:1px;background:rgba(0,255,136,0.15);margin:14px 0 10px"></div>
        <div style="display:flex;flex-wrap:wrap;gap:3px 18px;font-size:10.5px;color:rgba(0,255,136,0.45)">
          ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<span>${x}</span>`).join('')}
        </div>
      </div>
      <div style="flex:1;padding:0 32px 24px;background:#0d1117">
        ${d.podsumowanie?`
        <div style="margin-bottom:18px">
          ${mhdr(L("profile"))}
          <div style="font-size:12px;line-height:1.75;color:rgba(255,255,255,0.55)">${d.podsumowanie}</div>
        </div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:18px">
          ${mhdr(L("experience"))}
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
          <div style="margin-bottom:15px;padding-left:12px;border-left:2px solid ${c1}">
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.9)">${e.firma||''}</div>
            <div style="font-size:12px;color:${c1};margin-top:2px">${e.stanowisko||''}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.3);margin:3px 0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            ${e.opis?`<div style="font-size:10.5px;color:rgba(255,255,255,0.45);line-height:1.65">${e.opis}</div>`:''}
          </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div style="margin-bottom:18px">
          ${mhdr(L("education"))}
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
          <div style="margin-bottom:11px;padding-left:12px;border-left:2px solid rgba(0,255,136,0.25)">
            <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.85)">${e.szkola}</div>
            <div style="font-size:10.5px;color:rgba(255,255,255,0.45)">${e.kierunek||''}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.25)">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
          </div>`).join('')}
        </div>`:''}
        ${skills.length?`
        <div style="margin-bottom:18px">
          ${mhdr(L("skills"))}
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${skills.map(s=>`<span style="font-size:11px;color:rgba(255,255,255,0.6);padding:3px 8px;background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.2)">&gt; ${s}</span>`).join('')}
          </div>
        </div>`:''}
        ${d.jezyki.some(l=>l.jezyk)?`
        <div style="margin-bottom:18px">
          ${mhdr(L("languages"))}
          <div style="display:flex;flex-wrap:wrap;gap:8px 18px">
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:11px"><span style="color:${c1}">${l.jezyk}</span>${l.poziom?`<span style="color:rgba(255,255,255,0.3);margin-left:5px">${l.poziom}</span>`:''}</div>`).join('')}
          </div>
        </div>`:''}
        ${certGroups.map(({label,items})=>`
        <div style="margin-bottom:18px">
          ${mhdr(label)}
          ${items.map(c=>`<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px;padding-left:8px"># ${c}</div>`).join('')}
        </div>`).join('')}
        ${d.zainteresowania?`
        <div style="margin-bottom:18px">
          ${mhdr(L("interests"))}
          <div style="font-size:11px;color:rgba(255,255,255,0.5);line-height:1.65">${d.zainteresowania}</div>
        </div>`:''}
        ${renderCustomSections(c1, c2)}
      </div>
      <div style="text-align:center;font-size:8px;color:#21262d;padding:10px;border-top:1px solid #21262d">${L("consent")}</div>
    </div>`;
  }

  // ── PRISM ─────────────────────────────────────────────────
  if (tpl === 'prism') {
    const phdr = (lbl, mt=18) => `<div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c1};margin-top:${mt}px;margin-bottom:6px;border-bottom:1.5px solid ${c1};padding-bottom:3px;opacity:0.85">${lbl}</div>`;
    return `
    <div style="font-family:Arial,sans-serif;background:#fff;min-height:842px;display:flex;flex-direction:column">
      <div style="background:linear-gradient(135deg,${c1},${c2});padding:28px 32px 22px;flex-shrink:0">
        <div style="font-size:30px;font-weight:800;color:#fff;letter-spacing:-0.03em;line-height:1.1">${name}</div>
        ${d.stanowisko?`<div style="font-size:14px;color:rgba(255,255,255,0.75);margin-top:6px">${d.stanowisko}</div>`:''}
        <div style="display:flex;flex-wrap:wrap;gap:3px 18px;margin-top:10px;font-size:10.5px;color:rgba(255,255,255,0.6)">
          ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<span>${x}</span>`).join('')}
        </div>
      </div>
      <div style="flex:1;padding:0 32px 24px">
        ${d.podsumowanie?`
        <div>
          ${phdr(L("profile"),18)}
          <div style="font-size:12px;line-height:1.75;color:#475569;margin-bottom:4px">${d.podsumowanie}</div>
        </div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div>
          ${phdr(L("experience"))}
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <div style="font-size:11.5px;font-weight:700;color:#1e293b">${e.firma||''}</div>
              <div style="font-size:11px;color:#94a3b8;flex-shrink:0;margin-left:8px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:10px;color:${c1};font-weight:600;margin-top:2px">${e.stanowisko||''}</div>
            ${e.opis?`<div style="font-size:12px;color:#475569;margin-top:5px;line-height:1.5">${e.opis}</div>`:''}
          </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div>
          ${phdr(L("education"))}
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
          <div style="margin-bottom:12px">
            <div style="font-size:11.5px;font-weight:700;color:#1e293b">${e.szkola}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">${[e.kierunek,([e.od,e.do].filter(Boolean).join(' – '))].filter(Boolean).join(' · ')}</div>
          </div>`).join('')}
        </div>`:''}
        ${skills.length?`
        <div>
          ${phdr(L("skills"))}
          <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px">
            ${skills.map(s=>`<span style="display:inline-block;background:rgba(0,0,0,0.06);color:#1e293b;font-size:11px;font-weight:600;padding:4px 10px;border-radius:99px">${s}</span>`).join('')}
          </div>
        </div>`:''}
        ${d.jezyki.some(l=>l.jezyk)?`
        <div>
          ${phdr(L("languages"))}
          <div style="display:flex;gap:20px;font-size:10.5px;color:#1e293b;flex-wrap:wrap">
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<span><b>${l.jezyk}</b>${l.poziom?` — ${l.poziom}`:''}</span>`).join('')}
          </div>
        </div>`:''}
        ${certGroups.map(({label,items})=>`
        <div>
          ${phdr(label)}
          ${items.map(c=>`<div style="font-size:10.5px;color:#475569;margin-bottom:3px">${c}</div>`).join('')}
        </div>`).join('')}
        ${d.zainteresowania?`
        <div>
          ${phdr(L("interests"))}
          <div style="font-size:10.5px;color:#475569;line-height:1.65">${d.zainteresowania}</div>
        </div>`:''}
        ${renderCustomSections(c1, c2)}
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:10px;border-top:1px solid #eee">${L("consent")}</div>
    </div>`;
  }

  // ── LINEN ─────────────────────────────────────────────────
  if (tpl === 'linen') {
    const lhdr = (lbl, mt=18) => `<div style="font-size:10.5px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:${c1};margin-top:${mt}px;margin-bottom:6px;border-bottom:1.5px solid ${c1};padding-bottom:3px;opacity:0.85">${lbl}</div>`;
    return `
    <div style="font-family:Arial,sans-serif;background:#fef9f0;min-height:842px;display:flex;flex-direction:column">
      <div style="background:#fef9f0;padding:28px 32px 18px;border-bottom:2px solid #fde8b0;flex-shrink:0">
        <div style="font-size:30px;font-weight:800;color:${c1};letter-spacing:-0.03em;line-height:1.1">${name}</div>
        ${d.stanowisko?`<div style="font-size:14px;color:${c2};margin-top:5px">${d.stanowisko}</div>`:''}
        <div style="display:flex;flex-wrap:wrap;gap:3px 18px;margin-top:10px;font-size:10.5px;color:${c1};opacity:0.7">
          ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<span>${x}</span>`).join('')}
        </div>
      </div>
      <div style="flex:1;padding:0 32px 24px;background:#fef9f0">
        ${d.podsumowanie?`
        <div>
          ${lhdr(L("profile"),18)}
          <div style="font-size:12px;line-height:1.75;color:#475569;margin-bottom:4px">${d.podsumowanie}</div>
        </div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div>
          ${lhdr(L("experience"))}
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <div style="font-size:11.5px;font-weight:700;color:#1e293b">${e.firma||''}</div>
              <div style="font-size:11px;color:#94a3b8;flex-shrink:0;margin-left:8px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:10px;color:${c1};font-weight:600;margin-top:2px">${e.stanowisko||''}</div>
            ${e.opis?`<div style="font-size:12px;color:#57534e;margin-top:5px;line-height:1.5">${e.opis}</div>`:''}
          </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div>
          ${lhdr(L("education"))}
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
          <div style="margin-bottom:12px">
            <div style="font-size:11.5px;font-weight:700;color:#1e293b">${e.szkola}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">${[e.kierunek,([e.od,e.do].filter(Boolean).join(' – '))].filter(Boolean).join(' · ')}</div>
          </div>`).join('')}
        </div>`:''}
        ${skills.length?`
        <div>
          ${lhdr(L("skills"))}
          <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px">
            ${skills.map(s=>`<span style="display:inline-block;background:rgba(0,0,0,0.06);color:#1e293b;font-size:11px;font-weight:600;padding:4px 10px;border-radius:99px">${s}</span>`).join('')}
          </div>
        </div>`:''}
        ${d.jezyki.some(l=>l.jezyk)?`
        <div>
          ${lhdr(L("languages"))}
          <div style="display:flex;gap:20px;font-size:10.5px;color:#1e293b;flex-wrap:wrap">
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<span><b>${l.jezyk}</b>${l.poziom?` — ${l.poziom}`:''}</span>`).join('')}
          </div>
        </div>`:''}
        ${certGroups.map(({label,items})=>`
        <div>
          ${lhdr(label)}
          ${items.map(c=>`<div style="font-size:10.5px;color:#57534e;margin-bottom:3px">${c}</div>`).join('')}
        </div>`).join('')}
        ${d.zainteresowania?`
        <div>
          ${lhdr(L("interests"))}
          <div style="font-size:10.5px;color:#57534e;line-height:1.65">${d.zainteresowania}</div>
        </div>`:''}
        ${renderCustomSections(c1, c2)}
      </div>
      <div style="text-align:center;font-size:9px;color:#c8c4c0;padding:10px;border-top:1px solid #e7e5e4">${L("consent")}</div>
    </div>`;
  }

  // ── OXFORD ────────────────────────────────────────────────
  if (tpl === 'oxford') {
    const sb = cvSidebarSections;
    const skillsInSb = sb.has('umiejetnosci') && skills.length;
    const jezykiInSb = sb.has('jezyki') && d.jezyki.some(l=>l.jezyk);
    const intInSb    = sb.has('zainteresowania') && d.zainteresowania;
    const customSects = (typeof cvCustomSections!=='undefined'?cvCustomSections:[]).filter(s=>s.title||s.content);
    // Unified section header: border-left style, bigger font, same everywhere
    const sh = (lbl) => `<div style="font-size:9.5px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:${c1};padding-left:9px;border-left:3px solid ${c1};margin-bottom:10px">${lbl}</div>`;
    const sbLabel = (lbl) => `<div style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.18em;color:rgba(255,255,255,0.85);padding-left:9px;border-left:3px solid rgba(255,255,255,0.38);margin-bottom:8px">${lbl}</div>`;
    return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#fff;min-height:842px;max-height:842px;overflow:hidden;display:flex;width:595px;box-sizing:border-box">
      <!-- SIDEBAR ~32% -->
      <div style="width:190px;flex-shrink:0;background:${c1};padding:26px 16px 24px;display:flex;flex-direction:column;overflow:hidden">
        <div style="width:72px;height:72px;border-radius:50%;overflow:hidden;margin:0 auto 13px;background:rgba(255,255,255,0.12);flex-shrink:0;border:2.5px solid rgba(255,255,255,0.2)">
          ${d.zdjecie?`<img src="${d.zdjecie}" alt="" style="width:100%;height:100%;object-fit:cover">`:
          `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>`}
        </div>
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:13.5px;font-weight:800;color:#fff;line-height:1.2;word-break:break-word">${name}</div>
          ${d.stanowisko?`<div style="font-size:9.5px;color:${c2};margin-top:5px;font-weight:600">${d.stanowisko}</div>`:''}
        </div>
        <div style="height:1px;background:rgba(255,255,255,0.12);margin-bottom:14px;flex-shrink:0"></div>
        ${sbLabel('Kontakt')}
        <div style="margin-bottom:16px">
          ${d.email?`<div style="font-size:8.5px;color:rgba(255,255,255,0.82);margin-bottom:5px;word-break:break-all">✉ ${d.email}</div>`:''}
          ${d.tel?`<div style="font-size:8.5px;color:rgba(255,255,255,0.82);margin-bottom:5px">📞 ${d.tel}</div>`:''}
          ${d.adres?`<div style="font-size:8.5px;color:rgba(255,255,255,0.82);margin-bottom:5px">📍 ${d.adres}</div>`:''}
          ${d.linkedin?`<div style="font-size:8.5px;color:rgba(255,255,255,0.82);word-break:break-all">🔗 ${d.linkedin}</div>`:''}
        </div>
        ${skillsInSb?`
        ${sbLabel(L("skills"))}
        <div style="margin-bottom:16px">
          ${skills.map(s=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px"><div style="width:4px;height:4px;border-radius:50%;background:${c2};flex-shrink:0"></div><div style="font-size:9px;color:rgba(255,255,255,0.88)">${s}</div></div>`).join('')}
        </div>`:''}
        ${jezykiInSb?`
        ${sbLabel(L("languages"))}
        <div style="margin-bottom:16px">
          ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="margin-bottom:7px"><div style="font-size:9.5px;font-weight:700;color:rgba(255,255,255,0.9)">${l.jezyk}</div><div style="font-size:8px;color:rgba(255,255,255,0.5)">${l.poziom}</div></div>`).join('')}
        </div>`:''}
        ${certGroups.filter(cg=>sb.has(cg.key)).map(({label,items})=>`
        ${sbLabel(label)}
        <div style="margin-bottom:14px">
          ${items.map(c=>`<div style="font-size:8.5px;color:rgba(255,255,255,0.8);margin-bottom:5px;line-height:1.4">${c}</div>`).join('')}
        </div>`).join('')}
        ${intInSb?`
        ${sbLabel(L("interests"))}
        <div style="font-size:8.5px;color:rgba(255,255,255,0.75);line-height:1.55;margin-bottom:14px">${d.zainteresowania}</div>`:''}
        ${customSects.filter(s=>sb.has('custom-'+s.id)).map(s=>`
        ${sbLabel(s.title||'')}
        <div style="font-size:8.5px;color:rgba(255,255,255,0.8);line-height:1.55;margin-bottom:14px">${s.content||''}</div>`).join('')}
      </div>
      <!-- MAIN ~68% -->
      <div style="flex:1;padding:26px 26px 24px 22px;min-width:0;overflow:hidden">
        ${d.podsumowanie?`
        <div style="margin-bottom:18px">
          ${sh(L("summary"))}
          <div style="font-size:11px;line-height:1.75;color:#444">${d.podsumowanie}</div>
        </div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:18px">
          ${sh(L("experience"))}
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
              <div style="font-size:11.5px;font-weight:700;color:#111">${e.firma||''}</div>
              <div style="font-size:9.5px;color:#aaa;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:10.5px;color:${c2};font-weight:600;margin-top:2px">${e.stanowisko||''}</div>
            ${e.opis?`<div style="font-size:10.5px;color:#555;line-height:1.6;margin-top:4px">${e.opis}</div>`:''}
          </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div style="margin-bottom:18px">
          ${sh(L("education"))}
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="font-size:11.5px;font-weight:700;color:#111">${e.szkola}</div>
              <div style="font-size:9.5px;color:#aaa;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
            </div>
            <div style="font-size:10px;color:#666;margin-top:2px">${e.kierunek||''}</div>
          </div>`).join('')}
        </div>`:''}
        ${!skillsInSb&&skills.length?`
        <div style="margin-bottom:18px">
          ${sh(L("skills"))}
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${skills.map(s=>`<span style="font-size:9.5px;padding:3px 9px;background:#f0f4f8;color:#222;border-radius:99px;font-weight:500">${s}</span>`).join('')}
          </div>
        </div>`:''}
        ${!jezykiInSb&&d.jezyki.some(l=>l.jezyk)?`
        <div style="margin-bottom:18px">
          ${sh(L("languages"))}
          ${d.jezyki.filter(l=>l.jezyk).map(l=>`
          <div style="margin-bottom:6px;display:flex;gap:8px;align-items:baseline">
            <span style="font-size:10.5px;font-weight:700;color:#111">${l.jezyk}</span>
            <span style="font-size:9px;color:#aaa">${l.poziom}</span>
          </div>`).join('')}
        </div>`:''}
        ${certGroups.filter(cg=>!sb.has(cg.key)).map(({label,items})=>`
        <div style="margin-bottom:18px">
          ${sh(label)}
          ${items.map(c=>`<div style="font-size:10.5px;color:#555;margin-bottom:4px;padding-left:9px;border-left:2px solid ${c1}33">${c}</div>`).join('')}
        </div>`).join('')}
        ${!intInSb&&d.zainteresowania?`
        <div style="margin-bottom:18px">
          ${sh(L("interests"))}
          <div style="font-size:11px;color:#555;line-height:1.65">${d.zainteresowania}</div>
        </div>`:''}
        ${customSects.filter(s=>!sb.has('custom-'+s.id)).map(s=>`
        <div style="margin-bottom:18px">
          ${sh(s.title||'')}
          <div style="font-size:11px;color:#555;line-height:1.65">${s.content||''}</div>
        </div>`).join('')}
      </div>
    </div>`;
  }

  // ── BIZNES (foto + dane w sidebarze, doświadczenie po prawej) ──
  if (tpl === 'biznes') {
    const sb = cvSidebarSections;
    const skillsInSb = sb.has('umiejetnosci') && skills.length;
    const jezykiInSb = sb.has('jezyki') && d.jezyki.some(l=>l.jezyk);
    const intInSb    = sb.has('zainteresowania') && d.zainteresowania;
    const customSects = (typeof cvCustomSections!=='undefined'?cvCustomSections:[]).filter(s=>s.title||s.content);
    const bIcon = (svgPath) => `<div style="width:18px;height:18px;border-radius:50%;background:${c1};flex-shrink:0;display:flex;align-items:center;justify-content:center"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg></div>`;
    const bHdr = (lbl, svgPath) => `<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">${bIcon(svgPath)}<div style="font-size:9.5px;font-weight:800;color:${c1};text-transform:uppercase;letter-spacing:0.09em">${lbl}</div></div><div style="height:1.5px;background:#dde3ed;margin-bottom:9px"></div>`;
    const bHdrSb = (lbl, svgPath) => `<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">${bIcon(svgPath)}<div style="font-size:9.5px;font-weight:800;color:${c1};text-transform:uppercase;letter-spacing:0.09em">${lbl}</div></div><div style="height:1.5px;background:#dde3ed;margin-bottom:9px"></div>`;
    const SVG_PERSON = '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>';
    const SVG_SHARE  = '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>';
    const SVG_KEY    = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';
    const SVG_GLOBE  = '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>';
    const SVG_BRIEF  = '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>';
    const SVG_GRAD   = '<path d="M22 10v6M2 10l10 5 10-5-10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>';
    const SVG_BOOK   = '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>';
    const SVG_STAR   = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';
    const certItemsSb = (items) => items.map(c=>{const p=c.split(' | ');const hasDt=p.length>1;const dt=hasDt?p[0]:'';const body=hasDt?p.slice(1).join(' | '):c;return `<div style="font-size:9px;color:#444;margin-bottom:5px;padding-left:8px;border-left:2px solid ${c2}"><span style="font-size:8px;color:#9ca3af">${dt}</span>${dt?'<br>':''}${body}</div>`;}).join('');
    const certItemsMn = (items) => items.map(c=>{const p=c.split(' | ');const hasDt=p.length>1;const dt=hasDt?p[0]:'';const body=hasDt?p.slice(1).join(' | '):c;return `<div style="display:grid;grid-template-columns:62px 1fr;gap:0 11px;margin-bottom:8px"><div style="padding-top:1px;text-align:right;font-size:8.5px;color:#9ca3af;line-height:1.6">${dt.replace(' – ','<br>')}</div><div style="border-left:2px solid ${c2};padding-left:10px"><div style="font-size:9.5px;color:#333;line-height:1.5">${body}</div></div></div>`;}).join('');
    return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#fff;height:842px;min-height:842px;max-height:842px;overflow:hidden;display:flex;width:595px;box-sizing:border-box">
      <!-- LEFT SIDEBAR 34% -->
      <div style="width:34%;flex-shrink:0;background:#f5f7fa;border-right:1.5px solid #dde3ed;padding:24px 16px 20px;overflow:hidden;display:flex;flex-direction:column">
        <div style="width:100%;aspect-ratio:1/1;margin-bottom:18px;flex-shrink:0;overflow:hidden">
          ${d.zdjecie?`<img src="${d.zdjecie}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:top;display:block">`:`<div style="width:100%;height:100%;background:#d8dde8;display:flex;align-items:center;justify-content:center"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#9ba4b8" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>`}
        </div>
        ${bHdrSb(L("contact"), SVG_PERSON)}
        <div style="margin-bottom:14px;font-size:9.5px;color:#333;line-height:1.7">
          ${d.adres?`<div><b style="color:${c1}">Adres: </b>${d.adres}</div>`:''}
          ${d.tel?`<div><b style="color:${c1}">Telefon: </b>${d.tel}</div>`:''}
          ${d.email?`<div style="word-break:break-all"><b style="color:${c1}">E-mail: </b>${d.email}</div>`:''}
        </div>
        ${d.linkedin?`${bHdrSb('Social Media', SVG_SHARE)}<div style="margin-bottom:14px;font-size:9.5px;color:#333"><b style="color:${c1}">LinkedIn: </b><span style="word-break:break-all">${d.linkedin}</span></div>`:''}
        ${skillsInSb?`${bHdrSb(L("skills"), SVG_KEY)}<div style="margin-bottom:14px">${skills.map(s=>`<div style="font-size:9.5px;color:#333;margin-bottom:4px;padding-left:8px;border-left:2.5px solid ${c2}">${s}</div>`).join('')}</div>`:''}
        ${jezykiInSb?`${bHdrSb(L("languages"), SVG_GLOBE)}<div style="margin-bottom:14px">${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="margin-bottom:7px;padding-left:8px;border-left:2px solid ${c2}"><div style="font-size:9.5px;font-weight:600;color:#222">${l.jezyk}</div><div style="font-size:8.5px;color:#888;margin-top:1px">${l.poziom}</div></div>`).join('')}</div>`:''}
        ${certGroups.filter(cg=>sb.has(cg.key)).map(({label,items})=>`${bHdrSb(label, SVG_BOOK)}<div style="margin-bottom:14px">${certItemsSb(items)}</div>`).join('')}
        ${intInSb?`${bHdrSb(L("interests"), SVG_STAR)}<div style="font-size:9.5px;color:#555;line-height:1.6;margin-bottom:14px;padding-left:8px;border-left:2px solid ${c2}">${d.zainteresowania}</div>`:''}
        ${customSects.filter(s=>sb.has('custom-'+s.id)).map(s=>`${bHdrSb(s.title||'', SVG_BOOK)}<div style="font-size:9.5px;color:#555;line-height:1.6;margin-bottom:14px;padding-left:8px;border-left:2px solid ${c2}">${s.content||''}</div>`).join('')}
      </div>
      <!-- RIGHT MAIN 66% -->
      <div style="flex:1;padding:24px 22px 18px 20px;min-width:0;overflow:hidden;display:flex;flex-direction:column">
        <div style="font-size:24px;font-weight:800;color:${c1};letter-spacing:-0.3px;line-height:1.1;margin-bottom:4px">${name}</div>
        ${d.stanowisko?`<div style="font-size:11px;color:#6b7280;margin-bottom:10px;font-weight:500">${d.stanowisko}</div>`:''}
        ${d.podsumowanie?`<div style="font-size:10.5px;color:#555;line-height:1.72;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #e0e7ef">${d.podsumowanie}</div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`<div style="margin-bottom:16px">${bHdr(L("experience"), SVG_BRIEF)}${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`<div style="display:grid;grid-template-columns:62px 1fr;gap:0 11px;margin-bottom:12px"><div style="padding-top:1px;text-align:right"><div style="font-size:8.5px;color:#9ca3af;line-height:1.6">${[e.od,e.do].filter(Boolean).join('<br>')}</div></div><div style="border-left:2px solid ${c2};padding-left:10px"><div style="font-size:11.5px;font-weight:700;color:#111">${e.firma||''}</div><div style="font-size:10px;color:${c2};font-weight:600;margin-top:1px">${e.stanowisko||''}</div>${e.opis?`<div style="font-size:10px;color:#555;line-height:1.62;margin-top:3px">${e.opis}</div>`:''}</div></div>`).join('')}</div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`<div style="margin-bottom:16px">${bHdr(L("education"), SVG_GRAD)}${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`<div style="display:grid;grid-template-columns:62px 1fr;gap:0 11px;margin-bottom:11px"><div style="padding-top:1px;text-align:right"><div style="font-size:8.5px;color:#9ca3af;line-height:1.6">${[e.od,e.do].filter(Boolean).join('<br>')}</div></div><div style="border-left:2px solid ${c2};padding-left:10px"><div style="font-size:11px;font-weight:700;color:#111">${e.szkola}</div><div style="font-size:10px;color:#555;margin-top:1px">${e.kierunek||''}</div></div></div>`).join('')}</div>`:''}
        ${!skillsInSb&&skills.length?`<div style="margin-bottom:16px">${bHdr(L("skills"), SVG_KEY)}<div style="display:flex;flex-wrap:wrap;gap:5px">${skills.map(s=>`<span style="font-size:9.5px;padding:3px 9px;background:#f0f4f8;color:#222;border-radius:99px">${s}</span>`).join('')}</div></div>`:''}
        ${!jezykiInSb&&d.jezyki.some(l=>l.jezyk)?`<div style="margin-bottom:16px">${bHdr(L("languages"), SVG_GLOBE)}${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="display:grid;grid-template-columns:62px 1fr;gap:0 11px;margin-bottom:7px"><div></div><div style="border-left:2px solid ${c2};padding-left:10px"><div style="font-size:10px;font-weight:600;color:#111">${l.jezyk}</div><div style="font-size:9px;color:#888">${l.poziom}</div></div></div>`).join('')}</div>`:''}
        ${certGroups.filter(cg=>!sb.has(cg.key)).map(({label,items})=>`<div style="margin-bottom:16px">${bHdr(label, SVG_BOOK)}${certItemsMn(items)}</div>`).join('')}
        ${!intInSb&&d.zainteresowania?`<div style="margin-bottom:16px">${bHdr(L("interests"), SVG_STAR)}<div style="display:grid;grid-template-columns:62px 1fr;gap:0 11px"><div></div><div style="border-left:2px solid ${c2};padding-left:10px;font-size:10.5px;color:#555;line-height:1.65">${d.zainteresowania}</div></div></div>`:''}
        ${customSects.filter(s=>!sb.has('custom-'+s.id)).map(s=>`<div style="margin-bottom:16px">${bHdr(s.title||'', SVG_BOOK)}<div style="display:grid;grid-template-columns:62px 1fr;gap:0 11px"><div></div><div style="border-left:2px solid ${c2};padding-left:10px;font-size:10.5px;color:#555;line-height:1.65">${s.content||''}</div></div></div>`).join('')}
        <div style="margin-top:auto;font-size:9px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:8px;text-align:center">${L("consent")}</div>
      </div>
    </div>`;
  }

  // ── MAROON ────────────────────────────────────────────────
  if (tpl === 'maroon') {
    const sb = cvSidebarSections;
    const skillsInSb = sb.has('umiejetnosci') && skills.length;
    const jezykiInSb = sb.has('jezyki') && d.jezyki.some(l=>l.jezyk);
    const intInSb    = sb.has('zainteresowania') && d.zainteresowania;
    const customSects = (typeof cvCustomSections!=='undefined'?cvCustomSections:[]).filter(s=>s.title||s.content);
    // Section header: ● LABEL ───────
    const mHdr  = (lbl) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-shrink:0"><span style="color:${c1};font-size:13px;line-height:1;flex-shrink:0">●</span><span style="font-size:8.5px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#111;white-space:nowrap">${lbl}</span><div style="flex:1;height:1px;background:#d1d5db;margin-left:5px"></div></div>`;
    const mHdrSb = (lbl) => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-shrink:0"><span style="color:${c1};font-size:11px;line-height:1;flex-shrink:0">●</span><span style="font-size:8px;font-weight:800;letter-spacing:0.13em;text-transform:uppercase;color:#111;white-space:nowrap">${lbl}</span><div style="flex:1;height:1px;background:#d1d5db;margin-left:4px"></div></div>`;
    const cIcon  = (svgPath) => `<div style="width:16px;height:16px;border-radius:50%;background:#e5e7eb;flex-shrink:0;display:flex;align-items:center;justify-content:center"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg></div>`;
    const SVG_MAIL  = '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>';
    const SVG_PHONE = '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91A16 16 0 0 0 15.09 15.91l.86-.86a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>';
    const SVG_MAP   = '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>';
    const SVG_LINK  = '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>';
    const SVG_GLOBE = '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>';
    // Content entries — plain, no bold uppercase, no sub-bullets
    const expEntry  = (e) => `<div style="margin-bottom:11px"><div style="font-size:10.5px;font-weight:700;color:#111;line-height:1.3">${e.firma||''}</div><div style="font-size:9px;color:#6b7280;margin-top:1px">${[e.stanowisko, [e.od,e.do].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}</div>${e.opis?`<div style="font-size:9.5px;color:#555;line-height:1.65;margin-top:3px">${e.opis}</div>`:''}</div>`;
    const eduEntry  = (e) => `<div style="margin-bottom:10px"><div style="font-size:10.5px;font-weight:700;color:#111;line-height:1.3">${e.szkola}</div>${e.kierunek?`<div style="font-size:9px;color:#555;margin-top:1px">${e.kierunek}</div>`:''}${(e.od||e.do)?`<div style="font-size:8.5px;color:#9ca3af;margin-top:1px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>`:''}</div>`;
    const certEntry = (c) => {const p=c.split(' | ');const dt=p.length>1?p[0]:'';const body=p.length>1?p.slice(1).join(' | '):c;return `<div style="margin-bottom:7px"><div style="font-size:9.5px;color:#333;line-height:1.4">${body}</div>${dt?`<div style="font-size:8.5px;color:#9ca3af">${dt}</div>`:''}</div>`;};
    const fn = d.imie || ''; const ln = d.nazwisko || '';
    return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#fff;height:842px;min-height:842px;max-height:842px;overflow:hidden;display:flex;width:595px;box-sizing:border-box">
      <!-- LEFT MAIN 63% -->
      <div style="flex:1;padding:30px 22px 18px 26px;min-width:0;overflow:hidden;display:flex;flex-direction:column">
        <div style="margin-bottom:6px;line-height:1.05;flex-shrink:0">
          <div style="font-size:30px;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:0.06em">${fn||ln?`${fn}${fn&&ln?' ':''}${ln}`:'IMIĘ NAZWISKO'}</div>
        </div>
        ${d.stanowisko?`<div style="font-size:9px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:10px;flex-shrink:0">${d.stanowisko}</div>`:'<div style="margin-bottom:10px"></div>'}
        <div style="width:38px;height:3px;background:#d1d5db;margin-bottom:16px;flex-shrink:0"></div>
        ${d.podsumowanie?`<div style="margin-bottom:13px">${mHdr(L("summary"))}<div style="font-size:10px;color:#555;line-height:1.72">${d.podsumowanie}</div></div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`<div style="margin-bottom:13px">${mHdr(L("experience"))}${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(expEntry).join('')}</div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`<div style="margin-bottom:13px">${mHdr(L("education"))}${d.wyksztalcenie.filter(e=>e.szkola).map(eduEntry).join('')}</div>`:''}
        ${!skillsInSb&&skills.length?`<div style="margin-bottom:13px">${mHdr(L("skills"))}<div style="display:flex;flex-wrap:wrap;gap:4px">${skills.map(s=>`<span style="font-size:9px;padding:3px 9px;border:1px solid #d1d5db;color:#333;border-radius:2px">${s}</span>`).join('')}</div></div>`:''}
        ${!jezykiInSb&&d.jezyki.some(l=>l.jezyk)?`<div style="margin-bottom:13px">${mHdr(L("languages"))}<div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="margin-bottom:6px"><div style="font-size:10px;font-weight:600;color:#111">${l.jezyk}</div><div style="font-size:9px;color:#888">${l.poziom}</div></div>`).join('')}</div></div>`:''}
        ${certGroups.filter(cg=>!sb.has(cg.key)).map(({label,items})=>`<div style="margin-bottom:13px">${mHdr(label)}${items.map(certEntry).join('')}</div>`).join('')}
        ${!intInSb&&d.zainteresowania?`<div style="margin-bottom:13px">${mHdr(L("interests"))}<div style="font-size:10px;color:#555;line-height:1.65">${d.zainteresowania}</div></div>`:''}
        ${customSects.filter(s=>!sb.has('custom-'+s.id)).map(s=>`<div style="margin-bottom:13px">${mHdr(s.title||'')}<div style="font-size:10px;color:#555;line-height:1.65">${s.content||''}</div></div>`).join('')}
        <div style="margin-top:auto;font-size:9px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:8px;text-align:center;flex-shrink:0">${L("consent")}</div>
      </div>
      <!-- RIGHT SIDEBAR 37% -->
      <div style="width:37%;flex-shrink:0;background:#f8f8f8;border-left:1px solid #e5e7eb;padding:22px 15px 18px;overflow:hidden;display:flex;flex-direction:column">
        <div style="width:86px;height:86px;border-radius:50%;overflow:hidden;margin:0 auto 16px;flex-shrink:0;border:2.5px solid #e5e7eb">
          ${d.zdjecie?`<img src="${d.zdjecie}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:top;display:block">`:`<div style="width:100%;height:100%;background:#e5e7eb;display:flex;align-items:center;justify-content:center"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>`}
        </div>
        ${mHdrSb(L("contact"))}
        <div style="margin-bottom:13px">
          ${d.email?`<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:5px">${cIcon(SVG_MAIL)}<span style="font-size:8.5px;color:#333;word-break:break-all;line-height:1.4">${d.email}</span></div>`:''}
          ${d.tel?`<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">${cIcon(SVG_PHONE)}<span style="font-size:8.5px;color:#333">${d.tel}</span></div>`:''}
          ${d.adres?`<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:5px">${cIcon(SVG_MAP)}<span style="font-size:8.5px;color:#333;line-height:1.4">${d.adres}</span></div>`:''}
          ${d.linkedin?`<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:5px">${cIcon(SVG_LINK)}<span style="font-size:8.5px;color:#333;word-break:break-all;line-height:1.4">${d.linkedin}</span></div>`:''}
          ${d.www?`<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:5px">${cIcon(SVG_GLOBE)}<span style="font-size:8.5px;color:#333;word-break:break-all;line-height:1.4">${d.www}</span></div>`:''}
        </div>
        ${skillsInSb?`${mHdrSb(L("skills"))}<div style="margin-bottom:13px">${skills.map(s=>`<div style="font-size:9px;color:#333;margin-bottom:4px;line-height:1.4">${s}</div>`).join('')}</div>`:''}
        ${jezykiInSb?`${mHdrSb(L("languages"))}<div style="margin-bottom:13px">${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="margin-bottom:6px"><div style="font-size:9px;font-weight:600;color:#111">${l.jezyk}</div><div style="font-size:8px;color:#888">${l.poziom}</div></div>`).join('')}</div>`:''}
        ${certGroups.filter(cg=>sb.has(cg.key)).map(({label,items})=>`${mHdrSb(label)}<div style="margin-bottom:13px">${items.map(certEntry).join('')}</div>`).join('')}
        ${intInSb?`${mHdrSb(L("interests"))}<div style="margin-bottom:13px;font-size:9px;color:#555;line-height:1.6">${d.zainteresowania}</div>`:''}
        ${customSects.filter(s=>sb.has('custom-'+s.id)).map(s=>`${mHdrSb(s.title||'')}<div style="margin-bottom:13px;font-size:9px;color:#555;line-height:1.6">${s.content||''}</div>`).join('')}
      </div>
    </div>`;
  }

  // ── PRESTIGE ──────────────────────────────────────────────
  if (tpl === 'prestige') {
    const sh = (lbl) => `<div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:${c2};margin-bottom:10px;padding-bottom:4px;border-bottom:1.5px solid ${c2}55">${lbl}</div>`;
    return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#fff;min-height:842px;display:flex;flex-direction:column;width:595px;box-sizing:border-box">
      <!-- HEADER -->
      <div style="background:${c1};padding:26px 34px 20px;display:flex;align-items:center;gap:18px;flex-shrink:0">
        ${d.zdjecie?`<div style="width:70px;height:70px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid ${c2}">${photo}</div>`:''}
        <div style="flex:1;min-width:0">
          <div style="font-size:30px;font-weight:800;color:#fff;letter-spacing:-0.5px;line-height:1.05">${name}</div>
          ${d.stanowisko?`<div style="font-size:12.5px;color:${c2};font-weight:600;margin-top:5px;letter-spacing:0.4px">${d.stanowisko}</div>`:''}
          <div style="display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:11px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.12)">
            ${d.email?`<span style="font-size:9.5px;color:rgba(255,255,255,0.75)">✉ ${d.email}</span>`:''}
            ${d.tel?`<span style="font-size:9.5px;color:rgba(255,255,255,0.75)">📞 ${d.tel}</span>`:''}
            ${d.adres?`<span style="font-size:9.5px;color:rgba(255,255,255,0.75)">📍 ${d.adres}</span>`:''}
            ${d.linkedin?`<span style="font-size:9.5px;color:rgba(255,255,255,0.75)">🔗 ${d.linkedin}</span>`:''}
          </div>
        </div>
      </div>
      <!-- GOLD ACCENT BAR -->
      <div style="height:3px;background:${c2};flex-shrink:0"></div>
      <!-- BODY: left main + right sidebar -->
      <div style="display:flex;flex:1;min-height:0">
        <!-- MAIN CONTENT (63%) -->
        <div style="flex:0 0 375px;padding:22px 22px 22px 34px;border-right:1px solid #ede9e2;overflow:hidden">
          ${d.podsumowanie?`
          <div style="margin-bottom:18px">
            ${sh(L("summary"))}
            <div style="font-size:11px;line-height:1.75;color:#444">${d.podsumowanie}</div>
          </div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:18px">
            ${sh(L("experience"))}
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
            <div style="margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
                <div style="font-size:11.5px;font-weight:700;color:#0d1b2a">${e.firma||''}</div>
                <div style="font-size:9.5px;color:#aaa;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
              </div>
              <div style="font-size:10.5px;color:${c2};font-weight:600;margin-top:2px">${e.stanowisko||''}</div>
              ${e.opis?`<div style="font-size:10.5px;color:#555;line-height:1.6;margin-top:4px">${e.opis}</div>`:''}
            </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div style="margin-bottom:18px">
            ${sh(L("education"))}
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
            <div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;gap:8px">
                <div style="font-size:11.5px;font-weight:700;color:#0d1b2a">${e.szkola}</div>
                <div style="font-size:9.5px;color:#aaa;white-space:nowrap;flex-shrink:0">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
              </div>
              <div style="font-size:10px;color:#666;margin-top:2px">${e.kierunek||''}</div>
            </div>`).join('')}
          </div>`:''}
          ${renderCustomSections(c1, c2)}
        </div>
        <!-- SIDEBAR (37%) -->
        <div style="flex:1;background:#f5f3ef;padding:22px 20px 22px 18px;overflow:hidden">
          ${skills.length?`
          <div style="margin-bottom:18px">
            ${sh(L("skills"))}
            <div style="display:flex;flex-wrap:wrap;gap:5px">
              ${skills.map(s=>`<span style="font-size:9.5px;padding:3px 9px;background:#fff;border:1px solid ${c2}55;color:#222;border-radius:99px;font-weight:500">${s}</span>`).join('')}
            </div>
          </div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`
          <div style="margin-bottom:18px">
            ${sh(L("languages"))}
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`
            <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:baseline">
              <span style="font-size:10.5px;font-weight:700;color:#0d1b2a">${l.jezyk}</span>
              <span style="font-size:9px;color:#888">${l.poziom}</span>
            </div>`).join('')}
          </div>`:''}
          ${certGroups.length?certGroups.map(({label,items})=>`
          <div style="margin-bottom:18px">
            ${sh(label)}
            ${items.map(c=>`<div style="font-size:9.5px;color:#444;margin-bottom:6px;padding-left:8px;border-left:2px solid ${c2}">${c}</div>`).join('')}
          </div>`).join(''):''}
          ${d.zainteresowania?`
          <div style="margin-bottom:18px">
            ${sh(L("interests"))}
            <div style="font-size:10px;color:#555;line-height:1.65">${d.zainteresowania}</div>
          </div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:9px;color:#ccc;padding:7px;border-top:1px solid #ede9e2;background:#fff;flex-shrink:0">${L("consent")}</div>
    </div>`;
  }

  return '';
}

