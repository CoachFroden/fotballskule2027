(() => {
  'use strict';

  let scheduled = false;

  const PAGE_RULES = [
    { type: 'attendance', icon: '✅', test: /krysselist|oppmøte|mangler nå/i },
    { type: 'program', icon: '📅', test: /dagsprogram|program & meny|program og meny|dagar|dagprogram/i },
    { type: 'plan', icon: '🔄', test: /instruktørplan|bemanning/i },
    { type: 'groups', icon: '👥', test: /deltakargruppe|grupper|gruppe \d/i },
    { type: 'exercises', icon: '⚽', test: /øving|oving|øvels/i },
    { type: 'safety', icon: '🚑', test: /tryggleik|kontakt|allerg|helse/i },
    { type: 'feedback', icon: '💬', test: /tilbakemeld|evaluering/i },
    { type: 'admin', icon: '🛡️', test: /administr|import|årgang|deltakarar|instruktørar/i },
    { type: 'instructions', icon: '📋', test: /instruks|ansvar & oppgåver|ansvar og oppgåver/i },
    { type: 'people', icon: '🧑‍🤝‍🧑', test: /vaksne|ansvarsfordeling/i },
    { type: 'auth', icon: '🔐', test: /innlogging|logg inn/i }
  ];

  function pageText() {
    const intro = document.getElementById('pageIntro');
    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    return `${intro?.textContent || ''} ${menu?.textContent || ''} ${content?.querySelector('h1,h2,h3')?.textContent || ''}`.trim();
  }

  function classify() {
    const text = pageText();
    return PAGE_RULES.find(rule => rule.test.test(text)) || { type: 'general', icon: '⚽' };
  }

  function isV2Home() {
    return Boolean(document.querySelector('.v2-home, .v2-hero'));
  }

  function markGroups() {
    document.querySelectorAll('.instruction-section').forEach(section => {
      const match = section.querySelector('h3')?.textContent?.match(/gruppe\s*(\d+)/i);
      if (match && section.dataset.v2Group !== match[1]) section.dataset.v2Group = match[1];
    });

    document.querySelectorAll('.schedule-mini-card').forEach(card => {
      const match = card.textContent?.match(/gruppe\s*(\d+)/i);
      if (match && !card.classList.contains(`group-card-${match[1]}`)) card.classList.add(`group-card-${match[1]}`);
    });
  }

  function addIdentity(hero) {
    if (!hero || hero.querySelector('.v2-football-stamp')) return;
    const stamp = document.createElement('div');
    stamp.className = 'v2-football-stamp';
    stamp.innerHTML = '<span aria-hidden="true">⚽</span><b>TINE Fotballskule</b><span>Samnanger IL</span>';
    hero.appendChild(stamp);
  }


  function enhanceSubpage() {
    if (isV2Home()) {
      document.body.classList.remove('v2-subpage');
      delete document.body.dataset.v2Page;
      return;
    }

    const intro = document.getElementById('pageIntro');
    const hero = intro?.querySelector('.hero-card');
    const content = document.getElementById('content');
    const menu = document.getElementById('mainMenu');
    if (!hero && !content?.children.length) return;

    const page = classify();
    document.body.classList.add('v2-enabled', 'v2-subpage');
    document.body.dataset.v2Page = page.type;

    if (hero) {
      if (hero.dataset.v2Icon !== page.icon) hero.dataset.v2Icon = page.icon;
      hero.classList.add('v2-subhero');
      addIdentity(hero);
      intro?.querySelectorAll('.v2-pitch-ribbon').forEach(el => el.remove());
    }

    content?.classList.add('v2-page-content');
    menu?.classList.add('v2-context-nav');
    markGroups();
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { enhanceSubpage(); } catch (error) { console.error('V2 sideforbetring feila:', error); }
    });
  }

  const previousShowHome = window.showHome;
  if (previousShowHome) {
    window.showHome = function () {
      document.body.classList.remove('v2-subpage');
      delete document.body.dataset.v2Page;
      const result = previousShowHome.apply(this, arguments);
      Promise.resolve(result).finally(() => window.setTimeout(scheduleEnhance, 0));
      return result;
    };
    window.goHome = window.showHome;
  }

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.getElementById('pageIntro') || document.body, { childList: true, subtree: true, characterData: true });
  const menu = document.getElementById('mainMenu');
  const content = document.getElementById('content');
  if (menu) observer.observe(menu, { childList: true, subtree: true, characterData: true });
  if (content) observer.observe(content, { childList: true, subtree: true, characterData: true });

  document.addEventListener('click', event => {
    if (event.target.closest('button,a,summary,select,input')) window.setTimeout(scheduleEnhance, 0);
  }, true);

  scheduleEnhance();
})();
