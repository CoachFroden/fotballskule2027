(() => {
  'use strict';

  const auth = firebase.auth();
  const db = firebase.firestore();
  let cachedDays = [];
  let selectedDayId = '';

  const DAY_TASKS_2026 = {
    '2026-06-22': [
      ['📝', 'Registrering og oppmøte', 'Ta imot deltakarar og føresette, og hjelp alle til rett gruppe.'],
      ['🎒', 'Utdeling', 'Fordel ball, sekk og t-skjorte og hald oversikt over utdelinga.'],
      ['🍽️', 'Matservering', 'Gjer klar og server lunsj til gruppene.'],
      ['⚠️', 'Allergiar og spesielle behov', 'Sjekk tryggleiksinformasjonen før mat og følg opp behov gjennom dagen.'],
      ['🍎', 'Frukt', 'Del opp, gjer klar og server frukt.'],
      ['🧹', 'Rydding', 'Rydd kjøkken, serveringsområde, bane og utstyr før dagen er slutt.']
    ],
    '2026-06-23': [
      ['🍽️', 'Matservering', 'Gjer klar og server lunsj til gruppene.'],
      ['⚠️', 'Allergiar og spesielle behov', 'Sjekk tryggleiksinformasjonen før mat og følg opp behov gjennom dagen.'],
      ['🍎', 'Frukt', 'Del opp, gjer klar og server frukt.'],
      ['🧹', 'Rydding', 'Rydd kjøkken, serveringsområde, bane og utstyr før dagen er slutt.']
    ],
    '2026-06-24': [
      ['🍽️', 'Matservering', 'Gjer klar og server lunsj til gruppene.'],
      ['⚠️', 'Allergiar og spesielle behov', 'Sjekk tryggleiksinformasjonen før mat og følg opp behov gjennom dagen.'],
      ['🍎', 'Frukt', 'Del opp, gjer klar og server frukt.'],
      ['🏟️', 'Storkampen', 'Hjelp med organisering, oversikt og tryggleik rundt storkampen.'],
      ['🧹', 'Opprydding av anlegget', 'Samle inn utstyr og sørg for at klubbhus, bane og område er ryddige.']
    ]
  };

  const GENERAL_TASKS = [
    ['👀', 'Ver synlege og tilgjengelege', 'Følg med på at alle barna har det bra, og hjelp instruktørane når dei treng ein vaksen.'],
    ['💧', 'Pausar og drikke', 'Følg opp barn som treng ekstra pause, drikke eller litt ro.'],
    ['🚑', 'Skadar og uro', 'Ta over ved skade, uro eller situasjonar instruktørane ikkje skal stå i åleine. Kontakt føresette ved behov, og ring 113 ved alvorleg skade eller sjukdom.'],
    ['🚪', 'Ingen går utan avtale', 'Pass på at ingen barn forlèt området utan at det er avklart.'],
    ['🏠', 'Trygg heimreise', 'Sjekk at alle blir henta eller kjem seg trygt heim ved avslutning.']
  ];

  function esc(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function currentYear() {
    const text = document.getElementById('currentYearLabel')?.textContent || '';
    return text.match(/\b(20\d{2})\b/)?.[1] || '';
  }

  function isSeptemberDay(day = {}) {
    const raw = String(day.date || day.id || '');
    return /^20\d{2}-09(?:-|$)/.test(raw) || /\bseptember\b/i.test(`${day.title || ''} ${day.name || ''}`);
  }

  function localIsoDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  }

  function shortDay(value) {
    if (!value) return value;
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    const weekday = new Intl.DateTimeFormat('nn-NO', { weekday: 'short' }).format(date).replace('.', '');
    const day = new Intl.DateTimeFormat('nn-NO', { day: 'numeric' }).format(date);
    return `${weekday} ${day}`;
  }

  function programRows(text = '') {
    return String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const match = line.match(/^(\d{1,2}[.:]\d{2})\s*[-–]?\s*(.*)$/);
      return match ? { time: match[1].replace('.', ':'), title: match[2] || line } : { time: '', title: line };
    });
  }

  async function getRole() {
    const user = auth.currentUser;
    if (!user) return null;
    const doc = await db.collection('users').doc(user.uid).get();
    return doc.exists ? doc.data().role || null : null;
  }

  function dayKey(day = {}) {
    return String(day.date || day.id || '');
  }

  function defaultSelectedDay(days) {
    const today = localIsoDate();
    return days.find(day => dayKey(day) === today)
      || days.find(day => dayKey(day) > today)
      || days[days.length - 1]
      || null;
  }

  function genericTasks(day) {
    const text = `${day.program || ''} ${day.note || ''}`.toLowerCase();
    const tasks = [];
    if (/registr/.test(text)) tasks.push(['📝', 'Registrering og oppmøte', 'Ta imot deltakarar og hjelp alle til rett gruppe.']);
    tasks.push(['🍽️', 'Mat og servering', 'Gjer klar servering og sjekk allergiar og spesielle behov før mat blir delt ut.']);
    if (/frukt/.test(text)) tasks.push(['🍎', 'Frukt', 'Gjer klar og server frukt, og rydd etterpå.']);
    if (/storkamp/.test(text)) tasks.push(['🏟️', 'Storkamp', 'Hjelp med organisering, oversikt og tryggleik.']);
    tasks.push(['🧹', 'Rydding', 'Hald orden gjennom dagen og sørg for at området er ryddig ved avslutning.']);
    return tasks;
  }

  function tasksFor(day, year) {
    return DAY_TASKS_2026[dayKey(day)] || genericTasks(day);
  }

  function renderTask(task) {
    return `<article class="responsible-task-card">
      <span class="responsible-task-icon" aria-hidden="true">${task[0]}</span>
      <div><strong>${esc(task[1])}</strong><p>${esc(task[2])}</p></div>
    </article>`;
  }

  function renderDay(day, year) {
    const target = document.getElementById('responsibleDailyBody');
    if (!target || !day) return;
    selectedDayId = day.id;

    document.querySelectorAll('.responsible-day-pill').forEach(button => {
      button.classList.toggle('is-active', button.dataset.dayId === day.id);
    });

    const tasks = tasksFor(day, year);
    const rows = programRows(day.program || '');
    const note = String(day.note || '').trim();

    target.innerHTML = `
      <div class="responsible-shared-banner">
        <span>🤝</span>
        <div><strong>Felles ansvar</strong><p>Alle ansvarlege har ansvar for desse oppgåvene. Fordel dei mellom dykk slik det passar gjennom dagen.</p></div>
      </div>

      <section class="responsible-daily-section">
        <div class="responsible-section-head"><div><span class="responsible-kicker">Dagens sjekkliste</span><h3>${esc(day.title || formatDate(dayKey(day)) || 'Programdag')}</h3></div><span class="responsible-count">${tasks.length} oppgåver</span></div>
        <div class="responsible-task-grid">${tasks.map(renderTask).join('')}</div>
      </section>

      ${rows.length ? `<section class="responsible-daily-section">
        <div class="responsible-section-head"><div><span class="responsible-kicker">Når skjer kva?</span><h3>Dagsprogram</h3></div></div>
        <div class="responsible-timeline">${rows.map(row => `<div class="responsible-time-row"><strong>${esc(row.time || '•')}</strong><span>${esc(row.title)}</span></div>`).join('')}</div>
      </section>` : ''}

      ${note ? `<section class="responsible-note"><strong>📌 Beskjed for dagen</strong><p>${esc(note).replaceAll('\n', '<br>')}</p></section>` : ''}

      <section class="responsible-daily-section">
        <div class="responsible-section-head"><div><span class="responsible-kicker">Heile dagen</span><h3>Dette gjeld alltid</h3></div></div>
        <div class="responsible-task-grid compact">${GENERAL_TASKS.map(renderTask).join('')}</div>
      </section>`;
  }

  window.selectResponsibleDay = function (id) {
    const day = cachedDays.find(item => item.id === id);
    if (day) renderDay(day, currentYear());
  };

  function markDock() {
    document.querySelectorAll('.v2-dock-button').forEach(button => button.classList.remove('is-active'));
    document.querySelector('.responsible-daily-dock')?.classList.add('is-active');
  }

  window.showResponsibleDaily = async function () {
    if (await getRole() !== 'responsible') return window.showHome?.();
    const year = currentYear();
    if (!year) return;

    const intro = document.getElementById('pageIntro');
    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    if (!intro || !menu || !content) return;

    intro.innerHTML = `<div class="hero-card"><p class="hero-kicker">Ansvarleg · Fotballskule ${esc(year)}</p><h2>Dagens ansvar</h2><p>Felles arbeidsplan for dei ansvarlege vaksne.</p></div>`;
    menu.innerHTML = '<button class="back-button" type="button" onclick="showHome()">← Framside</button>';
    content.innerHTML = '<div class="welcome-box"><div class="status-box info">Hentar dagsplan…</div></div>';

    try {
      const snap = await db.collection('years').doc(year).collection('days').get();
      cachedDays = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(day => !isSeptemberDay(day))
        .sort((a, b) => dayKey(a).localeCompare(dayKey(b)));

      if (!cachedDays.length) {
        content.innerHTML = '<div class="welcome-box"><div class="status-box info">Ingen programdagar er registrerte.</div></div>';
        return;
      }

      const first = cachedDays.find(day => day.id === selectedDayId) || defaultSelectedDay(cachedDays);
      content.innerHTML = `<div class="welcome-box responsible-daily-shell">
        <div class="responsible-day-picker" aria-label="Vel programdag">
          ${cachedDays.map(day => `<button class="responsible-day-pill" data-day-id="${esc(day.id)}" type="button" onclick="selectResponsibleDay('${esc(day.id)}')"><span>${esc(shortDay(dayKey(day)))}</span><small>${esc(day.title || '')}</small></button>`).join('')}
        </div>
        <div id="responsibleDailyBody"></div>
      </div>`;
      renderDay(first, year);
      ensureResponsibleDock();
      markDock();
    } catch (error) {
      console.error('Dagens ansvar:', error);
      content.innerHTML = '<div class="welcome-box"><div class="status-box error">Kunne ikkje hente dagsansvaret.</div></div>';
    }
  };

  // Behald gamle lenker, men send dei til den praktiske dagsplanen.
  window.showResponsibleInstructions = window.showResponsibleDaily;

  function ensureResponsibleDock() {
    if (document.body.dataset.v2Role !== 'responsible') return;
    const dock = document.getElementById('v2Dock');
    if (!dock || dock.querySelector('.responsible-daily-dock')) return;

    const button = document.createElement('button');
    button.className = 'v2-dock-button responsible-daily-dock';
    button.type = 'button';
    button.innerHTML = '<span class="v2-dock-icon">☑</span><span class="v2-dock-label">Ansvar</span>';
    button.addEventListener('click', window.showResponsibleDaily);

    const plan = [...dock.querySelectorAll('.v2-dock-button')].find(item => /Plan/i.test(item.textContent || ''));
    dock.insertBefore(button, plan || dock.lastElementChild);
  }

  function patchResponsibleHome() {
    if (document.body.dataset.v2Role !== 'responsible') return;
    document.querySelectorAll('.v2-action').forEach(button => {
      const title = button.querySelector('.v2-action-copy strong');
      const subtitle = button.querySelector('.v2-action-copy span');
      if (title?.textContent.trim() === 'Ansvar & oppgåver') {
        title.textContent = 'Dagens ansvar';
        if (subtitle) subtitle.textContent = 'Felles arbeidsplan gjennom dagen';
      }
    });
    ensureResponsibleDock();
  }

  let patchQueued = false;
  const observer = new MutationObserver(() => {
    if (patchQueued) return;
    patchQueued = true;
    requestAnimationFrame(() => {
      patchQueued = false;
      patchResponsibleHome();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.setTimeout(patchResponsibleHome, 250);
})();
