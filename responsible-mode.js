(() => {
  'use strict';

  const auth = firebase.auth();
  const db = firebase.firestore();
  let cachedRole = null;
  let rolePromise = null;
  let safetyRows = [];

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
    const raw = `${day.date || day.id || ''} ${day.title || ''} ${day.name || ''}`;
    return /^20\d{2}-09(?:-|\s|$)/.test(String(day.date || day.id || '')) || /\bseptember\b/i.test(raw);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('nn-NO', {
      weekday: 'long', day: 'numeric', month: 'long'
    }).format(date);
  }

  async function getRole() {
    const user = auth.currentUser;
    if (!user) return null;
    if (cachedRole) return cachedRole;
    if (!rolePromise) {
      rolePromise = db.collection('users').doc(user.uid).get().then(doc => {
        cachedRole = doc.exists ? doc.data().role || null : null;
        return cachedRole;
      }).finally(() => { rolePromise = null; });
    }
    return rolePromise;
  }

  auth.onAuthStateChanged(() => {
    cachedRole = null;
    rolePromise = null;
    safetyRows = [];
  });

  function menuButton(icon, title, subtitle, action, tone = '') {
    return `<button class="menu-button ${tone}" type="button" onclick="${action}">
      <span class="menu-icon" aria-hidden="true">${icon}</span>
      <span class="menu-copy"><span>${esc(title)}</span><small>${esc(subtitle)}</small></span>
    </button>`;
  }

  function backButton(label = 'Framside') {
    return `<button class="back-button" type="button" onclick="showHome()">← ${esc(label)}</button>`;
  }

  async function loadResponsibleData() {
    const year = currentYear();
    if (!year) return { year, days: [], adults: [] };
    const yearRef = db.collection('years').doc(year);
    const [daysSnap, adultsSnap] = await Promise.all([
      yearRef.collection('days').get(),
      yearRef.collection('adults').get()
    ]);
    const days = daysSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(day => !isSeptemberDay(day))
      .sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));
    const adults = adultsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'no'));
    return { year, days, adults };
  }

  function extractPhones(text = '') {
    const matches = String(text).match(/(?:\+47\s*)?(?:\d[\s-]*){8}/g) || [];
    const unique = [];
    matches.forEach(match => {
      const normalized = match.replace(/[^+\d]/g, '').replace(/^0047/, '+47');
      if (!unique.includes(normalized)) unique.push(normalized);
    });
    return unique;
  }

  function healthInfo(priv = {}) {
    return String(
      priv.health ||
      priv.healthNotes ||
      priv.healthChallenges ||
      priv.medical ||
      priv.notes ||
      ''
    ).trim();
  }

  function hasHealthInfo(row) {
    return Boolean(String(row.private?.allergy || '').trim() || healthInfo(row.private));
  }

  async function loadResponsibleSafetyData() {
    const year = currentYear();
    if (!year) return [];
    const yearRef = db.collection('years').doc(year);
    const [participantsSnap, privateSnap] = await Promise.all([
      yearRef.collection('participants').get(),
      yearRef.collection('participantPrivate').get()
    ]);
    const privateById = new Map(privateSnap.docs.map(doc => [doc.id, doc.data()]));
    return participantsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data(), private: privateById.get(doc.id) || {} }))
      .sort((a, b) => {
        const healthSort = Number(hasHealthInfo(b)) - Number(hasHealthInfo(a));
        if (healthSort) return healthSort;
        const groupSort = Number(a.group || 0) - Number(b.group || 0);
        if (groupSort) return groupSort;
        return String(a.name || '').localeCompare(String(b.name || ''), 'no');
      });
  }

  async function applyResponsibleMode() {
    if (await getRole() !== 'responsible') return;

    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    const intro = document.getElementById('pageIntro');
    const year = currentYear();
    if (!menu || !content || !intro || !year) return;

    intro.innerHTML = `
      <div class="hero-card">
        <p class="hero-kicker">Ansvarleg</p>
        <h2>Fotballskule ${esc(year)}</h2>
        <p>Driftsoversikta for dei vaksne som hjelper til utan instruktør- eller admintilgang.</p>
      </div>`;

    menu.innerHTML = [
      menuButton('📅', 'Dagsprogram & meny', 'Heile programmet, mat og beskjedar', 'showDays()'),
      menuButton('🚑', 'Tryggleik & kontakt', 'Allergiar, helse og foresattkontakt', 'showResponsibleSafety()', 'danger'),
      menuButton('🧭', 'Ansvar & oppgåver', 'Det viktigaste for dei ansvarlege vaksne', 'showResponsibleInstructions()'),
      menuButton('🔄', 'Instruktørplan', 'Sjå kven som har kva gruppe gjennom dagen', 'showInstructorSchedule()'),
      menuButton('👥', 'Deltakargrupper', 'Sjå dei faste gruppene og namna', 'showGroups()'),
      menuButton('🧑‍🤝‍🧑', 'Ansvarsfordeling', 'Kven av dei vaksne som har kva rolle', 'showResponsibleAdults()')
    ].join('');

    content.innerHTML = `
      <div class="welcome-box">
        <div class="important-box">
          <strong>Din rolle</strong>
          <p>Du har tilgang til dagsdrift og nødvendig tryggleiksinformasjon. Allergiar, relevante helseopplysningar og foresattkontakt ligg under <strong>Tryggleik & kontakt</strong>. Adminfunksjonar, oppmøteredigering og instruktørevalueringar er ikkje tilgjengelege.</p>
        </div>
        <button class="text-button" type="button" onclick="logout()">Logg ut</button>
      </div>`;
  }

  window.showResponsibleSafety = async function () {
    if (await getRole() !== 'responsible' && !window.v2IsPreviewRole?.('responsible')) return window.showHome();

    const year = currentYear();
    const intro = document.getElementById('pageIntro');
    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    if (!intro || !menu || !content || !year) return;

    intro.innerHTML = `<div class="hero-card"><p class="hero-kicker">Ansvarleg · Fotballskule ${esc(year)}</p><h2>Tryggleik & kontakt</h2><p>Rask tilgang til allergiar, helseopplysningar og foresatte dersom noko skjer.</p></div>`;
    menu.innerHTML = backButton();
    content.innerHTML = '<div class="welcome-box"><div class="status-box info">Hentar tryggleiksinformasjon…</div></div>';

    try {
      safetyRows = await loadResponsibleSafetyData();
      const groups = [...new Set(safetyRows.map(row => Number(row.group)).filter(Boolean))].sort((a, b) => a - b);
      const healthCount = safetyRows.filter(hasHealthInfo).length;

      content.innerHTML = `
        <div class="welcome-box">
          <div class="alert-box">
            <strong>🔒 Sensitive opplysningar</strong>
            <p>Bruk denne sida berre når du treng opplysningane for tryggleik, helse eller kontakt med foresatte.</p>
          </div>
          <div class="quick-grid">
            <div class="contact-card"><h3>${safetyRows.length}</h3><p>Deltakarar</p></div>
            <div class="contact-card"><h3>${healthCount}</h3><p>Med helse/allergi-info</p></div>
          </div>
          <div class="toolbar">
            <input id="responsibleSafetySearch" type="search" placeholder="Søk etter namn…" oninput="filterResponsibleSafety()">
            <select id="responsibleSafetyGroup" onchange="filterResponsibleSafety()">
              <option value="">Alle grupper</option>
              ${groups.map(group => `<option value="${group}">Gruppe ${group}</option>`).join('')}
            </select>
            <select id="responsibleSafetyType" onchange="filterResponsibleSafety()">
              <option value="all">Alle deltakarar</option>
              <option value="health">Berre helse/allergi</option>
            </select>
          </div>
          <div id="responsibleSafetySummary" class="muted"></div>
          <div id="responsibleSafetyList"></div>
        </div>`;
      window.filterResponsibleSafety();
    } catch (error) {
      console.error(error);
      content.innerHTML = `<div class="welcome-box"><div class="status-box error">Kunne ikkje hente tryggleiksinformasjon. Kontroller at dei oppdaterte Firestore-reglane er publiserte.</div></div>`;
    }
  };

  window.filterResponsibleSafety = function () {
    const q = String(document.getElementById('responsibleSafetySearch')?.value || '').trim().toLowerCase();
    const group = Number(document.getElementById('responsibleSafetyGroup')?.value || 0);
    const type = document.getElementById('responsibleSafetyType')?.value || 'all';

    const rows = safetyRows.filter(row => {
      if (q && !String(row.name || '').toLowerCase().includes(q)) return false;
      if (group && Number(row.group) !== group) return false;
      if (type === 'health' && !hasHealthInfo(row)) return false;
      return true;
    });

    const summary = document.getElementById('responsibleSafetySummary');
    if (summary) summary.textContent = `${rows.length} deltakar${rows.length === 1 ? '' : 'ar'} vist`;

    const target = document.getElementById('responsibleSafetyList');
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = '<div class="status-box info">Ingen treff.</div>';
      return;
    }

    target.innerHTML = `<div class="contact-grid">${rows.map(row => {
      const priv = row.private || {};
      const allergy = String(priv.allergy || '').trim();
      const health = healthInfo(priv);
      const guardian = String(priv.guardian || '').trim();
      const phones = extractPhones(guardian);
      return `<article class="contact-card">
        <h3>${esc(row.name || 'Utan namn')}</h3>
        <p><strong>Gruppe ${esc(row.group || '-')}</strong></p>
        ${allergy ? `<div class="alert-box"><strong>⚠️ Allergi/mat:</strong><br>${esc(allergy)}</div>` : ''}
        ${health ? `<div class="important-box"><strong>🩺 Helse/merknad:</strong><br>${esc(health)}</div>` : ''}
        <p><strong>Foresatte:</strong><br>${guardian ? esc(guardian) : '<span class="muted">Ingen kontaktinfo registrert.</span>'}</p>
        ${phones.length ? `<div class="quick-grid">${phones.map(phone => `<a class="menu-button compact success" href="tel:${esc(phone)}">📞 ${esc(phone)}</a>`).join('')}</div>` : ''}
      </article>`;
    }).join('')}</div>`;
  };

  window.showResponsibleInstructions = async function () {
    if (await getRole() !== 'responsible' && !window.v2IsPreviewRole?.('responsible')) return window.showHome();
    const { year, days } = await loadResponsibleData();
    const intro = document.getElementById('pageIntro');
    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    if (!intro || !menu || !content) return;

    intro.innerHTML = `<div class="hero-card"><p class="hero-kicker">Ansvarleg</p><h2>Ansvar & oppgåver</h2><p>Oversikt for dei vaksne som held drifta i gang rundt instruktørane.</p></div>`;
    menu.innerHTML = backButton();

    const dayTasks = days.filter(day => day.note).map(day => `
      <details class="schedule-accordion">
        <summary><span>${esc(formatDate(day.date) || day.title || day.id)}</span><small>Oppgåver</small></summary>
        <div class="schedule-accordion-body"><p>${esc(day.note).replaceAll('\n', '<br>')}</p></div>
      </details>`).join('');

    content.innerHTML = `
      <div class="welcome-box">
        <div class="detail-card">
          <h3>🧭 Rollen som ansvarleg</h3>
          <p>• Ver tilgjengeleg for instruktørane når dei treng ein vaksen.<br>
          • Hjelp til med flyt rundt oppstart, pausar, mat/frukt og avslutning etter behov.<br>
          • Ta over når ein instruktør melder frå om skade, uro eller ein situasjon dei ikkje bør stå i åleine.<br>
          • Følg dagsprogrammet og avklar endringar med administrator.<br>
          • Sjekk <strong>Tryggleik & kontakt</strong> ved allergi, helseutfordringar eller behov for å kontakte foresatte.</p>
        </div>
        ${dayTasks ? `<h3>Oppgåver per dag</h3>${dayTasks}` : '<p class="muted">Ingen eigne ansvarlegoppgåver er lagde inn for denne årgangen enno.</p>'}
      </div>`;
  };

  window.showResponsibleAdults = async function () {
    if (await getRole() !== 'responsible' && !window.v2IsPreviewRole?.('responsible')) return window.showHome();
    const { year, adults } = await loadResponsibleData();
    const intro = document.getElementById('pageIntro');
    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    if (!intro || !menu || !content) return;

    intro.innerHTML = `<div class="hero-card"><p class="hero-kicker">Fotballskule ${esc(year)}</p><h2>Ansvarsfordeling</h2><p>Dei vaksne rundt fotballskulen og rollene deira.</p></div>`;
    menu.innerHTML = backButton();
    content.innerHTML = `<div class="welcome-box"><div class="contact-grid">${adults.length ? adults.map(adult => `
      <article class="contact-card">
        <h3>${esc(adult.name || 'Utan namn')}</h3>
        <p><strong>${esc(adult.role || 'Ansvarleg')}</strong></p>
        <p>${esc(adult.days || 'Alle dagar')}</p>
      </article>`).join('') : '<p>Ingen ansvarlege vaksne er registrerte enno.</p>'}</div></div>`;
  };

  const previousShowHome = window.showHome;
  if (!previousShowHome) return;

  window.showHome = function () {
    const result = previousShowHome.apply(this, arguments);
    window.setTimeout(() => applyResponsibleMode().catch(console.error), 60);
    return result;
  };
  window.goHome = window.showHome;
})();
