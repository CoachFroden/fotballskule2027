(() => {
  'use strict';

  const auth = firebase.auth();
  const db = firebase.firestore();
  const previousShowHome = window.showHome;
  let renderToken = 0;
  let cachedRole = null;
  let cachedUid = null;
  let previewRole = null;

  const ROLE = {
    admin: { label: 'Administrator', short: 'Admin' },
    instructor: { label: 'Instruktør', short: 'Instruktør' },
    responsible: { label: 'Ansvarleg', short: 'Ansvarleg' }
  };

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
    const value = String(day.date || day.id || '');
    return /^20\d{2}-09(?:-|$)/.test(value) || /\bseptember\b/i.test(`${day.title || ''} ${day.name || ''}`);
  }

  function localIsoDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateParts(value) {
    const date = parseDate(value);
    if (!date) return { day: '–', month: '', long: value || '' };
    return {
      day: new Intl.DateTimeFormat('nn-NO', { day: '2-digit' }).format(date),
      month: new Intl.DateTimeFormat('nn-NO', { month: 'short' }).format(date).replace('.', ''),
      long: new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
    };
  }

  function firstUsefulLine(text = '') {
    return String(text)
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)[0] || '';
  }

  function programLines(text = '') {
    return String(text)
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 10) return 'God morgon';
    if (hour < 17) return 'Hei';
    return 'God kveld';
  }

  async function getRole() {
    if (previewRole && auth.currentUser && cachedRole === 'admin' && cachedUid === auth.currentUser.uid) return previewRole;
    const user = auth.currentUser;
    if (!user) return null;
    if (cachedUid === user.uid && cachedRole) return previewRole && cachedRole === 'admin' ? previewRole : cachedRole;
    const doc = await db.collection('users').doc(user.uid).get();
    cachedUid = user.uid;
    cachedRole = doc.exists ? doc.data().role || null : null;
    return previewRole && cachedRole === 'admin' ? previewRole : cachedRole;
  }

  window.v2PreviewRole = async function (role) {
    const user = auth.currentUser;
    if (!user) return;
    const profile = await db.collection('users').doc(user.uid).get();
    if (!profile.exists || profile.data().role !== 'admin') return;
    cachedRole = 'admin'; cachedUid = user.uid;
    previewRole = ['instructor', 'responsible'].includes(role) ? role : null;
    window.showHome();
  };

  async function loadDashboardData(role, year) {
    const yearRef = db.collection('years').doc(year);
    const common = await Promise.all([
      yearRef.get(),
      yearRef.collection('participants').get(),
      yearRef.collection('instructors').get(),
      yearRef.collection('adults').get(),
      yearRef.collection('days').get(),
      db.collection('years').get()
    ]);

    const yearDoc = common[0];
    const participants = common[1].docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const instructors = common[2].docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const adults = common[3].docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const days = common[4].docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(day => !isSeptemberDay(day))
      .sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));
    const years = common[5].docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => Number(b.id) - Number(a.id));

    const today = localIsoDate();
    let focusDay = days.find(day => String(day.date || day.id) === today) || null;
    let dayRelation = 'I dag';
    if (!focusDay) {
      focusDay = days.find(day => String(day.date || day.id) > today) || null;
      dayRelation = focusDay ? 'Neste programdag' : 'Siste programdag';
    }
    if (!focusDay && days.length) focusDay = days[days.length - 1];

    let plan = null;
    if (focusDay) {
      try {
        const planDoc = await yearRef.collection('instructorPlans').doc(focusDay.id).get();
        plan = planDoc.exists ? planDoc.data() : null;
      } catch (_) {
        plan = null;
      }
    }

    let privateRows = [];
    let feedbackCount = null;
    if (role === 'admin' || role === 'responsible') {
      try {
        const privateSnap = await yearRef.collection('participantPrivate').get();
        privateRows = privateSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (_) {
        privateRows = [];
      }
    }
    if (role === 'admin') {
      try {
        const feedbackSnap = await yearRef.collection('feedback').get();
        feedbackCount = feedbackSnap.size;
      } catch (_) {
        feedbackCount = null;
      }
    }

    const healthCount = privateRows.filter(row =>
      String(row.allergy || '').trim() ||
      String(row.health || row.healthNotes || row.healthChallenges || row.medical || row.notes || '').trim()
    ).length;
    const contactCount = privateRows.filter(row => String(row.guardian || '').trim()).length;
    const assignedIds = new Set([
      ...Object.keys(plan?.for || {}),
      ...Object.keys(plan?.etter || {})
    ]);

    return {
      year,
      yearData: yearDoc.exists ? yearDoc.data() : {},
      years,
      participants,
      instructors,
      adults,
      days,
      focusDay,
      dayRelation,
      plan,
      assignedCount: assignedIds.size,
      healthCount,
      contactCount,
      feedbackCount
    };
  }

  function roleDescription(role) {
    if (role === 'admin') return 'Full oversikt over folk, drift og det som krev handling.';
    if (role === 'responsible') return 'Tryggleik, kontakt og drift — det viktigaste når noko skjer.';
    return 'Plan, oppmøte og øvingar — alt du treng ute på feltet.';
  }

  function roleHeroTitle(role, year) {
    if (role === 'admin') return `Kontrollrom ${year}`;
    if (role === 'responsible') return `Trygg drift ${year}`;
    return `Klar for banen ${year}`;
  }

  function yearSelect(data, role) {
    if (role !== 'admin' || data.years.length < 2) {
      return `<span class="v2-state-pill">${esc(data.yearData?.status === 'archived' ? 'Arkiv' : 'Aktiv årgang')} · ${esc(data.year)}</span>`;
    }
    return `<select class="v2-year-select" aria-label="Vel årgang" onchange="v2ChangeYear(this.value)">
      ${data.years.map(item => `<option value="${esc(item.id)}" ${item.id === data.year ? 'selected' : ''}>${esc(item.id)}${item.status === 'archived' ? ' · arkiv' : ''}</option>`).join('')}
    </select>`;
  }

  function todayCard(data, role) {
    const day = data.focusDay;
    if (!day) {
      return `<div class="v2-notice"><span class="v2-notice-icon">📅</span><div><strong>Ingen programdagar enno</strong><p>${role === 'admin' ? 'Legg inn programdagane under Administrasjon.' : 'Programmet er ikkje publisert enno.'}</p></div></div>`;
    }

    const parts = dateParts(day.date || day.id);
    const lines = programLines(day.program || '');
    const menu = firstUsefulLine(day.menu || '') || 'Meny ikkje lagt inn';
    const note = String(day.note || '').trim();
    const planText = data.assignedCount ? `${data.assignedCount} instruktørar sett opp` : 'Sjå instruktørplan';

    return `<article class="v2-today-card">
      <div>
        <div class="v2-date-block">
          <div class="v2-date-badge"><strong>${esc(parts.day)}</strong><span>${esc(parts.month)}</span></div>
          <div class="v2-day-copy">
            <p class="v2-eyebrow">${esc(data.dayRelation)}</p>
            <h3>${esc(day.title || parts.long || 'Fotballskuledag')}</h3>
            <p>${esc(parts.long)}</p>
          </div>
        </div>
        ${lines.length ? `<div class="v2-program-lines">${lines.map(line => `<div class="v2-program-line">${esc(line)}</div>`).join('')}</div>` : '<div class="v2-program-lines"><div class="v2-program-line">Program ikkje lagt inn enno</div></div>'}
      </div>
      <div class="v2-today-side">
        <div class="v2-info-tile"><span>🍽️ Mat</span><strong>${esc(menu)}</strong></div>
        <div class="v2-info-tile"><span>🔄 Bemanning</span><strong>${esc(planText)}</strong></div>
        ${note && role !== 'instructor' ? `<div class="v2-info-tile"><span>📌 Beskjed</span><strong>${esc(note)}</strong></div>` : ''}
        <button class="v2-action" type="button" onclick="v2Open('showDays','home')" style="min-height:auto;padding:13px"><span class="v2-action-copy"><strong>Opne heile dagsplanen →</strong><span>Program, meny og beskjedar</span></span></button>
      </div>
    </article>`;
  }

  function action(icon, title, subtitle, fn, tone = '', active = 'more') {
    return `<button class="v2-action ${tone}" type="button" onclick="v2Open('${esc(fn)}','${esc(active)}')">
      <span class="v2-action-icon">${icon}</span>
      <span class="v2-action-copy"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></span>
    </button>`;
  }

  function actionsFor(role) {
    if (role === 'admin') {
      return [
        action('🚨', 'Mangler nå', 'Oppmøte og foresattkontakt', 'showSimpleMissingAdmin', 'red', 'missing'),
        action('💬', 'Tilbakemeldingar', 'Sjå svar og mønster', 'showSimpleFeedbackAdmin', 'violet', 'feedback'),
        action('👟', 'Deltakarar', 'Søk, allergi og kontakt', 'showAdminParticipants', '', 'admin'),
        action('🔄', 'Instruktørplan', 'Fordel bemanning raskt', 'showInstructorScheduleAdmin', 'green', 'admin'),
        action('📅', 'Program & meny', 'Rediger det alle skal sjå', 'showAdminDays', 'orange', 'admin'),
        action('🛡️', 'Administrasjon', 'Import, årgangar og persondata', 'showAdmin', '', 'admin')
      ];
    }
    if (role === 'responsible') {
      return [
        action('🚑', 'Tryggleik & kontakt', 'Allergi, helse og ring foresatte', 'showResponsibleSafety', 'red', 'safety'),
        action('🧭', 'Ansvar & oppgåver', 'Kva dei vaksne skal passe på', 'showResponsibleInstructions', 'green', 'more'),
        action('🔄', 'Instruktørplan', 'Kven har kva gruppe', 'showInstructorSchedule', 'violet', 'plan'),
        action('📅', 'Dagsprogram', 'Tid, mat og beskjedar', 'showDays', 'orange', 'more'),
        action('👥', 'Deltakargrupper', 'Finn namn og gruppe raskt', 'showGroups', '', 'more'),
        action('🧑‍🤝‍🧑', 'Ansvarsfordeling', 'Kven av dei vaksne gjer kva', 'showResponsibleAdults', '', 'more')
      ];
    }
    return [
      action('✅', 'Krysselister', 'Rask avkryssing før og etter lunsj', 'showChecklists', 'green', 'attendance'),
      action('🔄', 'Instruktørplan', 'Kven har kva gruppe no', 'showInstructorSchedule', 'violet', 'plan'),
      action('📅', 'Dagsprogram', 'Tidspunkt, mat og beskjedar', 'showDays', 'orange', 'more'),
      action('🎯', 'Øvingar', 'Finn noko som passar gruppa', 'showExercises', '', 'more'),
      action('👥', 'Deltakargrupper', 'Finn namn og gruppe', 'showGroups', '', 'more'),
      action('📋', 'Instruksar', 'Kortversjonen av det viktigaste', 'showInstructorInstructions', '', 'more')
    ];
  }

  function statsFor(role, data) {
    if (role === 'admin') {
      return [
        [data.participants.length, 'Deltakarar'],
        [data.instructors.length, 'Instruktørar'],
        [data.adults.length, 'Ansvarlege/vaksne'],
        [data.feedbackCount ?? '–', 'Tilbakemeldingar']
      ];
    }
    if (role === 'responsible') {
      return [
        [data.participants.length, 'Deltakarar'],
        [data.healthCount, 'Helse/allergi-info'],
        [data.contactCount, 'Foresattkontakt'],
        [data.adults.length, 'Ansvarlege/vaksne']
      ];
    }
    return [
      [data.participants.length, 'Deltakarar'],
      [data.instructors.length, 'Instruktørar'],
      [data.days.length, 'Programdagar'],
      [data.assignedCount || '–', 'Sett opp på vald dag']
    ];
  }

  function previewControls() {
    if (cachedRole !== 'admin') return '';
    return previewRole
      ? `<div class="v2-preview-banner"><strong>Førehandsvising: ${esc(ROLE[previewRole].label)}</strong><span>Du er framleis innlogga som administrator. Tilgangar blir ikkje simulerte.</span><button type="button" onclick="v2PreviewRole(null)">← Tilbake til administrator</button></div>`
      : `<div class="v2-preview-buttons"><span>Test visning:</span><button type="button" onclick="v2PreviewRole('responsible')">Sjå som ansvarleg</button><button type="button" onclick="v2PreviewRole('instructor')">Sjå som instruktør</button></div>`;
  }

  function renderHero(role, data) {
    const archived = data.yearData?.status === 'archived';
    return `<section class="v2-hero">
      <p class="v2-eyebrow"><span class="v2-role-pill"><span class="v2-live-dot"></span>${esc(ROLE[role]?.label || role)}</span>${archived ? '<span class="v2-state-pill">Arkivert</span>' : ''}</p>
      <h1>${esc(roleHeroTitle(role, data.year))}</h1>
      <p class="v2-hero-copy">${esc(greeting())}. ${esc(roleDescription(role))}</p>
      <div class="v2-hero-row"><div class="v2-eyebrow">Samnanger IL · TINE Fotballskule</div>${yearSelect(data, role)}</div>
    </section>`;
  }

  function renderStats(role, data) {
    return `<div class="v2-stats">${statsFor(role, data).map(([value, label]) => `<div class="v2-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('')}</div>`;
  }

  function roleNotice(role, data) {
    if (data.yearData?.status === 'archived') {
      return `<div class="v2-notice"><span class="v2-notice-icon">🗂️</span><div><strong>Du ser på eit arkivert år</strong><p>Historikken er bevart. Vanleg redigering er låst, medan driftsoversikter kan lesast.</p></div></div>`;
    }
    if (role === 'responsible' && data.healthCount) {
      return `<div class="v2-notice"><span class="v2-notice-icon">🚑</span><div><strong>${esc(data.healthCount)} deltakarar har registrert helse- eller allergiinformasjon</strong><p>Tryggleik & kontakt gir rask tilgang når du faktisk treng det.</p></div></div>`;
    }
    return '';
  }

  async function renderV2Home() {
    const token = ++renderToken;
    const user = auth.currentUser;
    const year = currentYear();
    if (!user || !year) return;

    try {
      const role = await getRole();
      if (!role || !ROLE[role]) return;
      const data = await loadDashboardData(role, year);
      if (token !== renderToken || auth.currentUser?.uid !== user.uid) return;

      document.body.classList.add('v2-enabled');
      document.body.dataset.v2Role = role;
      const intro = document.getElementById('pageIntro');
      const menu = document.getElementById('mainMenu');
      const content = document.getElementById('content');
      if (!intro || !menu || !content) return;

      intro.innerHTML = '';
      menu.innerHTML = '';
      content.innerHTML = `<div class="v2-home">
        ${previewControls()}
        ${renderHero(role, data)}
        ${roleNotice(role, data)}
        <section class="v2-section">
          <div class="v2-section-head"><div><h2>${esc(data.dayRelation || 'Program')}</h2><p>Det viktigaste først — resten er eitt trykk unna.</p></div></div>
          ${todayCard(data, role)}
        </section>
        <section class="v2-section">
          <div class="v2-section-head"><div><h2>Hurtigtilgang</h2><p>Bygd rundt det du faktisk gjer i løpet av dagen.</p></div></div>
          <div class="v2-action-grid">${actionsFor(role).join('')}</div>
        </section>
        <section class="v2-section">
          <div class="v2-section-head"><div><h2>Oversikt</h2><p>${esc(ROLE[role].label)} · ${esc(data.year)}</p></div></div>
          ${renderStats(role, data)}
        </section>
      </div>`;

      renderDock(role, 'home');
    } catch (error) {
      console.error('V2-dashboard:', error);
    }
  }

  function dockItems(role) {
    if (role === 'admin') return [
      ['home', '⌂', 'Heim', 'showHome'],
      ['missing', '!', 'Mangler', 'showSimpleMissingAdmin'],
      ['admin', '⚙', 'Admin', 'showAdmin'],
      ['feedback', '◇', 'Svar', 'showSimpleFeedbackAdmin']
    ];
    if (role === 'responsible') return [
      ['home', '⌂', 'Heim', 'showHome'],
      ['safety', '✚', 'Tryggleik', 'showResponsibleSafety'],
      ['plan', '↻', 'Plan', 'showInstructorSchedule'],
      ['more', '•••', 'Meir', 'v2ShowMore']
    ];
    return [
      ['home', '⌂', 'Heim', 'showHome'],
      ['attendance', '✓', 'Oppmøte', 'showChecklists'],
      ['plan', '↻', 'Plan', 'showInstructorSchedule'],
      ['more', '•••', 'Meir', 'v2ShowMore']
    ];
  }

  function ensureDock() {
    let dock = document.getElementById('v2Dock');
    if (dock) return dock;
    dock = document.createElement('nav');
    dock.id = 'v2Dock';
    dock.className = 'v2-dock';
    dock.setAttribute('aria-label', 'Snarvegmeny');
    document.body.appendChild(dock);
    return dock;
  }

  function renderDock(role, active = 'home') {
    let exit = document.getElementById('v2PreviewExit');
    if (!exit) { exit = document.createElement('button'); exit.id = 'v2PreviewExit'; exit.type = 'button'; exit.textContent = '← Tilbake til administrator'; exit.onclick = () => window.v2PreviewRole(null); document.body.appendChild(exit); }
    exit.hidden = !previewRole;
    const dock = ensureDock();
    dock.hidden = false;
    dock.innerHTML = dockItems(role).map(([key, icon, label, fn]) => `<button class="v2-dock-button ${active === key ? 'is-active' : ''}" type="button" onclick="v2Open('${fn}','${key}')"><span class="v2-dock-icon">${icon}</span><span class="v2-dock-label">${esc(label)}</span></button>`).join('');
  }

  function setDockActive(active) {
    document.querySelectorAll('.v2-dock-button').forEach(button => button.classList.remove('is-active'));
    const role = document.body.dataset.v2Role;
    const index = dockItems(role).findIndex(item => item[0] === active);
    if (index >= 0) document.querySelectorAll('.v2-dock-button')[index]?.classList.add('is-active');
  }

  window.v2Open = function (fnName, active = 'more') {
    const fn = window[fnName];
    if (typeof fn !== 'function') {
      console.error(`Manglar funksjon: ${fnName}`);
      return;
    }
    setDockActive(active);
    return fn();
  };

  window.v2ChangeYear = function (year) {
    if (typeof window.changeYear === 'function') return window.changeYear(year);
  };

  window.v2ShowMore = async function () {
    const role = await getRole();
    if (!role) return;
    const intro = document.getElementById('pageIntro');
    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    if (!intro || !menu || !content) return;

    intro.innerHTML = `<div class="hero-card"><p class="hero-kicker">${esc(ROLE[role]?.label || '')}</p><h2>Meir</h2><p>Alt det nyttige som ikkje treng å ta plass på hovudskjermen.</p></div>`;
    menu.innerHTML = '<button class="back-button" type="button" onclick="showHome()">← Framside</button>';

    const rows = role === 'responsible' ? [
      ['📅', 'Dagsprogram & meny', 'showDays'],
      ['🧭', 'Ansvar & oppgåver', 'showResponsibleInstructions'],
      ['👥', 'Deltakargrupper', 'showGroups'],
      ['🧑‍🤝‍🧑', 'Ansvarsfordeling', 'showResponsibleAdults']
    ] : role === 'admin' ? [
      ['📅', 'Program & meny', 'showAdminDays'],
      ['🔄', 'Instruktørplan', 'showInstructorScheduleAdmin'],
      ['👟', 'Deltakarar', 'showAdminParticipants'],
      ['🛡️', 'Administrasjon', 'showAdmin']
    ] : [
      ['📅', 'Dagsprogram & meny', 'showDays'],
      ['🎯', 'Øvingar', 'showExercises'],
      ['👥', 'Deltakargrupper', 'showGroups'],
      ['📋', 'Instruksar', 'showInstructorInstructions'],
      ['📝', 'Tilbakemelding', 'showInstructorFeedback']
    ];

    content.innerHTML = `${previewRole ? previewControls() : ''}<div class="welcome-box"><div class="v2-more-sheet">${rows.map(([icon, title, fn]) => `<button class="v2-more-row" type="button" onclick="v2Open('${fn}','more')"><span>${icon}</span><span>${esc(title)}</span></button>`).join('')}<button class="v2-more-row" type="button" onclick="logout()"><span>↪</span><span>Logg ut</span></button></div></div>`;
    renderDock(role, 'more');
  };

  if (previousShowHome) {
    window.showHome = function () {
      const result = previousShowHome.apply(this, arguments);
      window.setTimeout(renderV2Home, 140);
      return result;
    };
    window.goHome = window.showHome;
  }

  auth.onAuthStateChanged(user => {
    if (!user) {
      cachedRole = null;
      cachedUid = null;
      previewRole = null;
      renderToken++;
      document.body.classList.remove('v2-enabled');
      delete document.body.dataset.v2Role;
      const dock = document.getElementById('v2Dock');
      if (dock) dock.hidden = true;
      const exit = document.getElementById('v2PreviewExit');
      if (exit) exit.hidden = true;
    }
  });
})();
