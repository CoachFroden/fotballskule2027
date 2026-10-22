(() => {
  'use strict';

  let scheduled = false;

  function enhanceHome() {
    const hero = document.querySelector('.v2-home .v2-hero');
    if (!hero) return;

    if (!hero.querySelector('.v2-home-football')) {
      const art = document.createElement('div');
      art.className = 'v2-home-football';
      art.setAttribute('aria-hidden', 'true');
      art.innerHTML = `
        <span class="pitch-outline"></span>
        <span class="goal-box"></span>
        <span class="ball">⚽</span>
        <span class="cone c1">▲</span>
        <span class="cone c2">▲</span>
        <span class="cone c3">▲</span>`;
      hero.appendChild(art);
    }

    if (!hero.querySelector('.v2-school-tag')) {
      const tag = document.createElement('div');
      tag.className = 'v2-school-tag';
      tag.innerHTML = '<span aria-hidden="true">⚽</span><div><strong>TINE Fotballskule</strong><small>Fotballglede · meistring · fellesskap</small></div>';
      hero.appendChild(tag);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { enhanceHome(); } catch (error) { console.error('Fotballgrafikk feila:', error); }
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.getElementById('content') || document.body, { childList: true, subtree: true });

  const previousShowHome = window.showHome;
  if (previousShowHome) {
    window.showHome = function () {
      const result = previousShowHome.apply(this, arguments);
      Promise.resolve(result).finally(() => window.setTimeout(schedule, 0));
      return result;
    };
    window.goHome = window.showHome;
  }

  schedule();
})();
