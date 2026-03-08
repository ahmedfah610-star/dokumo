// cv-templates.js – szablony CV
// Ten plik jest ładowany przez kreator-cv.html

function buildCVHTML(tpl) {
  const d = cvData;
  const t = CV_TEMPLATES.find(x => x.id === tpl) || CV_TEMPLATES[0];
  const c1 = t.color1, c2 = t.color2;
  const name = [d.imie, d.nazwisko].filter(Boolean).join(' ') || 'Imię Nazwisko';
  const skills = d.umiejetnosci ? d.umiejetnosci.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const photo = d.zdjecie ? `<img src="${d.zdjecie}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : '';
  const contact = [
    d.email && `<span>✉ ${d.email}</span>`,
    d.tel && `<span>📞 ${d.tel}</span>`,
    d.adres && `<span>📍 ${d.adres}</span>`,
    d.linkedin && `<span>🔗 ${d.linkedin}</span>`,
  ].filter(Boolean).join('');

  // ── TIMELINE ──────────────────────────────────────────────
  if (tpl === 'timeline') return `
    <div style="font-family:Arial,sans-serif;background:#fff;padding:0;min-height:842px">
      <div style="background:linear-gradient(135deg,${c1},${c2});padding:36px 40px 28px;display:flex;align-items:center;gap:22px">
        ${d.zdjecie ? `<div style="width:88px;height:88px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,0.5);flex-shrink:0">${photo}</div>` : ''}
        <div>
          <div style="font-size:26px;font-weight:700;color:#fff;line-height:1.1">${name}</div>
          ${d.stanowisko?`<div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:5px;letter-spacing:1.5px;text-transform:uppercase">${d.stanowisko}</div>`:''}
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;font-size:9.5px;color:rgba(255,255,255,0.75)">${contact}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 200px;gap:0;padding:24px 40px;align-items:start">
        <div style="padding-right:32px;border-right:2px solid #f0f0f0">
          ${d.podsumowanie?`<div style="margin-bottom:20px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:6px">Profil</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:20px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:12px">Doświadczenie</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="display:flex;gap:12px;margin-bottom:14px">
                <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
                  <div style="width:10px;height:10px;border-radius:50%;background:${c1};flex-shrink:0;margin-top:2px"></div>
                  <div style="width:2px;flex:1;background:#e8e8e8;margin-top:3px"></div>
                </div>
                <div style="padding-bottom:12px">
                  <div style="font-size:11px;font-weight:700;color:#1a1a1a">${e.stanowisko||''}</div>
                  <div style="font-size:10px;color:${c2};font-weight:600">${e.firma||''}</div>
                  <div style="font-size:9px;color:#aaa;margin-bottom:3px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
                  ${e.opis?`<div style="font-size:9.5px;color:#666;line-height:1.6">${e.opis}</div>`:''}
                </div>
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:12px">Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="display:flex;gap:12px;margin-bottom:12px">
                <div style="width:10px;height:10px;border-radius:50%;background:${c1};flex-shrink:0;margin-top:2px"></div>
                <div>
                  <div style="font-size:11px;font-weight:700;color:#1a1a1a">${e.kierunek||''}</div>
                  <div style="font-size:10px;color:#666">${e.szkola}</div>
                  <div style="font-size:9px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
                </div>
              </div>`).join('')}
          </div>`:''}
        </div>
        <div style="padding-left:20px">
          ${skills.length?`
          <div style="margin-bottom:20px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Umiejętności</div>
            ${skills.map(s=>`<div style="font-size:9.5px;margin-bottom:5px;display:flex;align-items:center;gap:6px"><span style="width:5px;height:5px;border-radius:50%;background:${c1};flex-shrink:0;display:inline-block"></span>${s}</div>`).join('')}
          </div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`
          <div style="margin-bottom:20px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Języki</div>
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9.5px;margin-bottom:5px"><strong>${l.jezyk}</strong> <span style="color:#aaa">– ${l.poziom}</span></div>`).join('')}
          </div>`:''}
          ${d.zainteresowania?`
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Zainteresowania</div>
            <div style="font-size:9.5px;color:#666;line-height:1.6">${d.zainteresowania}</div>
          </div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:7.5px;color:#ccc;padding:10px;border-top:1px solid #f0f0f0">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
    </div>`;

  // ── SIDEBAR ───────────────────────────────────────────────
  if (tpl === 'sidebar') return `
    <div style="font-family:Arial,sans-serif;display:flex;min-height:842px">
      <div style="width:220px;background:${c1};padding:28px 20px;flex-shrink:0;display:flex;flex-direction:column;gap:0">
        ${d.zdjecie ? `<div style="width:90px;height:90px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,0.3);margin:0 auto 16px">${photo}</div>` : ''}
        <div style="font-size:17px;font-weight:700;color:#fff;line-height:1.2;margin-bottom:4px;text-align:center">${name}</div>
        ${d.stanowisko?`<div style="font-size:8.5px;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:1px;text-align:center;margin-bottom:18px">${d.stanowisko}</div>`:''}
        <div style="font-size:8.5px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:5px">Kontakt</div>
        ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(c=>`<div style="font-size:9px;color:rgba(255,255,255,0.7);margin-bottom:5px;word-break:break-all">${c}</div>`).join('')}
        ${skills.length?`
        <div style="font-size:8.5px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 8px;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:5px">Umiejętności</div>
        ${skills.map(s=>`<div style="font-size:9px;color:rgba(255,255,255,0.75);margin-bottom:4px;display:flex;align-items:center;gap:5px"><span style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,0.4);display:inline-block;flex-shrink:0"></span>${s}</div>`).join('')}`:''}
        ${d.jezyki.some(l=>l.jezyk)?`
        <div style="font-size:8.5px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 8px;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:5px">Języki</div>
        ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9px;color:rgba(255,255,255,0.75);margin-bottom:4px">${l.jezyk} <span style="opacity:0.5">– ${l.poziom}</span></div>`).join('')}`:''}
      </div>
      <div style="flex:1;padding:28px 28px">
        ${d.podsumowanie?`<div style="margin-bottom:20px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};border-bottom:2px solid ${c1};padding-bottom:4px;margin-bottom:8px">Profil zawodowy</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:20px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};border-bottom:2px solid ${c1};padding-bottom:4px;margin-bottom:10px">Doświadczenie</div>
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
            <div style="margin-bottom:12px;padding-left:10px;border-left:3px solid ${c2}">
              <div style="font-size:11px;font-weight:700;color:#222">${e.stanowisko||''}</div>
              <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:${c2};font-weight:600">${e.firma||''}</div><div style="font-size:9px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              ${e.opis?`<div style="font-size:9.5px;color:#666;margin-top:3px;line-height:1.6">${e.opis}</div>`:''}
            </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};border-bottom:2px solid ${c1};padding-bottom:4px;margin-bottom:10px">Wykształcenie</div>
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
            <div style="margin-bottom:10px;padding-left:10px;border-left:3px solid ${c2}">
              <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
              <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:#555">${e.szkola}</div><div style="font-size:9px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
            </div>`).join('')}
        </div>`:''}
        <div style="margin-top:16px;font-size:7.5px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:10px;text-align:center">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
      </div>
    </div>`;

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
          ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(c=>`<span style="background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.9);font-size:9px;padding:4px 10px;border-radius:20px">${c}</span>`).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 180px;padding:28px 40px;gap:28px">
        <div>
          ${d.podsumowanie?`<div style="margin-bottom:20px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px;display:flex;align-items:center;gap:8px"><span style="width:20px;height:3px;background:${c2};border-radius:2px;display:inline-block"></span>O mnie</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:20px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px;display:flex;align-items:center;gap:8px"><span style="width:20px;height:3px;background:${c2};border-radius:2px;display:inline-block"></span>Doświadczenie</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:12px;background:#faf9fe;padding:10px 14px;border-left:3px solid ${c2}">
                <div style="font-size:11px;font-weight:700;color:#222">${e.stanowisko||''}</div>
                <div style="display:flex;justify-content:space-between;margin-top:2px"><div style="font-size:9.5px;color:${c1};font-weight:600">${e.firma||''}</div><div style="font-size:9px;color:#bbb">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
                ${e.opis?`<div style="font-size:9.5px;color:#666;margin-top:4px;line-height:1.6">${e.opis}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px;display:flex;align-items:center;gap:8px"><span style="width:20px;height:3px;background:${c2};border-radius:2px;display:inline-block"></span>Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:10px;background:#faf9fe;padding:10px 14px;border-left:3px solid ${c2}">
                <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:#555">${e.szkola}</div><div style="font-size:9px;color:#bbb">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              </div>`).join('')}
          </div>`:''}
        </div>
        <div>
          ${skills.length?`
          <div style="margin-bottom:18px">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Umiejętności</div>
            ${skills.map(s=>`<div style="font-size:9px;background:linear-gradient(135deg,${c1}15,${c2}15);padding:4px 8px;margin-bottom:4px;color:#333;border-radius:3px">${s}</div>`).join('')}
          </div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`
          <div style="margin-bottom:18px">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Języki</div>
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9.5px;margin-bottom:5px;color:#444">${l.jezyk} <span style="color:#bbb">– ${l.poziom}</span></div>`).join('')}
          </div>`:''}
          ${d.zainteresowania?`
          <div>
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Zainteresowania</div>
            <div style="font-size:9.5px;color:#666;line-height:1.6">${d.zainteresowania}</div>
          </div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:7.5px;color:#ccc;padding:8px;border-top:1px solid #f0f0f0">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
    </div>`;

  // ── BOLD (czerwony) ───────────────────────────────────────
  if (tpl === 'bold') return `
    <div style="font-family:Arial,sans-serif;background:#fff;min-height:842px">
      <div style="background:#111;padding:32px 40px;display:flex;align-items:center;gap:20px">
        ${d.zdjecie ? `<div style="width:86px;height:86px;border-radius:50%;overflow:hidden;border:3px solid ${c1};flex-shrink:0">${photo}</div>` : ''}
        <div style="flex:1">
          <div style="font-size:26px;font-weight:900;color:#fff;line-height:1;text-transform:uppercase;letter-spacing:-0.5px">${name}</div>
          ${d.stanowisko?`<div style="font-size:11px;color:${c1};margin-top:6px;font-weight:700;text-transform:uppercase;letter-spacing:2px">${d.stanowisko}</div>`:''}
        </div>
      </div>
      <div style="background:${c1};padding:10px 40px;display:flex;flex-wrap:wrap;gap:16px">
        ${[d.email,d.tel,d.adres].filter(Boolean).map(c=>`<span style="font-size:9.5px;color:#fff">${c}</span>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 180px;padding:28px 40px;gap:28px">
        <div>
          ${d.podsumowanie?`<div style="margin-bottom:20px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#111;border-bottom:3px solid ${c1};padding-bottom:4px;margin-bottom:8px">Profil</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:20px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#111;border-bottom:3px solid ${c1};padding-bottom:4px;margin-bottom:10px">Doświadczenie</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:baseline">
                  <div style="font-size:11px;font-weight:700;color:#111">${e.stanowisko||''}</div>
                  <div style="font-size:9px;color:#999;white-space:nowrap">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
                </div>
                <div style="font-size:10px;color:${c1};font-weight:600">${e.firma||''}</div>
                ${e.opis?`<div style="font-size:9.5px;color:#666;margin-top:3px;line-height:1.6">${e.opis}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#111;border-bottom:3px solid ${c1};padding-bottom:4px;margin-bottom:10px">Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:10px">
                <div style="font-size:11px;font-weight:700;color:#111">${e.kierunek||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:#555">${e.szkola}</div><div style="font-size:9px;color:#999">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              </div>`).join('')}
          </div>`:''}
        </div>
        <div>
          ${skills.length?`
          <div style="margin-bottom:18px">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#111;border-bottom:2px solid ${c1};padding-bottom:3px;margin-bottom:8px">Umiejętności</div>
            ${skills.map(s=>`<div style="font-size:9px;padding:3px 0;border-bottom:1px solid #f0f0f0;color:#444">${s}</div>`).join('')}
          </div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`
          <div>
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#111;border-bottom:2px solid ${c1};padding-bottom:3px;margin-bottom:8px">Języki</div>
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9.5px;margin-bottom:4px;color:#444">${l.jezyk} – ${l.poziom}</div>`).join('')}
          </div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:7.5px;color:#ccc;padding:8px;border-top:1px solid #f0f0f0">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
    </div>`;

  // ── TEAL ──────────────────────────────────────────────────
  if (tpl === 'teal') return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f8fffe;min-height:842px">
      <div style="background:#fff;border-bottom:4px solid ${c1};padding:28px 40px;display:flex;align-items:center;gap:22px">
        ${d.zdjecie ? `<div style="width:90px;height:90px;border-radius:12px;overflow:hidden;border:2px solid ${c1};flex-shrink:0">${photo}</div>` : ''}
        <div style="flex:1">
          <div style="font-size:26px;font-weight:700;color:#1a1a1a;line-height:1.1">${name}</div>
          ${d.stanowisko?`<div style="font-size:11px;color:${c1};font-weight:600;margin-top:4px;text-transform:uppercase;letter-spacing:1.5px">${d.stanowisko}</div>`:''}
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;font-size:9px;color:#666">${contact}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 190px;padding:24px 40px;gap:24px">
        <div>
          ${d.podsumowanie?`<div style="margin-bottom:18px;background:#fff;padding:14px;border-left:4px solid ${c1};box-shadow:0 2px 8px rgba(0,0,0,0.04)"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:6px">Profil</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:18px">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px;display:flex;align-items:center;gap:8px"><span style="width:24px;height:2px;background:${c1};display:inline-block"></span>Doświadczenie</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="background:#fff;padding:12px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.05);border-radius:4px">
                <div style="display:flex;justify-content:space-between;align-items:baseline">
                  <div style="font-size:11px;font-weight:700;color:#1a1a1a">${e.stanowisko||''}</div>
                  <div style="font-size:9px;color:#aaa;white-space:nowrap">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
                </div>
                <div style="font-size:10px;color:${c1};font-weight:600">${e.firma||''}</div>
                ${e.opis?`<div style="font-size:9.5px;color:#666;margin-top:4px;line-height:1.6">${e.opis}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px;display:flex;align-items:center;gap:8px"><span style="width:24px;height:2px;background:${c1};display:inline-block"></span>Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="background:#fff;padding:10px;margin-bottom:6px;box-shadow:0 1px 6px rgba(0,0,0,0.05);border-radius:4px">
                <div style="font-size:11px;font-weight:700;color:#1a1a1a">${e.kierunek||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:#555">${e.szkola}</div><div style="font-size:9px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              </div>`).join('')}
          </div>`:''}
        </div>
        <div>
          ${skills.length?`
          <div style="background:#fff;padding:14px;margin-bottom:12px;box-shadow:0 1px 6px rgba(0,0,0,0.05);border-radius:4px">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Umiejętności</div>
            ${skills.map(s=>`<div style="font-size:9px;background:${c1}15;padding:3px 8px;margin-bottom:4px;border-radius:3px;color:#333">${s}</div>`).join('')}
          </div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`
          <div style="background:#fff;padding:14px;margin-bottom:12px;box-shadow:0 1px 6px rgba(0,0,0,0.05);border-radius:4px">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Języki</div>
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9.5px;margin-bottom:4px;color:#444">${l.jezyk} <span style="color:#aaa">– ${l.poziom}</span></div>`).join('')}
          </div>`:''}
          ${d.zainteresowania?`
          <div style="background:#fff;padding:14px;box-shadow:0 1px 6px rgba(0,0,0,0.05);border-radius:4px">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Zainteresowania</div>
            <div style="font-size:9.5px;color:#666;line-height:1.6">${d.zainteresowania}</div>
          </div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:7.5px;color:#ccc;padding:8px">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
    </div>`;

  // ── MIDNIGHT ──────────────────────────────────────────────
  if (tpl === 'midnight') return `
    <div style="font-family:Arial,sans-serif;background:#fff;min-height:842px">
      <div style="background:#0f172a;padding:32px 40px;display:flex;gap:24px;align-items:center">
        ${d.zdjecie?`<div style="width:84px;height:84px;border-radius:8px;overflow:hidden;flex-shrink:0;border:2px solid rgba(255,255,255,0.15)">${photo}</div>`:''}
        <div>
          <div style="font-size:24px;font-weight:700;color:#f8fafc;letter-spacing:-0.3px">${name}</div>
          ${d.stanowisko?`<div style="font-size:10px;color:#94a3b8;margin-top:5px;letter-spacing:2px;text-transform:uppercase">${d.stanowisko}</div>`:''}
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px">${[d.email,d.tel,d.adres].filter(Boolean).map(x=>`<span style="font-size:9px;color:#94a3b8">${x}</span>`).join(' · ')}</div>
        </div>
      </div>
      <div style="height:3px;background:linear-gradient(90deg,${c1},${c2},transparent)"></div>
      <div style="display:grid;grid-template-columns:1fr 185px;padding:24px 40px;gap:24px">
        <div>
          ${d.podsumowanie?`<div style="margin-bottom:18px"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c2};margin-bottom:7px">Profil</div><div style="font-size:10px;line-height:1.75;color:#444">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:18px">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c2};margin-bottom:10px">Doświadczenie</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:11px;padding:10px;background:#f8fafc;border-radius:4px">
                <div style="display:flex;justify-content:space-between"><div style="font-size:11px;font-weight:700;color:#1e293b">${e.stanowisko||''}</div><div style="font-size:8.5px;color:#94a3b8">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
                <div style="font-size:9.5px;color:${c2};font-weight:600;margin-top:1px">${e.firma||''}</div>
                ${e.opis?`<div style="font-size:9.5px;color:#555;margin-top:4px;line-height:1.6">${e.opis}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c2};margin-bottom:10px">Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:8px;padding:10px;background:#f8fafc;border-radius:4px">
                <div style="font-size:11px;font-weight:700;color:#1e293b">${e.kierunek||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:#555">${e.szkola}</div><div style="font-size:8.5px;color:#94a3b8">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              </div>`).join('')}
          </div>`:''}
        </div>
        <div>
          ${skills.length?`<div style="margin-bottom:16px"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c2};margin-bottom:8px">Umiejętności</div>${skills.map(s=>`<div style="font-size:9px;padding:4px 8px;background:#f1f5f9;margin-bottom:3px;border-radius:3px;color:#334155">${s}</div>`).join('')}</div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="margin-bottom:16px"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c2};margin-bottom:8px">Języki</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9.5px;margin-bottom:4px;color:#334155">${l.jezyk} <span style="color:#94a3b8">– ${l.poziom}</span></div>`).join('')}</div>`:''}
          ${d.zainteresowania?`<div><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c2};margin-bottom:8px">Zainteresowania</div><div style="font-size:9.5px;color:#555;line-height:1.6">${d.zainteresowania}</div></div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:7.5px;color:#ccc;padding:8px;border-top:1px solid #f0f0f0">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
    </div>`;

  // ── CORAL ─────────────────────────────────────────────────
  if (tpl === 'coral') return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#fff;min-height:842px">
      <div style="display:grid;grid-template-columns:210px 1fr;min-height:842px">
        <div style="background:linear-gradient(180deg,${c1},${c2});padding:28px 20px;display:flex;flex-direction:column;gap:0">
          ${d.zdjecie?`<div style="width:80px;height:80px;border-radius:50%;overflow:hidden;margin:0 auto 16px;border:3px solid rgba(255,255,255,0.4)">${photo}</div>`:''}
          <div style="text-align:center;margin-bottom:20px">
            <div style="font-size:15px;font-weight:700;color:#fff;line-height:1.2">${name}</div>
            ${d.stanowisko?`<div style="font-size:8.5px;color:rgba(255,255,255,0.7);margin-top:4px;text-transform:uppercase;letter-spacing:1px">${d.stanowisko}</div>`:''}
          </div>
          <div style="font-size:8px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:5px">Kontakt</div>
          ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<div style="font-size:8.5px;color:rgba(255,255,255,0.75);margin-bottom:5px;word-break:break-all">${x}</div>`).join('')}
          ${skills.length?`<div style="font-size:8px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;margin:14px 0 8px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:5px">Umiejętności</div>${skills.map(s=>`<div style="font-size:8.5px;color:rgba(255,255,255,0.8);margin-bottom:4px">· ${s}</div>`).join('')}`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="font-size:8px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;margin:14px 0 8px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:5px">Języki</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:8.5px;color:rgba(255,255,255,0.8);margin-bottom:4px">${l.jezyk} – ${l.poziom}</div>`).join('')}`:''}
        </div>
        <div style="padding:28px 28px">
          ${d.podsumowanie?`<div style="margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #f0f0f0"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:7px">Profil zawodowy</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:18px">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px">Doświadczenie</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:10px;padding-left:10px;border-left:2px solid ${c2}">
                <div style="font-size:11px;font-weight:700;color:#222">${e.stanowisko||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:${c1}">${e.firma||''}</div><div style="font-size:9px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
                ${e.opis?`<div style="font-size:9.5px;color:#666;margin-top:3px;line-height:1.6">${e.opis}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px">Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:8px;padding-left:10px;border-left:2px solid ${c2}">
                <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:#555">${e.szkola}</div><div style="font-size:9px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              </div>`).join('')}
          </div>`:''}
          <div style="margin-top:14px;font-size:7.5px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:8px;text-align:center">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
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
        <div style="display:flex;justify-content:center;flex-wrap:wrap;gap:14px;margin-top:12px">${[d.email,d.tel,d.adres].filter(Boolean).map(x=>`<span style="font-size:9px;color:rgba(255,255,255,0.8);background:rgba(255,255,255,0.15);padding:3px 10px;border-radius:20px">${x}</span>`).join('')}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 180px;padding:24px 40px;gap:24px">
        <div>
          ${d.podsumowanie?`<div style="margin-bottom:18px"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:7px;padding-bottom:5px;border-bottom:2px solid ${c1}">O mnie</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:18px">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px;padding-bottom:5px;border-bottom:2px solid ${c1}">Doświadczenie</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:11px;display:flex;gap:10px">
                <div style="width:8px;height:8px;border-radius:50%;background:${c1};flex-shrink:0;margin-top:3px"></div>
                <div>
                  <div style="font-size:11px;font-weight:700;color:#222">${e.stanowisko||''}</div>
                  <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:${c2};font-weight:600">${e.firma||''}</div><div style="font-size:9px;color:#bbb">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
                  ${e.opis?`<div style="font-size:9.5px;color:#666;margin-top:3px;line-height:1.6">${e.opis}</div>`:''}
                </div>
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px;padding-bottom:5px;border-bottom:2px solid ${c1}">Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:8px;display:flex;gap:10px">
                <div style="width:8px;height:8px;border-radius:50%;background:${c1};flex-shrink:0;margin-top:3px"></div>
                <div>
                  <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
                  <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:#555">${e.szkola}</div><div style="font-size:9px;color:#bbb">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
                </div>
              </div>`).join('')}
          </div>`:''}
        </div>
        <div>
          ${skills.length?`<div style="margin-bottom:16px"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Umiejętności</div>${skills.map(s=>`<div style="font-size:9px;margin-bottom:4px;padding:3px 8px;background:${c1}15;border-radius:3px;color:#444">${s}</div>`).join('')}</div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="margin-bottom:16px"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Języki</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9.5px;margin-bottom:4px;color:#444">${l.jezyk} <span style="color:#bbb">– ${l.poziom}</span></div>`).join('')}</div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:7.5px;color:#ccc;padding:8px;border-top:1px solid #f0f0f0">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
    </div>`;

  // ── SLATE ─────────────────────────────────────────────────
  if (tpl === 'slate') return `
    <div style="font-family:Georgia,serif;background:#fff;min-height:842px">
      <div style="border-top:6px solid ${c1};padding:32px 44px 24px">
        <div style="display:flex;align-items:center;gap:20px;margin-bottom:16px">
          ${d.zdjecie?`<div style="width:80px;height:80px;overflow:hidden;flex-shrink:0;border:2px solid ${c1}">${photo}</div>`:''}
          <div>
            <div style="font-size:26px;font-weight:700;color:${c1};line-height:1;letter-spacing:-0.5px">${name}</div>
            ${d.stanowisko?`<div style="font-size:11px;color:${c2};font-style:italic;margin-top:5px">${d.stanowisko}</div>`:''}
          </div>
          <div style="flex:1;text-align:right">${[d.email,d.tel,d.adres].filter(Boolean).map(x=>`<div style="font-size:9px;color:#666;margin-bottom:3px">${x}</div>`).join('')}</div>
        </div>
        <div style="height:1px;background:${c1};margin-bottom:20px"></div>
        ${d.podsumowanie?`<div style="margin-bottom:20px;font-size:10px;color:#555;line-height:1.8;font-style:italic">"${d.podsumowanie}"</div>`:''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 180px;padding:0 44px 28px;gap:28px">
        <div>
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:20px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:12px">Doświadczenie zawodowe</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:baseline">
                  <div style="font-size:11px;font-weight:700;color:#222">${e.stanowisko||''}</div>
                  <div style="font-size:9px;color:#999;font-style:italic">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
                </div>
                <div style="font-size:10px;color:${c2};font-style:italic">${e.firma||''}</div>
                ${e.opis?`<div style="font-size:9.5px;color:#555;margin-top:4px;line-height:1.65">${e.opis}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:12px">Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between">
                  <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
                  <div style="font-size:9px;color:#999;font-style:italic">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
                </div>
                <div style="font-size:10px;color:${c2};font-style:italic">${e.szkola}</div>
              </div>`).join('')}
          </div>`:''}
        </div>
        <div>
          ${skills.length?`<div style="margin-bottom:16px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:8px">Umiejętności</div>${skills.map(s=>`<div style="font-size:9.5px;color:#444;margin-bottom:4px;padding-left:8px;border-left:2px solid ${c1}">  ${s}</div>`).join('')}</div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="margin-bottom:16px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:8px">Języki</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9.5px;color:#444;margin-bottom:4px">${l.jezyk} <span style="color:#999">– ${l.poziom}</span></div>`).join('')}</div>`:''}
          ${d.zainteresowania?`<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${c1};margin-bottom:8px">Zainteresowania</div><div style="font-size:9.5px;color:#555;line-height:1.65">${d.zainteresowania}</div></div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:7.5px;color:#ccc;padding:8px;border-top:1px solid #eee">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
    </div>`;

  // ── OCEAN ─────────────────────────────────────────────────
  if (tpl === 'ocean') return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f0f9ff;min-height:842px">
      <div style="background:linear-gradient(135deg,${c1},${c2});padding:32px 40px;display:flex;align-items:center;gap:22px;clip-path:polygon(0 0,100% 0,100% 85%,0 100%)">
        ${d.zdjecie?`<div style="width:88px;height:88px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,0.5);flex-shrink:0">${photo}</div>`:''}
        <div>
          <div style="font-size:25px;font-weight:700;color:#fff;line-height:1.1">${name}</div>
          ${d.stanowisko?`<div style="font-size:10px;color:rgba(255,255,255,0.8);margin-top:5px;letter-spacing:1.5px;text-transform:uppercase">${d.stanowisko}</div>`:''}
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px">${[d.email,d.tel,d.adres].filter(Boolean).map(x=>`<span style="font-size:9px;color:rgba(255,255,255,0.8)">${x}</span>`).join('')}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 185px;padding:8px 40px 24px;gap:24px">
        <div>
          ${d.podsumowanie?`<div style="margin-bottom:18px;background:#fff;padding:14px;border-radius:6px;box-shadow:0 1px 8px rgba(30,64,175,0.07)"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:6px">Profil</div><div style="font-size:10px;line-height:1.7;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:18px">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px">Doświadczenie</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="background:#fff;padding:12px;margin-bottom:8px;border-radius:6px;box-shadow:0 1px 6px rgba(30,64,175,0.06);border-left:3px solid ${c2}">
                <div style="display:flex;justify-content:space-between">
                  <div style="font-size:11px;font-weight:700;color:#1e293b">${e.stanowisko||''}</div>
                  <div style="font-size:9px;color:#94a3b8">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
                </div>
                <div style="font-size:9.5px;color:${c1};font-weight:600">${e.firma||''}</div>
                ${e.opis?`<div style="font-size:9.5px;color:#666;margin-top:4px;line-height:1.6">${e.opis}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:10px">Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="background:#fff;padding:10px;margin-bottom:6px;border-radius:6px;box-shadow:0 1px 6px rgba(30,64,175,0.06);border-left:3px solid ${c2}">
                <div style="font-size:11px;font-weight:700;color:#1e293b">${e.kierunek||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:#555">${e.szkola}</div><div style="font-size:9px;color:#94a3b8">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              </div>`).join('')}
          </div>`:''}
        </div>
        <div>
          ${skills.length?`<div style="background:#fff;padding:12px;border-radius:6px;box-shadow:0 1px 6px rgba(30,64,175,0.06);margin-bottom:10px"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Umiejętności</div>${skills.map(s=>`<div style="font-size:9px;background:${c1}12;padding:3px 8px;margin-bottom:4px;border-radius:3px;color:#334155">${s}</div>`).join('')}</div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="background:#fff;padding:12px;border-radius:6px;box-shadow:0 1px 6px rgba(30,64,175,0.06);margin-bottom:10px"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Języki</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9.5px;margin-bottom:4px;color:#334155">${l.jezyk} <span style="color:#94a3b8">– ${l.poziom}</span></div>`).join('')}</div>`:''}
          ${d.zainteresowania?`<div style="background:#fff;padding:12px;border-radius:6px;box-shadow:0 1px 6px rgba(30,64,175,0.06)"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${c1};margin-bottom:8px">Zainteresowania</div><div style="font-size:9.5px;color:#555;line-height:1.6">${d.zainteresowania}</div></div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:7.5px;color:#ccc;padding:8px">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
    </div>`;


  // ── DIAGONAL (ukośne cięcie jak na screenie) ──────────────
  if (tpl === 'diagonal') return `
    <div style="font-family:Arial,sans-serif;background:#f5f5f0;min-height:842px;position:relative;overflow:hidden">
      <!-- Dark header with diagonal cut -->
      <div style="position:relative;background:#1a3a2e;height:170px;overflow:hidden">
        <div style="position:absolute;bottom:-1px;left:0;right:0;height:60px;background:#f5f5f0;clip-path:polygon(0 100%,100% 100%,100% 40%,0 100%)"></div>
        <div style="position:absolute;bottom:-1px;left:0;right:0;height:60px;background:#f5f5f0;clip-path:polygon(0 60%,100% 0,100% 100%,0 100%);opacity:0.15"></div>
        <div style="padding:28px 32px 0;display:flex;align-items:center;gap:20px;position:relative;z-index:2">
          ${d.zdjecie?`<div style="width:90px;height:90px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,0.35);flex-shrink:0">${photo}</div>`:''}
          <div>
            <div style="font-size:30px;font-weight:800;color:#fff;letter-spacing:-0.5px;line-height:1">${name}</div>
            ${d.stanowisko?`<div style="font-size:11px;color:rgba(255,255,255,0.65);margin-top:6px;letter-spacing:1.5px;text-transform:uppercase">${d.stanowisko}</div>`:''}
          </div>
        </div>
      </div>
      <!-- Content -->
      <div style="display:grid;grid-template-columns:200px 1fr;padding:16px 32px 28px;gap:24px">
        <!-- Left col -->
        <div>
          <div style="font-size:11px;font-weight:700;color:#1a3a2e;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Dane kontaktowe</div>
          ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<div style="font-size:9.5px;color:#555;margin-bottom:5px;display:flex;align-items:flex-start;gap:5px"><span style="color:#1a3a2e;flex-shrink:0">›</span>${x}</div>`).join('')}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div style="margin-top:18px">
            <div style="font-size:11px;font-weight:700;color:#1a3a2e;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:10px">
                <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:2px"><div style="width:7px;height:7px;border-radius:50%;background:#1a3a2e;flex-shrink:0;margin-top:3px"></div><div style="font-size:10px;font-weight:700;color:#222">${e.kierunek||''}</div></div>
                <div style="font-size:9.5px;color:#555;padding-left:13px">${e.szkola}</div>
                <div style="font-size:9px;color:#999;padding-left:13px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
              </div>`).join('')}
          </div>`:''}
          ${skills.length?`
          <div style="margin-top:18px">
            <div style="font-size:11px;font-weight:700;color:#1a3a2e;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Umiejętności</div>
            ${skills.map(s=>`<div style="font-size:9.5px;color:#555;margin-bottom:4px">${s}</div>`).join('')}
          </div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`
          <div style="margin-top:18px">
            <div style="font-size:11px;font-weight:700;color:#1a3a2e;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Języki</div>
            ${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9.5px;color:#555;margin-bottom:4px">${l.jezyk} <span style="color:#aaa">– ${l.poziom}</span></div>`).join('')}
          </div>`:''}
        </div>
        <!-- Right col -->
        <div>
          ${d.podsumowanie?`
          <div style="margin-bottom:20px">
            <div style="font-size:13px;font-weight:700;color:#1a3a2e;margin-bottom:6px;border-bottom:2px solid #1a3a2e;padding-bottom:4px">Podsumowanie</div>
            <div style="font-size:10px;line-height:1.75;color:#444">${d.podsumowanie}</div>
          </div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div>
            <div style="font-size:13px;font-weight:700;color:#1a3a2e;margin-bottom:10px;border-bottom:2px solid #1a3a2e;padding-bottom:4px">Doświadczenie zawodowe</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:14px">
                <div style="font-size:11px;font-weight:700;color:#111">${e.stanowisko||''}, <span style="color:#1a3a2e">${e.firma||''}</span></div>
                <div style="font-size:9px;color:#aaa;margin-bottom:4px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
                ${e.opis?`<div style="font-size:10px;color:#555;line-height:1.7">${e.opis.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>`<div style="display:flex;gap:6px;margin-bottom:3px"><span style="color:#1a3a2e;flex-shrink:0">•</span>${l}</div>`).join('')}</div>`:''}
              </div>`).join('')}
          </div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:7.5px;color:#bbb;padding:8px">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
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
          ${d.stanowisko?`<div style="font-size:8.5px;color:rgba(255,255,255,0.55);text-align:center;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px">${d.stanowisko}</div>`:''}
          <div style="font-size:8px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px">Kontakt</div>
          ${[d.email,d.tel,d.adres].filter(Boolean).map(x=>`<div style="font-size:9px;color:rgba(255,255,255,0.7);margin-bottom:5px;word-break:break-all">${x}</div>`).join('')}
          ${skills.length?`<div style="font-size:8px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;margin:16px 0 8px">Umiejętności</div>${skills.map(s=>`<div style="font-size:9px;color:rgba(255,255,255,0.7);margin-bottom:4px">· ${s}</div>`).join('')}`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="font-size:8px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;margin:16px 0 8px">Języki</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9px;color:rgba(255,255,255,0.7);margin-bottom:4px">${l.jezyk} – ${l.poziom}</div>`).join('')}`:''}
        </div>
      </div>
      <!-- Main content -->
      <div style="flex:1;padding:30px 28px 28px 36px">
        ${d.podsumowanie?`<div style="margin-bottom:18px"><div style="font-size:13px;font-weight:700;color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:4px;margin-bottom:8px">Podsumowanie</div><div style="font-size:10px;line-height:1.75;color:#555">${d.podsumowanie}</div></div>`:''}
        ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
        <div style="margin-bottom:18px">
          <div style="font-size:13px;font-weight:700;color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:4px;margin-bottom:10px">Doświadczenie zawodowe</div>
          ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
            <div style="margin-bottom:13px">
              <div style="font-size:11px;font-weight:700;color:#111">${e.stanowisko||''}, <span style="color:#1a2744">${e.firma||''}</span></div>
              <div style="font-size:9px;color:#aaa;margin-bottom:4px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
              ${e.opis?`<div style="font-size:10px;color:#555;line-height:1.7">${e.opis.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>`<div style="display:flex;gap:6px;margin-bottom:3px"><span style="color:#1a2744">•</span>${l}</div>`).join('')}</div>`:''}
            </div>`).join('')}
        </div>`:''}
        ${d.wyksztalcenie.some(e=>e.szkola)?`
        <div>
          <div style="font-size:13px;font-weight:700;color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:4px;margin-bottom:10px">Wykształcenie</div>
          ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
            <div style="margin-bottom:10px;display:flex;gap:10px">
              <div style="width:7px;height:7px;border-radius:50%;background:#1a2744;flex-shrink:0;margin-top:4px"></div>
              <div>
                <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
                <div style="font-size:9.5px;color:#555">${e.szkola}</div>
                <div style="font-size:9px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
              </div>
            </div>`).join('')}
        </div>`:''}
        ${d.zainteresowania?`<div style="margin-top:14px"><div style="font-size:13px;font-weight:700;color:#1a2744;border-bottom:2px solid #1a2744;padding-bottom:4px;margin-bottom:8px">Referencje</div><div style="font-size:9.5px;color:#555">${d.zainteresowania}</div></div>`:''}
        <div style="margin-top:16px;font-size:7.5px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:8px;text-align:center">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
      </div>
    </div>`;

  // ── ARROW (pomarańczowy, ukośny nagłówek + strzałka) ──────
  if (tpl === 'arrow') return `
    <div style="font-family:Arial,sans-serif;background:#fff7f0;min-height:842px">
      <div style="position:relative;overflow:hidden;background:#fff7f0">
        <!-- Large diagonal shape -->
        <div style="position:absolute;top:0;left:0;width:260px;height:180px;background:#7c2d12;clip-path:polygon(0 0,100% 0,80% 100%,0 100%)"></div>
        <div style="position:absolute;top:0;left:200px;width:100px;height:180px;background:#fb923c;clip-path:polygon(0 0,100% 0,80% 100%,0 100%)"></div>
        <!-- Content overlay -->
        <div style="position:relative;z-index:2;padding:28px 32px;display:flex;align-items:center;gap:18px;height:180px">
          ${d.zdjecie?`<div style="width:88px;height:88px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,0.4);flex-shrink:0">${photo}</div>`:''}
          <div>
            <div style="font-size:27px;font-weight:800;color:#fff;letter-spacing:-0.5px;line-height:1">${name}</div>
            ${d.stanowisko?`<div style="font-size:10px;color:rgba(255,255,255,0.75);margin-top:6px;letter-spacing:2px;text-transform:uppercase">${d.stanowisko}</div>`:''}
          </div>
          <div style="margin-left:auto;text-align:right">${[d.email,d.tel,d.adres].filter(Boolean).map(x=>`<div style="font-size:9px;color:rgba(255,255,255,0.8);margin-bottom:3px">${x}</div>`).join('')}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 185px;padding:20px 32px 28px;gap:24px">
        <div>
          ${d.podsumowanie?`<div style="margin-bottom:18px"><div style="font-size:12px;font-weight:700;color:#7c2d12;border-bottom:2px solid #fb923c;padding-bottom:4px;margin-bottom:8px">Podsumowanie</div><div style="font-size:10px;line-height:1.75;color:#444">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:18px">
            <div style="font-size:12px;font-weight:700;color:#7c2d12;border-bottom:2px solid #fb923c;padding-bottom:4px;margin-bottom:10px">Doświadczenie zawodowe</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:13px">
                <div style="font-size:11px;font-weight:700;color:#111">${e.stanowisko||''}, <span style="color:#7c2d12">${e.firma||''}</span></div>
                <div style="font-size:9px;color:#fb923c;margin-bottom:4px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
                ${e.opis?`<div style="font-size:10px;color:#555;line-height:1.7">${e.opis.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>`<div style="display:flex;gap:6px;margin-bottom:3px"><span style="color:#fb923c">•</span>${l}</div>`).join('')}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:12px;font-weight:700;color:#7c2d12;border-bottom:2px solid #fb923c;padding-bottom:4px;margin-bottom:10px">Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:10px;padding-left:10px;border-left:3px solid #fb923c">
                <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:#555">${e.szkola}</div><div style="font-size:9px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              </div>`).join('')}
          </div>`:''}
        </div>
        <div>
          ${skills.length?`<div style="margin-bottom:16px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#7c2d12;margin-bottom:8px">Umiejętności</div>${skills.map(s=>`<div style="font-size:9px;padding:4px 8px;background:#7c2d1215;border-left:2px solid #fb923c;margin-bottom:3px;color:#333">${s}</div>`).join('')}</div>`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="margin-bottom:16px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#7c2d12;margin-bottom:8px">Języki</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:9.5px;margin-bottom:4px;color:#444">${l.jezyk} <span style="color:#bbb">– ${l.poziom}</span></div>`).join('')}</div>`:''}
          ${d.zainteresowania?`<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#7c2d12;margin-bottom:8px">Zainteresowania</div><div style="font-size:9.5px;color:#555;line-height:1.6">${d.zainteresowania}</div></div>`:''}
        </div>
      </div>
      <div style="text-align:center;font-size:7.5px;color:#ccc;padding:8px">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
    </div>`;

  // ── SPLIT (fioletowy, pionowy podział ukośny) ─────────────
  if (tpl === 'split') return `
    <div style="font-family:Arial,sans-serif;background:#faf5ff;min-height:842px;position:relative;overflow:hidden">
      <!-- Diagonal split background -->
      <div style="position:absolute;top:0;left:0;width:250px;bottom:0;background:#4a044e;clip-path:polygon(0 0,100% 0,75% 100%,0 100%)"></div>
      <div style="position:absolute;top:0;left:160px;width:120px;bottom:0;background:#7e22ce;clip-path:polygon(0 0,100% 0,60% 100%,0 100%);opacity:0.6"></div>
      <!-- Content grid -->
      <div style="position:relative;z-index:2;display:grid;grid-template-columns:190px 1fr;min-height:842px">
        <!-- Left: dark col -->
        <div style="padding:28px 16px 28px 22px;display:flex;flex-direction:column">
          ${d.zdjecie?`<div style="width:80px;height:80px;border-radius:50%;overflow:hidden;margin:0 auto 16px;border:3px solid rgba(255,255,255,0.3)">${photo}</div>`:''}
          <div style="font-size:16px;font-weight:700;color:#fff;text-align:center;line-height:1.2;margin-bottom:4px">${name}</div>
          ${d.stanowisko?`<div style="font-size:8.5px;color:rgba(255,255,255,0.55);text-align:center;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px">${d.stanowisko}</div>`:''}
          <div style="font-size:7.5px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;margin-bottom:7px">Kontakt</div>
          ${[d.email,d.tel,d.adres,d.linkedin].filter(Boolean).map(x=>`<div style="font-size:8.5px;color:rgba(255,255,255,0.7);margin-bottom:5px;word-break:break-all">${x}</div>`).join('')}
          ${skills.length?`<div style="font-size:7.5px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;margin:14px 0 7px">Umiejętności</div>${skills.map(s=>`<div style="font-size:8.5px;margin-bottom:5px"><span style="display:inline-block;background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.85);padding:2px 8px;border-radius:3px">${s}</span></div>`).join('')}`:''}
          ${d.jezyki.some(l=>l.jezyk)?`<div style="font-size:7.5px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;margin:14px 0 7px">Języki</div>${d.jezyki.filter(l=>l.jezyk).map(l=>`<div style="font-size:8.5px;color:rgba(255,255,255,0.75);margin-bottom:4px">${l.jezyk} – ${l.poziom}</div>`).join('')}`:''}
        </div>
        <!-- Right: light col -->
        <div style="padding:28px 24px 28px 16px">
          ${d.podsumowanie?`<div style="margin-bottom:18px"><div style="font-size:12px;font-weight:700;color:#4a044e;border-bottom:2px solid #d8b4fe;padding-bottom:4px;margin-bottom:8px">Podsumowanie</div><div style="font-size:10px;line-height:1.75;color:#555">${d.podsumowanie}</div></div>`:''}
          ${d.doswiadczenie.some(e=>e.firma||e.stanowisko)?`
          <div style="margin-bottom:18px">
            <div style="font-size:12px;font-weight:700;color:#4a044e;border-bottom:2px solid #d8b4fe;padding-bottom:4px;margin-bottom:10px">Doświadczenie zawodowe</div>
            ${d.doswiadczenie.filter(e=>e.firma||e.stanowisko).map(e=>`
              <div style="margin-bottom:13px">
                <div style="font-size:11px;font-weight:700;color:#111">${e.stanowisko||''}, <span style="color:#7e22ce">${e.firma||''}</span></div>
                <div style="font-size:9px;color:#a855f7;margin-bottom:4px">${[e.od,e.do].filter(Boolean).join(' – ')}</div>
                ${e.opis?`<div style="font-size:10px;color:#555;line-height:1.7">${e.opis.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>`<div style="display:flex;gap:6px;margin-bottom:3px"><span style="color:#a855f7">•</span>${l}</div>`).join('')}</div>`:''}
              </div>`).join('')}
          </div>`:''}
          ${d.wyksztalcenie.some(e=>e.szkola)?`
          <div>
            <div style="font-size:12px;font-weight:700;color:#4a044e;border-bottom:2px solid #d8b4fe;padding-bottom:4px;margin-bottom:10px">Wykształcenie</div>
            ${d.wyksztalcenie.filter(e=>e.szkola).map(e=>`
              <div style="margin-bottom:10px">
                <div style="font-size:11px;font-weight:700;color:#222">${e.kierunek||''}</div>
                <div style="display:flex;justify-content:space-between"><div style="font-size:9.5px;color:#555">${e.szkola}</div><div style="font-size:9px;color:#aaa">${[e.od,e.do].filter(Boolean).join(' – ')}</div></div>
              </div>`).join('')}
          </div>`:''}
          ${d.zainteresowania?`<div style="margin-top:14px"><div style="font-size:12px;font-weight:700;color:#4a044e;border-bottom:2px solid #d8b4fe;padding-bottom:4px;margin-bottom:8px">Referencje</div><div style="font-size:9.5px;color:#555">${d.zainteresowania}</div></div>`:''}
          <div style="margin-top:16px;font-size:7.5px;color:#ccc;border-top:1px solid #ede9fe;padding-top:8px;text-align:center">Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb rekrutacji.</div>
        </div>
      </div>
    </div>`;

  return '';
}