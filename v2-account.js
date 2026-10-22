(() => {
  'use strict';

  let scheduled = false;

  function isAdminMorePage() {
    const introText = document.getElementById('pageIntro')?.textContent || '';
    return /\bMeir\b|\bMer\b/i.test(introText);
  }

  function enhanceAdminDock() {
    const dock = document.querySelector('.v2-dock');
    if (!dock) return;

    const role = document.body.dataset.v2Role || '';
    if (role !== 'admin') {
      dock.classList.remove('has-admin-more');
      return;
    }

    dock.classList.add('has-admin-more');

    let more = dock.querySelector('[data-v2-admin-more]');
    if (!more) {
      more = document.createElement('button');
      more.type = 'button';
      more.className = 'v2-dock-button';
      more.dataset.v2AdminMore = 'true';
      more.setAttribute('aria-label', 'Meir og logg ut');
      more.innerHTML = '<span class="v2-dock-icon">•••</span><span class="v2-dock-label">Meir</span>';
      more.addEventListener('click', () => {
        if (typeof window.v2ShowMore === 'function') window.v2ShowMore();
      });
      dock.appendChild(more);
    }

    more.classList.toggle('is-active', isAdminMorePage());
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { enhanceAdminDock(); } catch (error) { console.error('Admin-dock:', error); }
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-v2-role', 'hidden'] });
  document.addEventListener('click', () => window.setTimeout(schedule, 0), true);
  schedule();
})();
