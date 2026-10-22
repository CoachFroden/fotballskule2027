(() => {
  'use strict';
  const intro = document.getElementById('pageIntro');
  const menu = document.getElementById('mainMenu');
  const content = document.getElementById('content');
  if (!intro || !menu || !content) return;
  const items = [
    ['⌂','Hovudside','showHome'],
    ['▦','Program','showAdminDays'],
    ['♙','Deltakarar','showAdminParticipants'],
    ['♧','Instruktørar','showAdminInstructors'],
    ['♟','Vaksne','showAdminAdults'],
    ['✉','Tilbakemeldingar','showSimpleFeedbackAdmin'],
    ['⚙','Administrasjon','showAdmin']
  ];
  const sidebar = document.createElement('aside');
  sidebar.className = 'match-sidebar match-global-sidebar';
  sidebar.setAttribute('aria-label','Hovudnavigasjon');
  sidebar.innerHTML = '<div class="match-side-logo"><span>SAMNANGER IL</span><strong>FOTBALLSKULE <em>2027</em></strong></div><nav aria-label="Fotballskule-meny">' +
    items.map(([symbol,title,fn]) => '<button type="button" class="match-side-link" data-target="'+fn+'"><span aria-hidden="true">'+symbol+'</span>'+title+'</button>').join('') +
    '</nav><div class="match-side-footer"><strong>MEIR ENN FOTBALL</strong><small>Samhald · Glede · Meistring</small></div>';
  sidebar.querySelectorAll('[data-target]').forEach(button => button.addEventListener('click', () => {
    const fn = window[button.dataset.target];
    if (typeof fn === 'function') fn();
  }));
  document.body.appendChild(sidebar);
  let scheduled = false;
  function sync() {
    scheduled = false;
    const onHome = Boolean(content.querySelector('.match-shell'));
    const onSubpage = Boolean(intro.querySelector('.hero-card'));
    const active = document.body.classList.contains('v2-enabled') && onSubpage && !onHome;
    document.body.classList.toggle('match-subpage', active);
    if (!active) return;
    const label = intro.querySelector('h2')?.textContent?.toLowerCase() || '';
    let target = 'showAdmin';
    if (/deltakar|påmelding|gruppe/.test(label)) target='showAdminParticipants';
    else if (/instruktør/.test(label)) target='showAdminInstructors';
    else if (/vaksne|ansvar/.test(label)) target='showAdminAdults';
    else if (/program|dag|meny/.test(label)) target='showAdminDays';
    else if (/tilbakemelding|svar/.test(label)) target='showSimpleFeedbackAdmin';
    sidebar.querySelectorAll('[data-target]').forEach(button => button.classList.toggle('current',button.dataset.target===target));
    const year = document.getElementById('currentYearLabel')?.textContent?.match(/20\d{2}/)?.[0];
    if(year) sidebar.querySelector('em').textContent=year;
  }
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(sync);
  });
  observer.observe(intro,{childList:true,subtree:true});
  observer.observe(content,{childList:true});
  sync();
})();