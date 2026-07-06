// Pływający widget Asystenta Prawnego i Podatkowego AI.
// Wstrzykiwany na podstronach treściowych; na desktopie otwiera panel
// z czatem (iframe), na mobile przenosi na pełną stronę asystenta.
(function () {
  if (window.__apWidget) return;
  window.__apWidget = true;

  var css = [
    '#apwBtn{position:fixed;bottom:22px;right:22px;z-index:99990;display:flex;align-items:center;gap:8px;height:54px;padding:0 16px 0 14px;border:none;border-radius:100px;cursor:pointer;font-family:inherit;font-size:22px;color:#fff;background:linear-gradient(135deg,#7c3aed 0%,#db2777 50%,#0891b2 100%);box-shadow:0 4px 20px rgba(124,58,237,.38);transition:transform .18s,box-shadow .18s,opacity .2s}',
    '#apwBtn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(124,58,237,.48)}',
    '#apwBtn.hidden{opacity:0;pointer-events:none}',
    '#apwBtn .apw-lbl{font-size:13.5px;font-weight:600;letter-spacing:-.01em;white-space:nowrap}',
    '@media(max-width:640px){#apwBtn{height:52px;padding:0;width:52px;justify-content:center}#apwBtn .apw-lbl{display:none}}',
    '#apwPanel{position:fixed;bottom:16px;right:16px;z-index:99991;width:min(430px,calc(100vw - 32px));height:min(680px,calc(100vh - 32px));background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.28);display:flex;flex-direction:column;opacity:0;transform:translateY(16px);pointer-events:none;transition:opacity .22s,transform .22s}',
    '#apwPanel.open{opacity:1;transform:none;pointer-events:auto}',
    '#apwPanel .apw-head{display:flex;align-items:center;gap:8px;padding:10px 12px 10px 16px;border-bottom:1px solid rgba(0,0,0,.08);background:#fafafa;flex-shrink:0}',
    '#apwPanel .apw-title{font-size:13.5px;font-weight:600;color:#1d1d1f;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#apwPanel .apw-full,#apwPanel .apw-close{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:none;border-radius:8px;background:none;color:#6e6e73;font-size:15px;cursor:pointer;text-decoration:none;transition:background .15s}',
    '#apwPanel .apw-full:hover,#apwPanel .apw-close:hover{background:rgba(0,0,0,.06)}',
    '#apwPanel .apw-frame{flex:1;width:100%;border:none}',
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.id = 'apwBtn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Otwórz Asystenta Prawnego AI');
  btn.innerHTML = '⚖️<span class="apw-lbl">Zapytaj AI</span>';
  document.body.appendChild(btn);

  var panel = null;

  function openPanel() {
    if (window.innerWidth < 768) {
      window.location.href = 'asystent-prawny.html';
      return;
    }
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'apwPanel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Asystent Prawny AI');
      panel.innerHTML =
        '<div class="apw-head">' +
          '<span class="apw-title">⚖️ Asystent Prawny i Podatkowy AI</span>' +
          '<a class="apw-full" href="asystent-prawny.html" title="Otwórz pełną wersję">⤢</a>' +
          '<button class="apw-close" type="button" aria-label="Zamknij">✕</button>' +
        '</div>' +
        '<iframe class="apw-frame" src="asystent-prawny.html" title="Asystent Prawny AI"></iframe>';
      document.body.appendChild(panel);
      panel.querySelector('.apw-close').addEventListener('click', closePanel);
    }
    requestAnimationFrame(function () { panel.classList.add('open'); });
    btn.classList.add('hidden');
  }

  function closePanel() {
    panel.classList.remove('open');
    btn.classList.remove('hidden');
  }

  btn.addEventListener('click', openPanel);
})();
