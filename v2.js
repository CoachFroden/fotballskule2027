(() => {
  'use strict';

  const auth = firebase.auth();
  const db = firebase.firestore();
  const previousShowHome = window.showHome;
  let renderToken = 0;
  let homeRenderTimer = null;
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
    return text.match(/\b(20\d{2})\b/)?.[1] || document.getElementById('footerYear')?.textContent?.match(/\b(20\d{2})\b/)?.[1] || '2027';
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

  window.v2IsPreviewRole = function (role) {
    return cachedRole === 'admin' && previewRole === role && auth.currentUser?.uid === cachedUid;
  };

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
    // 2027 registrations live in the authoritative Firebase signup collection.
    // Read it only for administrators: instructor/responsible roles must not
    // receive personal registration details from this private collection.
    if (role === 'admin' && String(year) === '2027') {
      try {
        const registrations = await db.collection('pameldingar2027').get();
        const knownIds = new Set(participants.map(item => String(item.formsId || item.registrationId || item.id)));
        registrations.docs.forEach(doc => {
          if (knownIds.has(doc.id) || knownIds.has('forms-' + doc.id)) return;
          participants.push({ id: 'forms-' + doc.id });
        });
      } catch (error) {
        console.warn('Kunne ikkje hente talet på påmeldingar for 2027', error);
      }
    }
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
        action('🎒', 'Registrering', 'Innsjekk første dag', 'showArrivalRegistration', 'green', 'arrival'),
        action('🚨', 'Mangler no', 'Oppmøte og føresette', 'showSimpleMissingAdmin', 'red', 'missing'),
        action('👟', 'Deltakarar', 'Søk, allergi og kontakt', 'showAdminParticipants', '', 'admin'),
        action('📅', 'Program & meny', 'Rediger det alle skal sjå', 'showAdminDays', 'orange', 'admin'),
        action('🛡️', 'Administrasjon', 'Import, årgangar og persondata', 'showAdmin', '', 'admin')
      ];
    }
    if (role === 'responsible') {
      return [
        action('🎒', 'Registrering', 'Innsjekk første dag', 'showArrivalRegistration', 'green', 'arrival'),
        action('🚑', 'Tryggleik & kontakt', 'Allergi, helse og ring foresatte', 'showResponsibleSafety', 'red', 'safety'),
        action('🧭', 'Dagens ansvar', 'Felles arbeidsplan gjennom dagen', 'showResponsibleDaily', 'green', 'more'),
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

  function responsibleQuickHome(data) {
    const alert = data.healthCount ? '<div class="responsible-home-alert"><span>!</span><p><strong>Viktig helseinformasjon</strong><small>'+esc(data.healthCount)+' deltakarar har registrert helse- eller allergiinformasjon. Sjå Tryggleik og kontakt.</small></p></div>' : '';
    return '<div class="instructor-mobile-home instructor-stadium responsible-stadium">'+
      '<section class="instructor-welcome instructor-hero">'+
        '<div class="instructor-hero-glow" aria-hidden="true"></div><div class="instructor-pitch" aria-hidden="true"><i></i><b></b></div>'+
        '<div class="instructor-hero-content"><span class="instructor-eyebrow"><em></em> SAMNANGER IL · '+esc(data.year)+'</span>'+
        '<div class="instructor-hero-icon" aria-hidden="true">⚽</div>'+
        '<h1>Full kontroll.<br><mark>Meir fotballglede.</mark></h1>'+
        '<p>Oversikta du treng for ein trygg og god dag.</p>'+
        '<div class="instructor-hero-footer"><span>ANSVARLEGPORTAL</span><span>TINE FOTBALLSKULE <b>✦</b></span></div></div></section>'+
      alert+
      '<div class="instructor-action-intro"><div><span>DIN ARBEIDSFLATE</span><h2>Det viktigaste i dag</h2></div><span class="instructor-action-line"></span></div>'+
      '<div class="instructor-primary-grid">'+
        '<button class="instructor-primary instructor-attendance" type="button" onclick="showArrivalRegistration()"><span class="instructor-action-symbol" aria-hidden="true">🎒</span><span class="instructor-action-copy"><strong>Registrering</strong><small>Innsjekk første dag</small></span><span class="instructor-action-arrow" aria-hidden="true">↗</span></button>'+
        '<button class="instructor-primary instructor-attendance" type="button" onclick="v2Open(\'showResponsibleSafety\',\'safety\')"><span class="instructor-action-symbol" aria-hidden="true">✚</span><span class="instructor-action-copy"><strong>Tryggleik og kontakt</strong><small>Helse, allergi og føresette</small></span><span class="instructor-action-arrow" aria-hidden="true">↗</span></button>'+
        '<button class="instructor-primary instructor-exercises" type="button" onclick="v2Open(\'showResponsibleDaily\',\'responsibility\')"><span class="instructor-action-symbol" aria-hidden="true">✓</span><span class="instructor-action-copy"><strong>Dagens ansvar</strong><small>Oppgåver og plan gjennom dagen</small></span><span class="instructor-action-arrow" aria-hidden="true">↗</span></button>'+
        '<button class="instructor-primary responsible-staff-action" type="button" onclick="v2Open(\'showResponsibleAdults\',\'more\')"><span class="instructor-action-symbol" aria-hidden="true">♙</span><span class="instructor-action-copy"><strong>Kven er på plass?</strong><small>Vaksne, roller og kontakt</small></span><span class="instructor-action-arrow" aria-hidden="true">↗</span></button>'+
      '</div><div class="instructor-bottom-note"><span>✦</span> SAMAN SKAPAR VI FOTBALLGLEDE <span>✦</span></div></div>';
  }

  function instructorQuickHome(data) {
    const notice = data.focusDay && data.focusDay.note ? '<div class="instructor-alert"><strong>Viktig beskjed</strong><p>'+esc(data.focusDay.note)+'</p></div>' : '';
    return '<div class="instructor-mobile-home instructor-stadium">'+
      '<section class="instructor-welcome instructor-hero">'+
        '<div class="instructor-hero-glow" aria-hidden="true"></div>'+
        '<div class="instructor-pitch" aria-hidden="true"><i></i><b></b></div>'+
        '<div class="instructor-hero-content"><span class="instructor-eyebrow"><em></em> SAMNANGER IL · '+esc(data.year)+'</span>'+
          '<div class="instructor-hero-icon" aria-hidden="true">⚽</div>'+
          '<h1>Klar for<br><mark>fotballglede?</mark></h1>'+
          '<p>Alt du treng for ein god dag på bana.</p>'+
          '<div class="instructor-hero-footer"><span>INSTRUKTØRPORTAL</span><span> TINE FOTBALLSKULE <b>✦</b></span></div>'+
        '</div>'+
      '</section>'+
      '<div class="instructor-action-intro"><div><span>DIN ARBEIDSFLATE</span><h2>Kom raskt i gang</h2></div><span class="instructor-action-line"></span></div>'+
      '<div class="instructor-primary-grid">'+
        '<button class="instructor-primary instructor-attendance" type="button" onclick="v2Open(\'showChecklists\',\'home\')"><span class="instructor-action-symbol" aria-hidden="true">✓</span><span class="instructor-action-copy"><strong>Oppmøte</strong><small>Registrer barna på gruppa di</small></span><span class="instructor-action-arrow" aria-hidden="true">↗</span></button>'+
        '<button class="instructor-primary instructor-exercises" type="button" onclick="v2Open(\'showExercises\',\'home\')"><span class="instructor-action-symbol" aria-hidden="true">◈</span><span class="instructor-action-copy"><strong>Øvelsesbank</strong><small>Finn neste aktivitet på sekunder</small></span><span class="instructor-action-arrow" aria-hidden="true">↗</span></button>'+
      '</div>'+notice+
      '<div class="instructor-bottom-note"><span>✦</span> SMÅ ØYEBLIKK. STORE FOTBALLMINNE. <span>✦</span></div>'+
      '</div>';
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
      ? ''
      : `<div class="v2-preview-buttons"><span>Test visning:</span><button type="button" onclick="v2PreviewRole('responsible')">Sjå som ansvarleg</button><button type="button" onclick="v2PreviewRole('instructor')">Sjå som instruktør</button></div>`;
  }

  function sidebar(role, year) {
    const items = role === 'admin' ? [
      ['⌂','Hovudside','showHome'],['▦','Program','showAdminDays'],['♙','Deltakarar','showAdminParticipants'],['♧','Instruktørar','showAdminInstructors'],['♟','Vaksne','showAdminAdults'],['✉','Tilbakemeldingar','showSimpleFeedbackAdmin'],['⚙','Administrasjon','showAdmin']
    ] : role === 'responsible' ? [
      ['⌂','Hovudside','showHome'],['▦','Program','showDays'],['✚','Tryggleik','showResponsibleSafety'],['♙','Grupper','showGroups'],['♧','Vaksne','showResponsibleAdults']
    ] : [
      ['⌂','Hovudside','showHome'],['▦','Program','showDays'],['✓','Krysselister','showChecklists'],['♙','Grupper','showGroups'],['⚽','Øvingar','showExercises'],['↻','Instruktørplan','showInstructorSchedule']
    ];
    return '<aside class="match-sidebar"><div class="match-side-logo"><span>SAMNANGER IL</span><strong>FOTBALLSKULE <em>'+esc(year)+'</em></strong></div><nav aria-label="Fotballskule-meny">'+items.map(([icon,label,handler],i)=>'<button type="button" class="match-side-link'+(i===0?' current':'')+'" onclick="'+handler+'()"><span aria-hidden="true">'+icon+'</span>'+esc(label)+'</button>').join('')+'</nav><div class="match-side-footer"><strong>MEIR ENN FOTBALL</strong><small>Samhald · Glede · Meistring</small></div></aside>';
  }

  function renderHero(role, data) {
    const archived = data.yearData?.status === 'archived';
    return `<section class="v2-hero v2-hero-clean">
      <div class="v2-brand-lockup" role="img" aria-label="Samnanger IL TINE Fotballskule ${esc(data.year)}">
        <div class="v2-brand-ball" aria-hidden="true"><svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="50" r="46" fill="#f8fbff" stroke="#9ac7f0" stroke-width="3"/><path d="M50 29 66 40 61 59 40 62 32 44Z" fill="#0c2448"/><path d="M50 29 48 6M66 40 89 31M61 59 77 78M40 62 26 83M32 44 10 34" stroke="#0c2448" stroke-width="8" stroke-linejoin="round"/><path d="M50 29 66 40 61 59 40 62 32 44Z" fill="#0c2448"/></svg></div>
        <div class="v2-brand-club"><span>SAMNANGER IL</span></div>
        <div class="v2-brand-name"><span>TINE</span> <span>FOTBALLSKULE</span></div>
        <div class="v2-brand-year"><span>${esc(data.year)}</span></div>
      </div>
      <p class="v2-hero-clean-motto">Fotballglede · Meistring · Fellesskap</p>
      <div class="v2-hero-row">
        <span class="v2-role-pill"><span class="v2-live-dot"></span>${esc(ROLE[role]?.label || role)}</span>
        ${archived ? '<span class="v2-state-pill">Arkivert</span>' : ''}
        ${yearSelect(data, role)}
        ${role === 'admin' ? previewControls() : ''}
      </div>
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
      if (!role || !ROLE[role]) {
        const content = document.getElementById('content');
        if (content) content.innerHTML = '<div class="welcome-box" role="alert">Kunne ikkje finne godkjend brukartilgang. Prøv å logge inn på nytt.</div>';
        return;
      }
      const data = await loadDashboardData(role, year);
      const displayRole = role === 'admin' && previewRole ? previewRole : role;
      if (token !== renderToken || auth.currentUser?.uid !== user.uid) return;

      document.body.classList.add('v2-enabled');
      document.body.dataset.v2Role = displayRole;
      const intro = document.getElementById('pageIntro');
      const menu = document.getElementById('mainMenu');
      const content = document.getElementById('content');
      if (!intro || !menu || !content) return;

      intro.innerHTML = '';
      menu.innerHTML = '';
      if (displayRole === 'responsible') {
        content.innerHTML = responsibleQuickHome(data);
        renderDock(displayRole, 'home');
        return;
      }
      if (displayRole === 'instructor') {
        content.innerHTML = `${previewControls()}${instructorQuickHome(data)}`;
        renderDock(displayRole, 'home');
        return;
      }
      content.innerHTML = `<div class="match-shell"><div class="v2-home">
        ${renderHero(role, data)}
        ${role === 'admin' && previewRole ? previewControls() : ''}
        ${roleNotice(displayRole, data)}
        <section class="v2-section match-actions">
          <div class="v2-section-head"><div><h2>På laget</h2><p>Alt du treng, eitt trykk unna</p></div></div>
          <div class="v2-action-grid">${actionsFor(displayRole).join('')}</div>
        </section>
        <div class="match-bottom">
          <section class="v2-section match-overview">
            <div class="v2-section-head"><div><h2>Oversikt ${esc(data.year)}</h2></div></div>
            ${renderStats(displayRole, data)}
          </section>
          <section class="v2-section match-program">
            <div class="v2-section-head"><div><h2>${esc(data.dayRelation || 'Program')}</h2></div></div>
            ${todayCard(data, displayRole)}
          </section>
        </div>
      </div></div>`;

      renderDock(displayRole, 'home');
    } catch (error) {
      console.error('V2-dashboard:', error);
      if (token === renderToken) {
        const content = document.getElementById('content');
        if (content) content.innerHTML = '<div class="welcome-box" role="alert"><h2>Kunne ikkje laste forsida</h2><p>Prøv å oppdatere sida. Dersom feilen held fram, må vi kontrollere Firebase-tilgangen.</p></div>';
      }
    }
  }

  window.renderModernHome = renderV2Home;

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
      ['responsibility', '✓', 'Ansvar', 'showResponsibleDaily'],
      ['more', '•••', 'Meir', 'v2ShowMore']
    ];
    return [
      ['home', '⌂', 'Heim', 'showHome'],
      ...(previewRole && cachedRole === 'admin' ? [['exit-preview', '↩', 'Til admin', 'v2ExitPreview']] : []),
      ['more', '•••', 'Meir', 'v2ShowMore']
    ];
  }

  window.v2ExitPreview = function () { return window.v2PreviewRole(null); };

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
    if (exit) { exit.remove(); } // Exit is already available in the preview banner.
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
    // Cancel any home render still waiting for Firebase. Otherwise it can
    // overwrite a subpage after the user has already navigated there.
    renderToken++;
    if (homeRenderTimer !== null) {
      window.clearTimeout(homeRenderTimer);
      homeRenderTimer = null;
    }
    setDockActive(active);
    return fn();
  };

  window.v2ChangeYear = function (year) {
    if (typeof window.changeYear === 'function') return window.changeYear(year);
  };

  function instructorSubpage(title, description) {
    document.getElementById('pageIntro').innerHTML = '<div class="hero-card"><p class="hero-kicker">INSTRUKTØR · TINE FOTBALLSKULE</p><h2>'+esc(title)+'</h2><p>'+esc(description)+'</p></div>';
    document.getElementById('mainMenu').innerHTML = '<button class="back-button" type="button" onclick="v2ShowMore()">← Meir</button>';
    renderDock('instructor','more');
  }

  window.showInstructorInstructions = function () {
    instructorSubpage('Instruksar for instruktørar','Det viktigaste før, under og etter aktivitetane.');
    const items = [
      ['Før oppstart','Møt i god tid, finn gruppa di og registrer oppmøte. Kontroller at alle barna er på plass.'],
      ['Under aktivitetane','Sjå alle barna, forklar kort og tydeleg, og sørg for mykje aktivitet og meistring. Tilpass øvingane etter nivå og behov.'],
      ['Tryggleik','Ha oversikt over barna til ei kvar tid. Meld frå til ein ansvarleg vaksen ved skade, sjukdom eller andre hendingar.'],
      ['Ved lunsj og gruppebyte','Hald oversikt over barna ved overgangane. Kontroller oppmøtet på nytt etter lunsj.'],
      ['Ved avslutning','Sørg for at alle barna blir følgde til avtalt avslutning eller overlevering. Meld frå om noko viktig har skjedd.']
    ];
    document.getElementById('content').innerHTML = '<div class="instructor-guide">'+items.map((item,i)=>'<article class="instructor-guide-card"><span class="instructor-guide-number">'+String(i+1).padStart(2,'0')+'</span><div><h3>'+esc(item[0])+'</h3><p>'+esc(item[1])+'</p></div></article>').join('')+'<p class="instructor-guide-note">Dette er generelle instruksar. Lokale rutinar og kontaktpersonar må stadfestast av administrator før fotballskulen.</p></div>';
  };

  window.showInstructorDayContacts = async function () {
    instructorSubpage('Kontaktpersonar','Vaksne som er registrerte på fotballskulen den valde dagen.');
    const target=document.getElementById('content');
    target.innerHTML='<div class="welcome-box">Hentar kontaktpersonar …</div>';
    try {
      const year=String(document.getElementById('currentYearLabel')?.textContent||'').match(/20\d{2}/)?.[0]||'2027';
      const ref=db.collection('years').doc(year);
      const [daysSnap,adultsSnap]=await Promise.all([ref.collection('days').get(),ref.collection('adults').get()]);
      const days=daysSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.date||a.id).localeCompare(String(b.date||b.id)));
      const adults=adultsSnap.docs.map(d=>({id:d.id,...d.data()}));
      if(!days.length){target.innerHTML='<div class="welcome-box"><p>Ingen fotballskuledagar er registrerte enno.</p></div>';return;}
      const today=new Date(),todayStr=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
      const chosen=days.find(d=>(d.date||d.id)===todayStr)||days.find(d=>(d.date||d.id)>todayStr)||days[days.length-1];
      const available=adults.filter(a=>{
        const ids=Array.isArray(a.dayIds)?a.dayIds.map(String):[];
        if(ids.length)return ids.includes(String(chosen.id))||ids.includes(String(chosen.date||''));
        const raw=String(a.days||'').trim();
        if(!raw||/alle/i.test(raw))return true;
        const date=new Date((chosen.date||chosen.id)+'T12:00:00');
        const weekday=isNaN(date.getTime())?'':new Intl.DateTimeFormat('nn-NO',{weekday:'long'}).format(date).toLowerCase();
        return raw.toLowerCase().includes(weekday)||raw.includes(String(chosen.date||chosen.id));
      });
      target.innerHTML='<div class="instructor-contacts"><label class="instructor-day-select">Vel dag<select id="instructorContactDay">'+days.map(d=>'<option value="'+esc(d.id)+'" '+(d.id===chosen.id?'selected':'')+'>'+esc(d.date||d.title||d.id)+'</option>').join('')+'</select></label><div id="instructorContactList"></div></div>';
      const draw=id=>{
        const day=days.find(d=>d.id===id)||chosen;
        const people=adults.filter(a=>{
          const ids=Array.isArray(a.dayIds)?a.dayIds.map(String):[];
          if(ids.length)return ids.includes(String(day.id))||ids.includes(String(day.date||''));
          const raw=String(a.days||'').trim();
          if(!raw||/alle/i.test(raw))return true;
          const date=new Date((day.date||day.id)+'T12:00:00');
          const weekday=isNaN(date.getTime())?'':new Intl.DateTimeFormat('nn-NO',{weekday:'long'}).format(date).toLowerCase();
          return raw.toLowerCase().includes(weekday)||raw.includes(String(day.date||day.id));
        });
        document.getElementById('instructorContactList').innerHTML=people.length?people.map(a=>{
          const phone=String(a.phone||'').trim();
          return '<article class="instructor-contact-card"><div><h3>'+esc(a.name||'Ansvarleg vaksen')+'</h3><p>'+esc(a.role||a.task||'Ansvarleg')+'</p></div>'+(phone?'<a href="tel:'+esc(phone.replace(/[^+\d]/g,''))+'">Ring '+esc(phone)+'</a>':'<span class="instructor-contact-no-phone">Telefonnummer ikkje tilgjengeleg</span>')+'</article>';
        }).join(''):'<div class="welcome-box"><p>Ingen vaksne er registrerte denne dagen.</p></div>';
      };
      document.getElementById('instructorContactDay').addEventListener('change',e=>draw(e.target.value));
      draw(chosen.id);
    }catch(error){console.error(error);target.innerHTML='<div class="welcome-box"><p>Kunne ikkje hente kontaktpersonane. Kontroller tilgangen eller prøv igjen.</p></div>';}
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
      ['📅', 'Dagsprogram og meny', 'showDays'],
      ['📋', 'Rutinar og instruksar', 'showResponsibleInstructions'],
      ['👥', 'Ansvarlege på plass', 'showResponsibleAdults']
    ] : role === 'admin' ? [
      ['📅', 'Program & meny', 'showAdminDays'],
      ['🔄', 'Instruktørplan', 'showInstructorScheduleAdmin'],
      ['👟', 'Deltakarar', 'showAdminParticipants'],
      ['🛡️', 'Administrasjon', 'showAdmin']
    ] : [
      ['📅', 'Fast dagsprogram og meny', 'showDays'],
      ['📋', 'Instruksar for instruktørar', 'showInstructorInstructions'],
      ['👥', 'Kontaktpersonar', 'showInstructorDayContacts'],
      ['📝', 'Tilbakemelding', 'showInstructorFeedback']
    ];

    content.innerHTML = `<div class="v2-more-sheet">${rows.map(([icon, title, fn]) => `<button class="v2-more-row" type="button" onclick="v2Open('${fn}','more')"><span>${icon}</span><span>${esc(title)}</span></button>`).join('')}<button class="v2-more-row" type="button" onclick="logout()"><span>↪</span><span>Logg ut</span></button></div>`;
    renderDock(role, 'more');
  };

  if (previousShowHome) {
    window.showHome = function () {
      // The legacy home is kept for login/setup only; never render its
      // obsolete cards while the new dashboard is loading.
      renderToken++;
      if (homeRenderTimer !== null) {
        clearTimeout(homeRenderTimer);
        homeRenderTimer = null;
      }
      document.body.classList.add('v2-enabled');
      document.getElementById('pageIntro')?.replaceChildren();
      document.getElementById('mainMenu')?.replaceChildren();
      const content = document.getElementById('content');
      if (content) content.innerHTML = '<div class="match-loading" role="status">Lastar Fotballskule …</div>';
      return renderV2Home();
    };
    window.goHome = window.showHome;
  }

  auth.onAuthStateChanged(user => {
    if (user) {
      window.setTimeout(() => {
        const content = document.getElementById('content');
        if (content && (content.textContent || '').includes('Lastar ny forside')) window.showHome();
      }, 300);
    }
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
