(() => {
  'use strict';

  const db = firebase.firestore();
  const auth = firebase.auth();
  const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

  const state = {
    user: null,
    profile: null,
    years: [],
    yearId: null,
    year: null,
    participants: [],
    participantPrivate: new Map(),
    instructors: [],
    instructorPrivate: new Map(),
    adults: [],
    adultPrivate: new Map(),
    days: [],
    importRows: [],
    importType: 'participants',
    importWorkbook: null,
    importSheet: null
  };

  const el = id => document.getElementById(id);
  const content = () => el('content');
  const menu = () => el('mainMenu');
  const intro = () => el('pageIntro');

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function slugify(value = '') {
    return String(value)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'o')
      .replace(/å/g, 'a')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 110) || `rad-${Date.now()}`;
  }

  function normalizeHeader(value = '') {
    return String(value)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'o')
      .replace(/å/g, 'a')
      .replace(/[^a-z0-9]/g, '');
  }

  function setIntro(title, text = '', kicker = '') {
    if (!intro()) return;
    intro().innerHTML = `
      <div class="hero-card">
        ${kicker ? `<p class="hero-kicker">${escapeHtml(kicker)}</p>` : ''}
        <h2>${escapeHtml(title)}</h2>
        ${text ? `<p>${escapeHtml(text)}</p>` : ''}
      </div>`;
  }

  function card(icon, title, subtitle, action, tone = '') {
    return `<button class="menu-button ${tone}" type="button" onclick="${action}">
      <span class="menu-icon" aria-hidden="true">${icon}</span>
      <span class="menu-copy"><span>${escapeHtml(title)}</span>${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ''}</span>
    </button>`;
  }

  function setMenu(items = [], back = '') {
    if (menu()) menu().innerHTML = `${items.join('')}${back}`;
  }

  function back(label, action) {
    return `<button class="back-button" type="button" onclick="${action}">← ${escapeHtml(label)}</button>`;
  }

  function status(message, kind = 'info') {
    return `<div class="status-box ${kind}">${escapeHtml(message)}</div>`;
  }

  function isAdmin() {
    return state.profile?.role === 'admin';
  }

  function yearPath(collection) {
    if (!state.yearId) throw new Error('Ingen årgang er vald');
    return db.collection('years').doc(String(state.yearId)).collection(collection);
  }

  function updateHeader() {
    const yearLabel = el('currentYearLabel');
    const footerYear = el('footerYear');
    if (yearLabel) yearLabel.textContent = state.yearId ? `Fotballskule ${state.yearId}` : 'Fotballskule';
    if (footerYear) footerYear.textContent = state.yearId ? `Fotballskule ${state.yearId}` : 'Fotballskule';
  }

  function renderLogin(error = '') {
    state.user = null;
    state.profile = null;
    state.yearId = null;
    updateHeader();
    setIntro('Trygg innlogging', 'Personopplysningar og oppmøte er berre tilgjengeleg for godkjende brukarar.', 'Samnanger IL');
    setMenu([]);
    content().innerHTML = `
      <div class="welcome-box auth-card">
        <h2>Logg inn</h2>
        ${error ? status(error, 'error') : ''}
        <button class="menu-button compact" type="button" onclick="loginGoogle()">Logg inn med Google</button><button class="menu-button compact" type="button" onclick="staffAuthForm('login')">Logg inn med e-post / opprett konto</button>
        <p class="muted">Berre godkjende administratorar og medarbeidarar får tilgang til deltakaropplysningar.</p>
      </div>`;
  }

  window.loginGoogle = async function () {
    try {
      await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    } catch (error) {
      console.error(error);
      renderLogin('Google-innlogging mislukkast: ' + (error.code || 'ukjend feil'));
    }
  };

  window.logout = () => auth.signOut();

  auth.onAuthStateChanged(async user => {
    if (!user) {
      renderLogin();
      return;
    }

    try {
      const profileDoc = await db.collection('users').doc(user.uid).get();
      if (!profileDoc.exists) {
        state.user = user;
        await window.staffAccessPending(user);
        return;
      }
      if (!['admin','instructor','responsible'].includes(profileDoc.data().role)) { state.user = user; await window.staffAccessPending(user); return; }
      state.user = user;
      state.profile = { id: profileDoc.id, ...profileDoc.data() };
      await loadYears();
      await chooseInitialYear();
      showHome();
    } catch (error) {
      console.error(error);
      renderLogin('Kunne ikkje kontrollere tilgangen. Firestore-reglane må vere deploya og brukaren må vere godkjend.');
    }
  });

  async function loadYears() {
    const snapshot = await db.collection('years').get();
    state.years = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => Number(b.id) - Number(a.id));
  }

  async function chooseInitialYear() {
    if (!state.years.length) {
      state.yearId = null;
      state.year = null;
      updateHeader();
      return;
    }
    const preferred = state.profile?.activeYear && state.years.find(y => y.id === String(state.profile.activeYear));
    const active = state.years.find(y => y.status === 'active');
    const selected = preferred || active || state.years[0];
    await loadYear(selected.id);
  }

  async function loadYear(yearId) {
    state.yearId = String(yearId);
    state.year = state.years.find(y => y.id === state.yearId) || { id: state.yearId };
    updateHeader();

    const [participantsSnap, instructorsSnap, adultsSnap, daysSnap] = await Promise.all([
      yearPath('participants').get(),
      yearPath('instructors').get(),
      yearPath('adults').get(),
      yearPath('days').get()
    ]);

    state.participants = participantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByName);
    // Påmeldingar frå Google Forms blir viste saman med eksisterande deltakarar.
    // Berre administrator får lese kontakt- og helseopplysningar.
    if (isAdmin() && String(state.yearId) === '2027') {
      const formsSnap = await db.collection('pameldingar2027').get();
      for (const doc of formsSnap.docs) {
        const f = doc.data();
        const group = Number(f.manuellGruppe || f.standardGruppe);
        const id = 'forms-' + doc.id;
        state.participants.push({ id, name: f.namn || '', group, birthYear: f.fodselsar || null, tshirt: f.tSkjorte || '', formsId: doc.id });
      }
      state.participants.sort(sortByName);
      state.formsPrivate = new Map(formsSnap.docs.map(doc => [doc.id, doc.data()]));
    } else {
      state.formsPrivate = new Map();
    }

    state.instructors = instructorsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByName);
    state.adults = adultsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByName);
    state.days = daysSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));

    state.participantPrivate = new Map();
    state.instructorPrivate = new Map();
    state.adultPrivate = new Map();

    if (isAdmin()) {
      const [pPriv, iPriv, aPriv] = await Promise.all([
        yearPath('participantPrivate').get(),
        yearPath('instructorPrivate').get(),
        yearPath('adultPrivate').get()
      ]);
      pPriv.docs.forEach(doc => state.participantPrivate.set(doc.id, doc.data()));
      if (state.formsPrivate) for (const [id, f] of state.formsPrivate) {
        state.participantPrivate.set('forms-' + id, {
          allergy: f.harAllergiar ? (f.allergiar || 'Ja') : '',
          guardian: [f.kontakt1Namn, f.kontakt1Telefon, f.kontakt2Namn, f.kontakt2Telefon].filter(Boolean).join(' · '),
          notes: f.andreOmsyn || ''
        });
      }
      iPriv.docs.forEach(doc => state.instructorPrivate.set(doc.id, doc.data()));
      aPriv.docs.forEach(doc => state.adultPrivate.set(doc.id, doc.data()));
    }
  }

  function sortByName(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''), 'no');
  }

  window.changeYear = async function (value) {
    await loadYear(value);
    showHome();
  };

  function yearSelector() {
    if (!state.years.length) return '';
    return `<div class="year-switcher">
      <label>Årgang
        <select onchange="changeYear(this.value)">
          ${state.years.map(y => `<option value="${escapeHtml(y.id)}" ${y.id === state.yearId ? 'selected' : ''}>${escapeHtml(y.id)}${y.status === 'archived' ? ' · arkiv' : ''}</option>`).join('')}
        </select>
      </label>
    </div>`;
  }

  window.showHome = function () {
    if (!state.user) return renderLogin();
    const archived = state.year?.status === 'archived';
    setIntro(
      state.yearId ? `Fotballskule ${state.yearId}` : 'Fotballskule',
      archived ? 'Arkivert årgang – historikken kan lesast utan at du blandar han med neste års drift.' : 'Arbeidsverktøy for trygg og oversiktleg gjennomføring.',
      state.profile?.role === 'admin' ? 'Administrator' : 'Instruktør'
    );

    if (!state.yearId) {
      setMenu(isAdmin() ? [card('＋', 'Opprett første årgang', 'Start med 2027 eller ein annan årgang', 'showYearAdmin()')] : []);
      content().innerHTML = `<div class="welcome-box">${yearSelector()}<p>Ingen årgang er oppretta enno.</p></div>`;
      return;
    }

    const instructorItems = [
      card('📅', 'Dagsprogram & meny', 'Tidspunkt, lunsj, frukt og beskjedar', 'showDays()'),
      card('✅', 'Oppmøte', 'Registrer gruppa før og etter lunsj', 'showAttendanceStart()', 'success'),
      card('🎯', 'Øvingar', 'Søk i øvingsbanken', 'showExercises()'),
      card('👥', 'Grupper', 'Deltakarar og instruktørfordeling', 'showGroups()'),
      card('🧑', 'Vaksne', 'Kven er på plass og kva rolle dei har', 'showAdults()')
    ];

    const adminItems = [
      card('🛡️', 'Administrasjon', 'Import, årgangar, deltakarar og kontaktdata', 'showAdmin()', 'danger')
    ];

    setMenu([...instructorItems, ...(isAdmin() ? adminItems : [])]);
    content().innerHTML = `
      <div class="welcome-box">
        ${yearSelector()}
        <div class="quick-grid">
          <div class="contact-card"><h3>${state.participants.length}</h3><p>Deltakarar</p></div>
          <div class="contact-card"><h3>${state.instructors.length}</h3><p>Instruktørar</p></div>
          <div class="contact-card"><h3>${state.adults.length}</h3><p>Vaksne</p></div>
          <div class="contact-card"><h3>${state.days.length}</h3><p>Dagar i programmet</p></div>
        </div>
        ${archived ? status('Denne årgangen er arkivert. Adminfunksjonar er skrivebeskytta i appen.', 'warning') : ''}
        <button class="text-button" type="button" onclick="logout()">Logg ut</button>
      </div>`;
  };

  window.goHome = window.showHome;

  window.showExercises = function () {
    setIntro('Øvingsbank', 'Søk etter øving eller filtrer på gruppe.', `Fotballskule ${state.yearId}`);
    setMenu([], back('Framside', 'showHome()'));
    const exercises = window.exercises || [];
    content().innerHTML = `<div class="welcome-box">
      <div class="toolbar"><input id="exerciseSearch" type="search" placeholder="Søk…" oninput="filterExercises()"><select id="exerciseGroup" onchange="filterExercises()"><option value="">Alle grupper</option>${[1,2,3,4,5].map(g => `<option value="${g}">Gruppe ${g}</option>`).join('')}</select></div>
      <div id="exerciseResults"></div>
    </div>`;
    window.filterExercises = () => {
      const q = (el('exerciseSearch').value || '').toLowerCase();
      const g = Number(el('exerciseGroup').value || 0);
      const filtered = exercises.filter(x => {
        const hay = `${x.name || x.navn || ''} ${x.setup || x.oppsett || ''} ${x.description || x.forklaring || ''} ${x.focus || x.fokus || ''}`.toLowerCase();
        if (q && !hay.includes(q)) return false;
        if (!g) return true;
        const range = String(x.groups || x.grupper || '').split('-').map(Number);
        const min = range[0] || 1;
        const max = range[1] || min;
        return g >= min && g <= max;
      });
      el('exerciseResults').innerHTML = filtered.length ? `<div class="exercise-list">${filtered.map(x => `<button class="exercise-card" onclick="showExerciseDetail(${exercises.indexOf(x)})"><h3>${escapeHtml(x.name || x.navn)}</h3><p>Gruppe ${escapeHtml(x.groups || x.grupper || '')}</p></button>`).join('')}</div>` : '<p>Ingen treff.</p>';
    };
    window.showExerciseDetail = index => {
      const x = exercises[index];
      if (!x) return;
      content().innerHTML = `<div class="welcome-box"><h2>${escapeHtml(x.name || x.navn)}</h2><div class="exercise-detail-grid"><div class="detail-card"><h3>Oppsett</h3><p>${escapeHtml(x.setup || x.oppsett || '').replaceAll('\n','<br>')}</p></div><div class="detail-card"><h3>Forklaring</h3><p>${escapeHtml(x.description || x.forklaring || '').replaceAll('\n','<br>')}</p></div><div class="detail-card"><h3>Fokus</h3><p>${escapeHtml(x.focus || x.fokus || '').replaceAll('\n','<br>')}</p></div><div class="detail-card"><h3>Tips</h3><p>${escapeHtml(x.tips || '').replaceAll('\n','<br>')}</p></div></div></div>`;
    };
    window.filterExercises();
  };

  window.showGroups = function () {
    setIntro('Grupper', 'Deltakarnamn og instruktørar – utan sensitive kontakt- eller helseopplysningar.', `Fotballskule ${state.yearId}`);
    setMenu([], back('Framside', 'showHome()'));
    const groups = [...new Set(state.participants.map(p => Number(p.group)).filter(Boolean))].sort((a,b) => a-b);
    content().innerHTML = `<div class="welcome-box quick-grid">${groups.map(g => {
      const ps = state.participants.filter(p => Number(p.group) === g);
      const ins = state.instructors.filter(i => String(i.group || '').split(',').map(s => s.trim()).includes(String(g)) || String(i.group || '').startsWith(String(g)));
      return `<div class="instruction-section"><h3>Gruppe ${g}</h3><p>${ps.length} deltakarar</p><h4>Instruktørar</h4><ul>${ins.length ? ins.map(i => `<li>${escapeHtml(i.name)}</li>`).join('') : '<li>Ingen registrerte</li>'}</ul><details><summary>Deltakarar</summary><ul>${ps.map(p => `<li>${escapeHtml(p.name)}</li>`).join('')}</ul></details></div>`;
    }).join('')}</div>`;
  };

  window.showAdults = function () {
    setIntro('Vaksne på fotballskulen', 'Oversikt over dei vaksne som er med, rolle og kva dagar dei er til stades.', `Fotballskule ${state.yearId}`);
    setMenu([], back('Framside', 'showHome()'));
    content().innerHTML = `<div class="welcome-box"><div class="contact-grid">${state.adults.length ? state.adults.map(a => `<div class="contact-card"><h3>${escapeHtml(a.name)}</h3><p><strong>${escapeHtml(a.role || 'Vaksen')}</strong></p><p>${escapeHtml(a.days || 'Alle dagar')}</p>${isAdmin() ? privateContactHtml(state.adultPrivate.get(a.id)) : ''}</div>`).join('') : '<p>Ingen vaksne er registrerte enno.</p>'}</div></div>`;
  };

  function privateContactHtml(priv = {}) {
    if (!priv) return '';
    return `${priv.phone ? `<p>📱 ${escapeHtml(priv.phone)}</p>` : ''}${priv.email ? `<p>✉️ ${escapeHtml(priv.email)}</p>` : ''}`;
  }

  window.showDays = function () {
    setIntro('Dagsprogram & meny', 'Instruktørane får same oppdaterte oversikt for alle dagane.', `Fotballskule ${state.yearId}`);
    setMenu([], back('Framside', 'showHome()'));
    content().innerHTML = `<div class="welcome-box"><div class="day-grid">${state.days.length ? state.days.map(day => `<article class="day-card"><p class="section-label">${escapeHtml(formatDate(day.date))}</p><h3>${escapeHtml(day.title || day.name || 'Fotballskuledag')}</h3><div class="detail-card"><h4>🍽️ Meny</h4><p>${escapeHtml(day.menu || 'Ikkje lagt inn').replaceAll('\n','<br>')}</p></div><div class="detail-card"><h4>🕒 Program</h4><p>${escapeHtml(day.program || 'Ikkje lagt inn').replaceAll('\n','<br>')}</p></div>${day.note ? `<div class="important-box"><strong>Besjed:</strong> ${escapeHtml(day.note)}</div>` : ''}</article>`).join('') : '<p>Program og meny er ikkje lagt inn enno.</p>'}</div></div>`;
  };

  function formatDate(value) {
    if (!value) return '';
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  }

  window.showAttendanceStart = function () {
    setIntro('Oppmøte', 'Vel dag, tidspunkt og gruppe.', `Fotballskule ${state.yearId}`);
    setMenu([], back('Framside', 'showHome()'));
    const groups = [...new Set(state.participants.map(p => Number(p.group)).filter(Boolean))].sort((a,b) => a-b);
    content().innerHTML = `<div class="welcome-box"><form class="form-grid" onsubmit="openAttendance(event)"><label>Dag<select id="attDay" required>${state.days.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(formatDate(d.date) || d.title || d.id)}</option>`).join('')}</select></label><label>Tidspunkt<select id="attSlot"><option value="for">Før lunsj</option><option value="etter">Etter lunsj</option></select></label><label>Gruppe<select id="attGroup">${groups.map(g => `<option value="${g}">Gruppe ${g}</option>`).join('')}</select></label><button class="menu-button compact" type="submit">Opne krysseliste</button></form>${!state.days.length ? status('Admin må først legge inn dagane for årgangen.', 'warning') : ''}</div>`;
  };

  window.openAttendance = async function (event) {
    event.preventDefault();
    const dayId = el('attDay').value;
    const slot = el('attSlot').value;
    const group = Number(el('attGroup').value);
    await renderAttendance(dayId, slot, group);
  };

  async function renderAttendance(dayId, slot, group) {
    const sessionId = `${dayId}_${slot}_g${group}`;
    const people = state.participants.filter(p => Number(p.group) === group);
    const snapshot = await yearPath('attendance').doc(sessionId).collection('entries').get();
    const present = new Map(snapshot.docs.map(doc => [doc.id, doc.data().present === true]));
    const day = state.days.find(d => d.id === dayId);
    setIntro(`Oppmøte · Gruppe ${group}`, `${formatDate(day?.date) || day?.title || dayId} · ${slot === 'for' ? 'før lunsj' : 'etter lunsj'}`, `Fotballskule ${state.yearId}`);
    setMenu([], back('Oppmøte', 'showAttendanceStart()'));
    content().innerHTML = `<div class="welcome-box"><p id="attendanceCounter" class="attendance-counter"></p><div class="attendance-list">${people.map(p => `<label class="attendance-card"><span>${escapeHtml(p.name)}</span><input type="checkbox" ${present.get(p.id) ? 'checked' : ''} onchange="saveAttendance('${escapeHtml(sessionId)}','${escapeHtml(p.id)}',this.checked)"></label>`).join('')}</div></div>`;
    updateAttendanceCounter();
  }

  function updateAttendanceCounter() {
    const boxes = [...document.querySelectorAll('.attendance-card input[type="checkbox"]')];
    const checked = boxes.filter(x => x.checked).length;
    if (el('attendanceCounter')) el('attendanceCounter').textContent = `${checked} / ${boxes.length} møtt`;
  }

  window.saveAttendance = async function (sessionId, participantId, present) {
    try {
      await yearPath('attendance').doc(sessionId).collection('entries').doc(participantId).set({
        present: Boolean(present),
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid
      }, { merge: true });
      updateAttendanceCounter();
    } catch (error) {
      console.error(error);
      alert('Kunne ikkje lagre oppmøtet.');
    }
  };

  window.showAdmin = function () {
    if (!isAdmin()) return showHome();
    setIntro('Administrasjon', 'Persondata, import og årgangar er berre synleg for administrator.', `Fotballskule ${state.yearId || ''}`);
    setMenu([
      card('🔐', 'Tilgangssøknader', 'Godkjenn nye medarbeidarar', 'staffAccessAdmin()'),
      card('📥', 'Importer Excel/CSV', 'Deltakarar, instruktørar eller vaksne', 'showImport()'),
      card('👟', 'Deltakarar', 'Søk og sjå nødvendige private opplysningar', 'showAdminParticipants()'),
      ...(String(state.yearId) === '2027' && state.year?.status !== 'archived' ? [card('➕', 'Legg til deltakar', 'Etterpåmelding direkte i Firebase', 'showManualRegistration2027()')] : []),
      card('🧑‍🏫', 'Instruktørar', 'Gruppe, dagar og kontaktinformasjon', 'showAdminInstructors()'),
      card('🧑', 'Vaksne', 'Ansvarlege, kjøkken, førstehjelp og andre roller', 'showAdminAdults()'),
      card('📅', 'Dagar, program og meny', 'Legg inn det instruktørane skal sjå', 'showAdminDays()'),
      card('🗂️', 'Årgangar og arkiv', 'Opprett neste år og arkiver ferdige år', 'showYearAdmin()'),
      card('🚨', 'Manglande oppmøte', 'Samla oversikt og kontaktinfo for admin', 'showMissingAdmin()', 'danger')
    ], back('Framside', 'showHome()'));
    content().innerHTML = `<div class="welcome-box">${yearSelector()}${state.year?.status === 'archived' ? status('Årgangen er arkivert. Du kan sjå data, men import og redigering er sperra i appen.', 'warning') : '<p>Vel funksjon over.</p>'}</div>`;
  };

  function assertWritable() {
    if (!isAdmin()) throw new Error('Berre administrator kan endre data');
    if (!state.yearId) throw new Error('Vel eller opprett ein årgang først');
    if (state.year?.status === 'archived') throw new Error('Årgangen er arkivert og kan ikkje redigerast i appen');
  }

  window.showYearAdmin = function () {
    if (!isAdmin()) return;
    setIntro('Årgangar og arkiv', 'Opprett ny fotballskule utan å miste historikken frå tidlegare år.', 'Administrator');
    setMenu([], back('Administrasjon', 'showAdmin()'));
    content().innerHTML = `<div class="welcome-box"><h3>Opprett årgang</h3><form class="form-grid" onsubmit="createYear(event)"><label>År<input id="newYear" type="number" min="2020" max="2100" value="${Math.max(new Date().getFullYear() + 1, 2027)}" required></label><label>Namn<input id="newYearName" value="TINE Fotballskule"></label><button class="menu-button compact" type="submit">Opprett</button></form><h3>Eksisterande årgangar</h3><div class="contact-grid">${state.years.map(y => `<div class="contact-card"><h3>${escapeHtml(y.id)}</h3><p>${y.status === 'archived' ? 'Arkivert' : 'Aktiv'}</p><button class="text-button" onclick="changeYear('${escapeHtml(y.id)}')">Opne</button>${y.status !== 'archived' ? `<button class="text-button danger-text" onclick="archiveYear('${escapeHtml(y.id)}')">Arkiver</button>` : ''}</div>`).join('') || '<p>Ingen årgangar enno.</p>'}</div></div>`;
  };

  window.createYear = async function (event) {
    event.preventDefault();
    const year = String(el('newYear').value);
    const name = el('newYearName').value.trim() || 'TINE Fotballskule';
    await db.collection('years').doc(year).set({ name, status: 'active', createdAt: serverTimestamp(), createdBy: state.user.uid }, { merge: true });
    await loadYears();
    await loadYear(year);
    showAdminDays();
  };

  window.archiveYear = async function (year) {
    if (!confirm(`Arkivere ${year}? Årgangen blir lesehistorikk i appen.`)) return;
    await db.collection('years').doc(String(year)).set({ status: 'archived', archivedAt: serverTimestamp(), archivedBy: state.user.uid }, { merge: true });
    await loadYears();
    if (state.yearId === String(year)) await loadYear(year);
    showYearAdmin();
  };

  window.showImport = function () {
    if (!isAdmin()) return;
    setIntro('Importer Excel eller CSV', 'Filen blir lesen lokalt i nettlesaren. Du får alltid førehandsvisning før Firestore blir endra.', `Fotballskule ${state.yearId || ''}`);
    setMenu([], back('Administrasjon', 'showAdmin()'));
    const blocked = state.year?.status === 'archived' || !state.yearId;
    content().innerHTML = `<div class="welcome-box"><div class="important-box"><strong>Trygg import:</strong> Excel-fila blir ikkje lasta opp som fil. Appen les radene lokalt og lagrar berre felta du bekreftar i Firestore.</div>${blocked ? status('Vel ein aktiv årgang før du importerer.', 'warning') : `<div class="form-grid"><label>Type<select id="importType" onchange="stateImportType(this.value)"><option value="participants">Deltakarar</option><option value="instructors">Instruktørar</option><option value="adults">Vaksne</option></select></label><label>Excel/CSV<input id="importFile" type="file" accept=".xlsx,.xls,.csv" onchange="readImportFile(this.files[0])"></label><label id="sheetWrap" class="hidden">Ark<select id="importSheet" onchange="selectImportSheet(this.value)"></select></label></div><div id="importPreview"></div>`}</div>`;
  };

  window.stateImportType = value => {
    state.importType = value;
    state.importRows = [];
    if (el('importPreview')) el('importPreview').innerHTML = '';
  };

  window.readImportFile = async function (file) {
    if (!file) return;
    try {
      assertWritable();
      const extension = file.name.toLowerCase().split('.').pop();
      if (extension === 'csv') {
        const text = await file.text();
        state.importWorkbook = null;
        state.importRows = parseCsv(text);
        renderImportPreview();
        return;
      }
      if (!window.XLSX) throw new Error('Excel-lesaren er ikkje lasta inn');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      state.importWorkbook = workbook;
      const select = el('importSheet');
      select.innerHTML = workbook.SheetNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
      el('sheetWrap').classList.remove('hidden');
      selectImportSheet(workbook.SheetNames[0]);
    } catch (error) {
      console.error(error);
      el('importPreview').innerHTML = status(error.message || 'Kunne ikkje lese fila', 'error');
    }
  };

  window.selectImportSheet = function (sheetName) {
    state.importSheet = sheetName;
    const sheet = state.importWorkbook?.Sheets[sheetName];
    if (!sheet) return;
    state.importRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    renderImportPreview();
  };

  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"' && quoted && text[i + 1] === '"') { field += '"'; i++; continue; }
      if (c === '"') { quoted = !quoted; continue; }
      if (!quoted && (c === ',' || c === ';')) { row.push(field); field = ''; continue; }
      if (!quoted && (c === '\n' || c === '\r')) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(v => String(v).trim())) rows.push(row);
        row = [];
        continue;
      }
      field += c;
    }
    row.push(field);
    if (row.some(v => String(v).trim())) rows.push(row);
    if (!rows.length) return [];
    const headers = rows.shift();
    return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
  }

  const aliases = {
    participants: {
      name: ['navn','deltaker','deltakernavn','name'], group: ['gruppe','group'], birthYear: ['fodselsar','fodselsaar','fodt','fodd','birthyear','arstall'], tshirt: ['tskjorte','tshirt','skjorte','storrelse','size'], allergy: ['allergi','allergimat','matinfo','mat','allergier'], guardian: ['foresatt','foresette','foresett','kontakt','foreldrekontakt'], notes: ['merknad','merknader','notat','notater']
    },
    instructors: {
      name: ['navn','instruktor','instruktornavn','name'], group: ['gruppe','group'], days: ['dager','dagar','days','tilstede'], phone: ['telefon','mobil','phone'], email: ['epost','email','mail']
    },
    adults: {
      name: ['navn','voksen','vaksen','name'], role: ['rolle','oppgave','oppgaveansvar','role'], days: ['dager','dagar','days','tilstede'], phone: ['telefon','mobil','phone'], email: ['epost','email','mail']
    }
  };

  function mapImportRow(raw, type) {
    const normalized = Object.fromEntries(Object.entries(raw).map(([k, v]) => [normalizeHeader(k), v]));
    const schema = aliases[type];
    const result = {};
    Object.entries(schema).forEach(([field, keys]) => {
      const key = keys.find(k => Object.prototype.hasOwnProperty.call(normalized, k));
      result[field] = key ? String(normalized[key] ?? '').trim() : '';
    });
    if (type === 'participants') {
      result.group = Number(String(result.group).replace(/[^0-9]/g, '')) || '';
      const matchYear = String(result.birthYear).match(/(19|20)\d{2}/);
      result.birthYear = matchYear ? Number(matchYear[0]) : '';
    }
    return result;
  }

  function renderImportPreview() {
    const target = el('importPreview');
    if (!target) return;
    const mapped = state.importRows.map(row => mapImportRow(row, state.importType)).filter(row => row.name);
    state.importRows = mapped;
    if (!mapped.length) {
      target.innerHTML = status('Ingen rader med namn vart funne. Kontroller kolonneoverskriftene.', 'error');
      return;
    }
    const fields = Object.keys(aliases[state.importType]);
    target.innerHTML = `<h3>Førehandsvisning · ${mapped.length} rader</h3><div class="table-scroll"><table class="participant-table"><thead><tr>${fields.map(f => `<th>${escapeHtml(f)}</th>`).join('')}</tr></thead><tbody>${mapped.slice(0, 25).map(row => `<tr>${fields.map(f => `<td>${escapeHtml(row[f] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${mapped.length > 25 ? `<p class="muted">Viser dei første 25 radene.</p>` : ''}<div class="important-box"><strong>Kontroller spesielt:</strong> namn, gruppe og at allergi/kontakt har hamna i rett kolonne.</div><button class="menu-button compact success" onclick="commitImport()">Importer ${mapped.length} rader til ${escapeHtml(state.yearId)}</button>`;
  }

  window.commitImport = async function () {
    try {
      assertWritable();
      if (!state.importRows.length) throw new Error('Ingen rader å importere');
      if (!confirm(`Importere ${state.importRows.length} rader til ${state.yearId}? Eksisterande person med same namn/gruppe blir oppdatert.`)) return;
      const target = el('importPreview');
      target.insertAdjacentHTML('afterbegin', status('Importerer…', 'info'));
      await writeImportRows(state.importType, state.importRows);
      await loadYear(state.yearId);
      state.importRows = [];
      target.innerHTML = status('Importen er ferdig.', 'success');
    } catch (error) {
      console.error(error);
      el('importPreview').innerHTML = status(error.message || 'Importen mislukkast', 'error');
    }
  };

  async function writeImportRows(type, rows) {
    const operations = [];
    rows.forEach((row, index) => {
      const idBase = type === 'participants' ? `${row.name}-${row.group || ''}` : row.name;
      const id = slugify(idBase) || `rad-${index}`;
      if (type === 'participants') {
        operations.push({ ref: yearPath('participants').doc(id), data: { name: row.name, group: row.group || null, birthYear: row.birthYear || null, tshirt: row.tshirt || '', updatedAt: serverTimestamp(), updatedBy: state.user.uid } });
        operations.push({ ref: yearPath('participantPrivate').doc(id), data: { allergy: row.allergy || '', guardian: row.guardian || '', notes: row.notes || '', updatedAt: serverTimestamp(), updatedBy: state.user.uid } });
      } else if (type === 'instructors') {
        operations.push({ ref: yearPath('instructors').doc(id), data: { name: row.name, group: row.group || '', days: row.days || '', updatedAt: serverTimestamp(), updatedBy: state.user.uid } });
        operations.push({ ref: yearPath('instructorPrivate').doc(id), data: { phone: row.phone || '', email: row.email || '', updatedAt: serverTimestamp(), updatedBy: state.user.uid } });
      } else {
        operations.push({ ref: yearPath('adults').doc(id), data: { name: row.name, role: row.role || '', days: row.days || '', updatedAt: serverTimestamp(), updatedBy: state.user.uid } });
        operations.push({ ref: yearPath('adultPrivate').doc(id), data: { phone: row.phone || '', email: row.email || '', updatedAt: serverTimestamp(), updatedBy: state.user.uid } });
      }
    });
    for (let start = 0; start < operations.length; start += 400) {
      const batch = db.batch();
      operations.slice(start, start + 400).forEach(op => batch.set(op.ref, op.data, { merge: true }));
      await batch.commit();
    }
  }

  window.showManualRegistration2027 = function () {
    if (!isAdmin() || String(state.yearId) !== '2027' || state.year?.status === 'archived') return;
    setIntro('Legg til deltakar', 'Etterpåmelding blir lagra direkte i Firebase og kjem med i Google Sheets ved neste synkronisering.', 'Administrator · 2027');
    setMenu([], back('Deltakarar', 'showAdminParticipants()'));
    const fields = [
      ['namn', 'Namn på deltakar', true],
      ['fodselsar', 'Fødselsår (2013–2022)', true, 'number'],
      ['kontakt1Namn', 'Kontaktperson 1 – namn', true],
      ['kontakt1Telefon', 'Kontaktperson 1 – telefon', true, 'tel'],
      ['kontakt2Namn', 'Kontaktperson 2 – namn'],
      ['kontakt2Telefon', 'Kontaktperson 2 – telefon', false, 'tel'],
      ['allergiar', 'Allergiar'],
      ['andreOmsyn', 'Andre omsyn']
    ];
    content().innerHTML = '<div class="welcome-box"><form id="manualRegistration2027" class="form-grid">' +
      fields.map(([key, label, required, type]) => '<label>' + escapeHtml(label) + '<input name="' + key + '" type="' + (type || 'text') + '" ' + (required ? 'required ' : '') + (key === 'fodselsar' ? 'min="2013" max="2022" ' : '') + '></label>').join('') +
      '<label>T-skjortestorleik<select name="tSkjorte" required>' +
      ['110/116','122/128','134/140','146/152','158/164','XS','S','M','L','XL'].map(x => '<option value="' + x + '">' + x + '</option>').join('') +
      '</select></label><p class="muted">Kontroller opplysningane med føresett før du lagrar.</p>' +
      '<button id="manualRegistrationSave2027" class="menu-button compact success" type="submit">Lagre deltakar</button>' +
      '<button class="menu-button compact" type="button" onclick="showAdminParticipants()">Avbryt</button></form></div>';
    el('manualRegistration2027').onsubmit = saveManualRegistration2027;
  };

  async function saveManualRegistration2027(event) {
    event.preventDefault();
    if (!isAdmin() || String(state.yearId) !== '2027' || state.year?.status === 'archived') return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    Object.keys(data).forEach(k => { if (typeof data[k] === 'string') data[k] = data[k].trim(); });
    const year = Number(data.fodselsar);
    if (!data.namn || !data.kontakt1Namn || !data.kontakt1Telefon || !Number.isInteger(year) || year < 2013 || year > 2022) {
      alert('Fyll ut namn, fødselsår og kontaktperson.'); return;
    }
    const standardGruppe = year >= 2020 ? 1 : year === 2019 ? 2 : year === 2018 ? 3 : year === 2017 ? 4 : 5;
    const existing = state.participants.find(p => String(p.name || '').trim().toLocaleLowerCase('no') === data.namn.toLocaleLowerCase('no') && Number(p.birthYear) === year);
    if (existing && !confirm('Ein deltakar med same namn og fødselsår finst allereie. Vil du likevel registrere ein ny?')) return;
    if (!confirm('Registrere ' + data.namn + ' som ny deltakar i 2027?')) return;
    const button = el('manualRegistrationSave2027');
    button.disabled = true;
    try {
      await db.collection('pameldingar2027').add({
        ...data, fodselsar: year, standardGruppe,
        harAllergiar: Boolean(data.allergiar),
        utanforOrdinarAlder: year < 2015 || year > 2020,
        kjelde: 'manuell-admin-2027',
        opprettaAv: state.user.uid,
        opprettaDato: serverTimestamp()
      });
      await loadYear('2027');
      showAdminParticipants();
    } catch (error) {
      console.error(error);
      alert('Kunne ikkje lagre deltakar. Prøv igjen.');
      button.disabled = false;
    }
  }

  window.showAdminParticipants = function () {
    if (!isAdmin()) return;
    setIntro('Deltakarar', 'Sensitive opplysningar er skilde frå data instruktørane kan lese.', `Fotballskule ${state.yearId}`);
    setMenu([], back('Administrasjon', 'showAdmin()'));
    content().innerHTML = `<div class="welcome-box participant-admin-page">${String(state.yearId) === '2027' && state.year?.status !== 'archived' ? '<button class="menu-button compact success" onclick="showManualRegistration2027()">＋ Legg til deltakar</button>' : ''}<div class="toolbar"><input id="participantSearch" type="search" placeholder="Søk namn…" oninput="renderAdminParticipants()"><select id="participantGroup" onchange="renderAdminParticipants()"><option value="">Alle grupper</option>${[1,2,3,4,5,6,7,8].map(g => `<option value="${g}">Gruppe ${g}</option>`).join('')}</select></div><div id="adminParticipantList"></div></div>`;
    renderAdminParticipants();
  };

  window.renderAdminParticipants = function () {
    const q = (el('participantSearch')?.value || '').toLowerCase();
    const group = Number(el('participantGroup')?.value || 0);
    const rows = state.participants.filter(p => (!q || String(p.name).toLowerCase().includes(q)) && (!group || Number(p.group) === group));
    el('adminParticipantList').innerHTML = `<div class="participant-admin-grid">${rows.map(p => {
      const priv = state.participantPrivate.get(p.id) || {};
      return `<article class="participant-admin-card">
        <div class="participant-admin-heading"><h3>${escapeHtml(p.name)}</h3><span>Gruppe ${escapeHtml(p.group || '-')}</span></div>
        <p class="participant-admin-meta">Født ${escapeHtml(p.birthYear || '-')} · T-skjorte ${escapeHtml(p.tshirt || '-')}</p>
        <div class="participant-admin-info">
          ${priv.allergy ? `<div class="participant-admin-allergy"><strong>Allergi/mat:</strong> ${escapeHtml(priv.allergy)}</div>` : ''}
          ${priv.guardian ? `<p><strong>Føresett:</strong> ${escapeHtml(priv.guardian)}</p>` : ''}
          ${priv.notes ? `<p><strong>Merknad:</strong> ${escapeHtml(priv.notes)}</p>` : ''}
        </div>
        ${p.formsId ? `<div class="participant-admin-actions">
          <button type="button" class="participant-admin-edit" onclick="editFormsParticipant2027('${escapeHtml(p.formsId)}')">Rediger opplysningar</button>
          <label>Flytt til gruppe<select aria-label="Flytt ${escapeHtml(p.name)} til gruppe" onchange="changeFormsGroup2027('${escapeHtml(p.formsId)}', this.value)">${[1,2,3,4,5].map(g => `<option value="${g}" ${Number(p.group) === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        </div>` : ''}
      </article>`;
    }).join('') || '<p>Ingen treff.</p>'}</div>`;
  };

    window.editFormsParticipant2027 = function (id) {
    if (!isAdmin() || String(state.yearId) !== '2027') return;
    const f = state.formsPrivate?.get(id);
    if (!f) return;
    const fields = [['namn','Namn'],['fodselsar','Fødselsår'],['tSkjorte','T-skjortestorleik'],['kontakt1Namn','Føresett 1'],['kontakt1Telefon','Telefon 1'],['kontakt2Namn','Føresett 2'],['kontakt2Telefon','Telefon 2'],['allergiar','Allergiar'],['andreOmsyn','Andre omsyn']];
    el('adminParticipantList').innerHTML = '<div class="welcome-box"><h3>Rediger deltakar</h3><div class="form-grid">' +
      fields.map(([key,label]) => '<label>' + escapeHtml(label) + '<input data-edit-field="' + key + '" value="' + escapeHtml(f[key] ?? '') + '"></label>').join('') +
      '</div><p class="muted">Endringane blir ikkje synkroniserte tilbake til Google Forms eller Sheets.</p><div class="toolbar"><button id="saveParticipantEdit" class="menu-button compact success">Lagre</button><button class="menu-button compact" onclick="renderAdminParticipants()">Avbryt</button></div></div>';
    el('saveParticipantEdit').onclick = () => saveFormsParticipant2027(id);
  };

  window.saveFormsParticipant2027 = async function (id) {
    if (!isAdmin() || String(state.yearId) !== '2027' || !state.formsPrivate?.has(id)) return;
    const values = {};
    document.querySelectorAll('[data-edit-field]').forEach(input => { values[input.dataset.editField] = input.value.trim(); });
    const year = Number(values.fodselsar);
    if (!values.namn || !Number.isInteger(year) || year < 2013 || year > 2022) { alert('Skriv inn namn og gyldig fødselsår (2013–2022).'); return; }
    values.fodselsar = year;
    values.harAllergiar = Boolean(values.allergiar);
    try {
      el('saveParticipantEdit').disabled = true;
      await db.collection('pameldingar2027').doc(id).update(values);
      await loadYear('2027');
      showAdminParticipants();
    } catch (error) {
      console.error(error);
      alert('Kunne ikkje lagre. Prøv igjen.');
      if (el('saveParticipantEdit')) el('saveParticipantEdit').disabled = false;
    }
  };

  window.changeFormsGroup2027 = async function (formsId, value) {
    if (!isAdmin() || String(state.yearId) !== '2027') return;
    const group = Number(value);
    if (!Number.isInteger(group) || group < 1 || group > 5) return;
    try {
      await db.collection('pameldingar2027').doc(formsId).set({ manuellGruppe: group }, { merge: true });
      await loadYear('2027');
      showAdminParticipants();
    } catch (error) {
      console.error(error);
      alert('Kunne ikkje endre gruppe. Prøv igjen.');
    }
  };

  window.showAdminInstructors = function () {
    if (!isAdmin()) return;
    setIntro('Instruktørar', 'Kontaktinfo er berre synleg i adminområdet.', `Fotballskule ${state.yearId}`);
    setMenu([], back('Administrasjon', 'showAdmin()'));
    content().innerHTML = `<div class="welcome-box"><div class="contact-grid">${state.instructors.map(i => `<div class="contact-card"><h3>${escapeHtml(i.name)}</h3><p>Gruppe: ${escapeHtml(i.group || '-')}</p><p>Dagar: ${escapeHtml(i.days || 'Alle')}</p>${privateContactHtml(state.instructorPrivate.get(i.id))}</div>`).join('') || '<p>Ingen instruktørar registrerte.</p>'}</div></div>`;
  };

  window.showAdminAdults = function () {
    if (!isAdmin()) return;
    setIntro('Vaksne', 'Ansvarlege og andre vaksne som er med under fotballskulen.', `Fotballskule ${state.yearId}`);
    setMenu([], back('Administrasjon', 'showAdmin()'));
    content().innerHTML = `<div class="welcome-box"><div class="contact-grid">${state.adults.map(a => `<div class="contact-card"><h3>${escapeHtml(a.name)}</h3><p>${escapeHtml(a.role || 'Vaksen')}</p><p>${escapeHtml(a.days || 'Alle dagar')}</p>${privateContactHtml(state.adultPrivate.get(a.id))}</div>`).join('') || '<p>Ingen vaksne registrerte.</p>'}</div></div>`;
  };

  window.showAdminDays = function () {
    if (!isAdmin()) return;
    setIntro('Dagar, program og meny', 'Det du legg inn her blir synleg for instruktørane.', `Fotballskule ${state.yearId || ''}`);
    setMenu([], back('Administrasjon', 'showAdmin()'));
    const blocked = !state.yearId || state.year?.status === 'archived';
    content().innerHTML = `<div class="welcome-box">${blocked ? status('Vel ein aktiv årgang for å redigere.', 'warning') : `<form class="form-stack" onsubmit="saveDay(event)"><label>Dato<input id="dayDate" type="date" required></label><label>Tittel<input id="dayTitle" placeholder="Måndag / Dag 1"></label><label>Meny<textarea id="dayMenu" class="feedback-text" placeholder="Lunsj: ...\nFrukt: ..."></textarea></label><label>Program<textarea id="dayProgram" class="feedback-text" placeholder="09.30 Registrering\n10.00 Aktivitet\n11.30 Lunsj"></textarea></label><label>Viktig beskjed<textarea id="dayNote" class="feedback-text"></textarea></label><button class="menu-button compact" type="submit">Lagre dag</button></form>`}<h3>Registrerte dagar</h3><div class="day-grid">${state.days.map(d => `<div class="day-card"><h3>${escapeHtml(formatDate(d.date))}</h3><p>${escapeHtml(d.title || '')}</p><button class="text-button" onclick="editDay('${escapeHtml(d.id)}')">Rediger</button></div>`).join('') || '<p>Ingen dagar enno.</p>'}</div></div>`;
  };

  window.saveDay = async function (event) {
    event.preventDefault();
    assertWritable();
    const date = el('dayDate').value;
    const id = slugify(date);
    await yearPath('days').doc(id).set({ date, title: el('dayTitle').value.trim(), menu: el('dayMenu').value.trim(), program: el('dayProgram').value.trim(), note: el('dayNote').value.trim(), updatedAt: serverTimestamp(), updatedBy: state.user.uid }, { merge: true });
    await loadYear(state.yearId);
    showAdminDays();
  };

  window.editDay = function (id) {
    const day = state.days.find(d => d.id === id);
    if (!day || state.year?.status === 'archived') return;
    showAdminDays();
    el('dayDate').value = day.date || '';
    el('dayTitle').value = day.title || '';
    el('dayMenu').value = day.menu || '';
    el('dayProgram').value = day.program || '';
    el('dayNote').value = day.note || '';
  };

  window.showMissingAdmin = function () {
    if (!isAdmin()) return;
    setIntro('Manglande oppmøte', 'Vel dag, tidspunkt og gruppe for rask kontroll.', `Fotballskule ${state.yearId}`);
    setMenu([], back('Administrasjon', 'showAdmin()'));
    const groups = [...new Set(state.participants.map(p => Number(p.group)).filter(Boolean))].sort((a,b) => a-b);
    content().innerHTML = `<div class="welcome-box"><form class="form-grid" onsubmit="loadMissingAdmin(event)"><label>Dag<select id="missDay">${state.days.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(formatDate(d.date))}</option>`).join('')}</select></label><label>Tidspunkt<select id="missSlot"><option value="for">Før lunsj</option><option value="etter">Etter lunsj</option></select></label><label>Gruppe<select id="missGroup"><option value="all">Alle</option>${groups.map(g => `<option value="${g}">Gruppe ${g}</option>`).join('')}</select></label><button class="menu-button compact" type="submit">Vis manglar</button></form><div id="missingAdminResult"></div></div>`;
  };

  window.loadMissingAdmin = async function (event) {
    event.preventDefault();
    const day = el('missDay').value;
    const slot = el('missSlot').value;
    const groupValue = el('missGroup').value;
    const groups = groupValue === 'all' ? [...new Set(state.participants.map(p => Number(p.group)).filter(Boolean))].sort((a,b) => a-b) : [Number(groupValue)];
    let html = '';
    let total = 0;
    for (const group of groups) {
      const sessionId = `${day}_${slot}_g${group}`;
      const snapshot = await yearPath('attendance').doc(sessionId).collection('entries').get();
      const present = new Set(snapshot.docs.filter(d => d.data().present === true).map(d => d.id));
      const missing = state.participants.filter(p => Number(p.group) === group && !present.has(p.id));
      total += missing.length;
      html += `<div class="attendance-overview-section"><h3>Gruppe ${group}</h3>${missing.length ? `<ul class="attendance-name-list missing">${missing.map(p => { const priv = state.participantPrivate.get(p.id) || {}; return `<li class="missing-person"><strong>${escapeHtml(p.name)}</strong>${priv.guardian ? `<br>${escapeHtml(priv.guardian)}` : ''}${priv.allergy ? `<br><span class="allergy-inline">Allergi/mat: ${escapeHtml(priv.allergy)}</span>` : ''}</li>`; }).join('')}</ul>` : '<p>✅ Alle er kryssa av.</p>'}</div>`;
    }
    el('missingAdminResult').innerHTML = `<div class="important-box"><strong>${total} manglar</strong></div>${html}`;
  };

  function updateConnectionStatus() {
    const target = el('connectionStatus');
    if (target) target.textContent = navigator.onLine ? 'På nett' : 'Fråkopla';
  }
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  updateConnectionStatus();
})();
