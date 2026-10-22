(() => {
  'use strict';

  const db = firebase.firestore();
  const auth = firebase.auth();
  const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

  const originalShowHome = window.showHome;
  const originalShowAdmin = window.showAdmin;

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
    return text.match(/\b(20\d{2})\b/)?.[1] || null;
  }

  function menu() {
    return document.getElementById('mainMenu');
  }

  function content() {
    return document.getElementById('content');
  }

  function intro() {
    return document.getElementById('pageIntro');
  }

  function setIntro(title, text, kicker = '') {
    if (!intro()) return;
    intro().innerHTML = `<div class="hero-card">${kicker ? `<p class="hero-kicker">${esc(kicker)}</p>` : ''}<h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
  }

  function backButton(label, action) {
    return `<button class="back-button" type="button" onclick="${action}">← ${esc(label)}</button>`;
  }

  function menuButton(icon, title, subtitle, action, tone = '') {
    return `<button class="menu-button ${tone}" type="button" onclick="${action}"><span class="menu-icon" aria-hidden="true">${icon}</span><span class="menu-copy"><span>${esc(title)}</span><small>${esc(subtitle)}</small></span></button>`;
  }

  function addMenuButton(container, key, html) {
    if (!container || container.querySelector(`[data-addon="${key}"]`)) return;
    const wrap = document.createElement('div');
    wrap.dataset.addon = key;
    wrap.innerHTML = html;
    const button = wrap.firstElementChild;
    button.dataset.addon = key;
    container.appendChild(button);
  }

  async function yearStatus(year) {
    if (!year) return null;
    const doc = await db.collection('years').doc(String(year)).get();
    return doc.exists ? doc.data().status || 'active' : null;
  }

  function default2026Days() {
    return [
      { id: '2026-06-22', date: '2026-06-22', title: 'Måndag' },
      { id: '2026-06-23', date: '2026-06-23', title: 'Tysdag' },
      { id: '2026-06-24', date: '2026-06-24', title: 'Onsdag' }
    ];
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  }

  async function loadDays(year) {
    const snap = await db.collection('years').doc(year).collection('days').get();
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));
    return rows.length ? rows : (year === '2026' ? default2026Days() : []);
  }

  function enhanceHomeMenu() {
    const year = currentYear();
    if (!year || !menu()) return;

    const attendance = [...menu().querySelectorAll('.menu-button')].find(btn => btn.textContent.includes('Oppmøte'));
    if (attendance) {
      attendance.setAttribute('onclick', 'showChecklists()');
      const title = attendance.querySelector('.menu-copy > span');
      const subtitle = attendance.querySelector('.menu-copy > small');
      if (title) title.textContent = 'Krysselister';
      if (subtitle) subtitle.textContent = 'Kryss av før og etter lunsj per gruppe';
    } else {
      addMenuButton(menu(), 'checklists', menuButton('✅', 'Krysselister', 'Kryss av før og etter lunsj per gruppe', 'showChecklists()', 'success'));
    }

    addMenuButton(menu(), 'feedback-form', menuButton('📝', 'Tilbakemelding', 'Anonym evaluering frå instruktørane', 'showInstructorFeedback()'));
  }

  function enhanceAdminMenu() {
    const year = currentYear();
    if (!year || !menu()) return;
    addMenuButton(menu(), 'feedback-admin', menuButton('💬', 'Tilbakemeldingar', 'Les alle svar og sjå oppsummering', 'showFeedbackAdmin()'));
    if (year === '2026') {
      addMenuButton(menu(), 'legacy-migration', menuButton('↻', 'Gjenopprett 2026-historikk', 'Hent gamle kryss, program og evalueringar', 'showLegacy2026Migration()', 'danger'));
    }
  }

  if (originalShowHome) {
    window.showHome = function () {
      const result = originalShowHome.apply(this, arguments);
      enhanceHomeMenu();
      return result;
    };
    window.goHome = window.showHome;
  }

  if (originalShowAdmin) {
    window.showAdmin = function () {
      const result = originalShowAdmin.apply(this, arguments);
      enhanceAdminMenu();
      return result;
    };
  }

  window.showChecklists = async function () {
    const year = currentYear();
    if (!year) return;
    const snap = await db.collection('years').doc(year).collection('participants').get();
    const participants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const groups = [...new Set(participants.map(p => Number(p.group)).filter(Boolean))].sort((a, b) => a - b);

    setIntro('Krysselister', 'Vel gruppe. Deretter vel du dag og før/etter lunsj.', `Fotballskule ${year}`);
    menu().innerHTML = `${groups.map(g => menuButton('👥', `Gruppe ${g}`, `${participants.filter(p => Number(p.group) === g).length} deltakarar`, `showChecklistGroup(${g})`)).join('')}${backButton('Framside', 'showHome()')}`;
    content().innerHTML = '<div class="welcome-box"><h2>Krysselister</h2><p>Kryssa blir lagra med ein gong og kan kontrollerast av administrator.</p></div>';
  };

  window.showChecklistGroup = async function (group) {
    const year = currentYear();
    const days = await loadDays(year);
    setIntro(`Krysselister · Gruppe ${group}`, 'Vel tidspunkt.', `Fotballskule ${year}`);
    menu().innerHTML = `${days.map(day => {
      const label = formatDate(day.date) || day.title || day.id;
      return `${menuButton('☀️', label, 'Før lunsj', `showChecklistSession('${esc(day.id)}','for',${group})`)}${menuButton('🌤️', label, 'Etter lunsj', `showChecklistSession('${esc(day.id)}','etter',${group})`)}`;
    }).join('')}${backButton('Krysselister', 'showChecklists()')}`;
    content().innerHTML = days.length
      ? '<div class="welcome-box"><p>Vel dag og tidspunkt over.</p></div>'
      : '<div class="welcome-box"><div class="status-box warning">Ingen dagar er registrerte for denne årgangen enno.</div></div>';
  };

  window.showChecklistSession = async function (dayId, slot, group) {
    const year = currentYear();
    const [pSnap, aSnap, status, days] = await Promise.all([
      db.collection('years').doc(year).collection('participants').get(),
      db.collection('years').doc(year).collection('attendance').doc(`${dayId}_${slot}_g${group}`).collection('entries').get(),
      yearStatus(year),
      loadDays(year)
    ]);

    const people = pSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => Number(p.group) === Number(group)).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'no'));
    const present = new Map(aSnap.docs.map(d => [d.id, d.data().present === true]));
    const day = days.find(d => d.id === dayId) || { id: dayId, date: dayId };
    const archived = status === 'archived';

    setIntro(`Gruppe ${group}`, `${formatDate(day.date) || day.title || dayId} · ${slot === 'for' ? 'før lunsj' : 'etter lunsj'}`, `Fotballskule ${year}`);
    menu().innerHTML = backButton(`Gruppe ${group}`, `showChecklistGroup(${group})`);
    content().innerHTML = `<div class="welcome-box">${archived ? '<div class="status-box warning">Arkivert årgang – kryssa kan lesast, men ikkje endrast.</div>' : ''}<p id="addonAttendanceCounter" class="attendance-counter"></p><div class="attendance-list">${people.map(p => `<label class="attendance-card"><span>${esc(p.name)}</span><input type="checkbox" ${present.get(p.id) ? 'checked' : ''} ${archived ? 'disabled' : ''} onchange="saveChecklistAttendance('${esc(dayId)}','${esc(slot)}',${group},'${esc(p.id)}',this.checked)"></label>`).join('')}</div></div>`;
    updateChecklistCounter();
  };

  function updateChecklistCounter() {
    const boxes = [...document.querySelectorAll('.attendance-card input[type="checkbox"]')];
    const checked = boxes.filter(x => x.checked).length;
    const counter = document.getElementById('addonAttendanceCounter');
    if (counter) counter.textContent = `${checked} / ${boxes.length} møtt`;
  }

  window.saveChecklistAttendance = async function (dayId, slot, group, participantId, checked) {
    const year = currentYear();
    try {
      const sessionId = `${dayId}_${slot}_g${group}`;
      await db.collection('years').doc(year).collection('attendance').doc(sessionId).collection('entries').doc(participantId).set({
        present: Boolean(checked),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid
      }, { merge: true });
      updateChecklistCounter();
    } catch (error) {
      console.error(error);
      alert('Kunne ikkje lagre krysset. Kontroller at årgangen er aktiv.');
    }
  };

  window.showInstructorFeedback = async function () {
    const year = currentYear();
    if (!year) return;
    const status = await yearStatus(year);
    setIntro('Anonym tilbakemelding', 'Svar blir brukt til å gjere neste fotballskule betre. Namn eller brukar-ID blir ikkje lagra i svaret.', `Fotballskule ${year}`);
    menu().innerHTML = backButton('Framside', 'showHome()');

    if (status === 'archived') {
      content().innerHTML = '<div class="welcome-box"><div class="status-box warning">Denne årgangen er arkivert og tek ikkje imot nye tilbakemeldingar.</div></div>';
      return;
    }

    const ratingOptions = '<option value="">Vel</option><option value="5">5 - Veldig bra</option><option value="4">4 - Bra</option><option value="3">3 - Greitt</option><option value="2">2 - Mindre bra</option><option value="1">1 - Dårleg</option>';
    content().innerHTML = `<div class="welcome-box"><form class="form-stack" onsubmit="submitInstructorFeedback(event)">
      <label>Korleis trivdest du som instruktør?<select id="fbTrivsel" required>${ratingOptions}</select></label>
      <label>Korleis fungerte appen?<select id="fbApp" required>${ratingOptions}</select></label>
      <label>Korleis fungerte øvingane?<select id="fbOvelser" required>${ratingOptions}</select></label>
      <label>Fekk du nok informasjon og støtte?<select id="fbStotte" required>${ratingOptions}</select></label>
      <label>Kva fungerte spesielt bra?<textarea id="fbBra" class="feedback-text"></textarea></label>
      <label>Kva kan vi gjere betre neste år?<textarea id="fbBedre" class="feedback-text"></textarea></label>
      <label>Har du forslag til nye øvingar?<textarea id="fbForslag" class="feedback-text"></textarea></label>
      <label>Vil du vere instruktør igjen neste år?<select id="fbIgjen" required><option value="">Vel</option><option>Ja</option><option>Kanskje</option><option>Nei</option></select></label>
      <button id="fbSubmit" class="menu-button compact success" type="submit">Send anonym tilbakemelding</button>
    </form><div id="fbStatus"></div></div>`;
  };

  window.submitInstructorFeedback = async function (event) {
    event.preventDefault();
    const year = currentYear();
    const button = document.getElementById('fbSubmit');
    if (button) button.disabled = true;
    try {
      await db.collection('years').doc(year).collection('feedback').add({
        trivsel: document.getElementById('fbTrivsel').value,
        app: document.getElementById('fbApp').value,
        ovelser: document.getElementById('fbOvelser').value,
        stotte: document.getElementById('fbStotte').value,
        bra: document.getElementById('fbBra').value.trim(),
        bedre: document.getElementById('fbBedre').value.trim(),
        forslag: document.getElementById('fbForslag').value.trim(),
        igjen: document.getElementById('fbIgjen').value,
        tidspunkt: serverTimestamp(),
        anonymous: true,
        source: 'secure-app'
      });
      document.querySelector('form')?.reset();
      document.getElementById('fbStatus').innerHTML = '<div class="status-box success">✅ Takk! Tilbakemeldinga er lagra anonymt.</div>';
    } catch (error) {
      console.error(error);
      document.getElementById('fbStatus').innerHTML = '<div class="status-box error">Kunne ikkje lagre tilbakemeldinga. Kontroller Firestore-reglane.</div>';
    } finally {
      if (button) button.disabled = false;
    }
  };

  function average(rows, field) {
    const values = rows.map(r => Number(r[field])).filter(v => v >= 1 && v <= 5);
    return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '–';
  }

  function feedbackDate(value) {
    try {
      const date = value?.toDate ? value.toDate() : null;
      return date ? new Intl.DateTimeFormat('nn-NO', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '';
    } catch (_) {
      return '';
    }
  }

  window.showFeedbackAdmin = async function () {
    const year = currentYear();
    if (!year) return;
    const snap = await db.collection('years').doc(year).collection('feedback').get();
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
      const av = a.tidspunkt?.seconds || 0;
      const bv = b.tidspunkt?.seconds || 0;
      return bv - av;
    });
    const again = { Ja: 0, Kanskje: 0, Nei: 0 };
    rows.forEach(r => { if (Object.prototype.hasOwnProperty.call(again, r.igjen)) again[r.igjen]++; });

    setIntro('Tilbakemeldingar frå instruktørane', 'Alle svar for vald årgang. Evalueringane er anonyme.', `Fotballskule ${year}`);
    menu().innerHTML = backButton('Administrasjon', 'showAdmin()');
    content().innerHTML = `<div class="welcome-box">
      <div class="quick-grid">
        <div class="contact-card"><h3>${rows.length}</h3><p>Svar</p></div>
        <div class="contact-card"><h3>${average(rows, 'trivsel')}</h3><p>Trivsel / 5</p></div>
        <div class="contact-card"><h3>${average(rows, 'app')}</h3><p>App / 5</p></div>
        <div class="contact-card"><h3>${average(rows, 'ovelser')}</h3><p>Øvingar / 5</p></div>
        <div class="contact-card"><h3>${average(rows, 'stotte')}</h3><p>Støtte / 5</p></div>
      </div>
      <div class="important-box"><strong>Vil vere instruktør igjen:</strong> Ja ${again.Ja} · Kanskje ${again.Kanskje} · Nei ${again.Nei}</div>
      <div class="contact-grid">${rows.map((r, index) => `<article class="contact-card"><p class="section-label">Svar ${rows.length - index}${feedbackDate(r.tidspunkt) ? ` · ${esc(feedbackDate(r.tidspunkt))}` : ''}</p><p><strong>Trivsel:</strong> ${esc(r.trivsel || '–')}/5 · <strong>App:</strong> ${esc(r.app || '–')}/5</p><p><strong>Øvingar:</strong> ${esc(r.ovelser || '–')}/5 · <strong>Støtte:</strong> ${esc(r.stotte || '–')}/5</p>${r.bra ? `<h4>Det som fungerte bra</h4><p>${esc(r.bra)}</p>` : ''}${r.bedre ? `<h4>Kan bli betre</h4><p>${esc(r.bedre)}</p>` : ''}${r.forslag ? `<h4>Forslag til øvingar</h4><p>${esc(r.forslag)}</p>` : ''}<p><strong>Instruktør igjen:</strong> ${esc(r.igjen || '–')}</p></article>`).join('') || '<p>Ingen tilbakemeldingar er registrerte for denne årgangen enno.</p>'}</div>
    </div>`;
  };

  function legacyParticipantId(name) {
    return String(name || '')
      .toLowerCase()
      .replaceAll(' ', '_')
      .replaceAll('.', '')
      .replaceAll('-', '_')
      .replaceAll('æ', 'ae')
      .replaceAll('ø', 'o')
      .replaceAll('å', 'a');
  }

  function program2026() {
    return {
      '2026-06-22': {
        date: '2026-06-22', title: 'Måndag', menu: '',
        program: '09.00 Oppmøte ansvarlege\n09.30 Registrering opnar\n10.00 Oppstart aktivitetar\n11.30 Lunsj\n12.15 Nye instruktørgrupper startar\n13.15 Frukt\n13.30 Oppstart etter frukt\n14.00 Avslutning',
        note: 'Registrering og oppmøte · utdeling av ball, sekk og t-skjorte · matservering · allergiar og spesielle behov · frukt · rydding'
      },
      '2026-06-23': {
        date: '2026-06-23', title: 'Tysdag', menu: '',
        program: '09.30 Oppmøte ansvarlege\n09.45 Alle deltakarar skal vere på plass\n10.00 Oppstart aktivitetar\n11.30 Lunsj\n12.15 Nye instruktørgrupper startar\n13.15 Frukt\n14.00 Avslutning',
        note: 'Matservering · allergiar og spesielle behov · frukt · rydding'
      },
      '2026-06-24': {
        date: '2026-06-24', title: 'Onsdag', menu: '',
        program: '09.30 Oppmøte ansvarlege\n09.45 Alle deltakarar skal vere på plass\n10.00 Oppstart aktivitetar\n11.15 Lunsj\n12.00 Nye instruktørgrupper startar\n13.00 Frukt\n13.15 Storkamp deltakarar mot instruktørar\n14.00 Avslutning',
        note: 'Matservering · allergiar og spesielle behov · frukt · storkampen · opprydding av anlegget'
      }
    };
  }

  window.showLegacy2026Migration = function () {
    setIntro('Gjenopprett 2026-historikk', 'Kopierer gamle kryss, program og anonyme instruktørtilbakemeldingar til den nye sikre 2026-årgangen.', 'Administrator');
    menu().innerHTML = backButton('Administrasjon', 'showAdmin()');
    content().innerHTML = `<div class="welcome-box"><div class="important-box"><strong>Trygg eingongsmigrering</strong><p>Eksisterande nye data blir ikkje sletta. Migreringa kan køyrast på nytt utan å lage duplikat av dei gamle svara.</p></div><button class="menu-button compact" type="button" onclick="migrateLegacy2026()">Start gjenoppretting</button><div id="legacyMigrationStatus"></div></div>`;
  };

  async function commitOperations(operations) {
    for (let start = 0; start < operations.length; start += 350) {
      const batch = db.batch();
      operations.slice(start, start + 350).forEach(op => batch.set(op.ref, op.data, { merge: true }));
      await batch.commit();
    }
  }

  window.migrateLegacy2026 = async function () {
    const statusBox = document.getElementById('legacyMigrationStatus');
    if (!confirm('Gjenopprette 2026-historikken frå den gamle appen?')) return;
    statusBox.innerHTML = '<div class="status-box info">Les gamle data…</div>';
    try {
      const status = await yearStatus('2026');
      if (!status) throw new Error('Årgang 2026 finst ikkje.');
      if (status === 'archived') throw new Error('2026 er arkivert. Opne årgangen for redigering før migrering.');

      const user = auth.currentUser;
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (!userDoc.exists || userDoc.data().role !== 'admin') throw new Error('Berre administrator kan migrere historikk.');

      const operations = [];
      const programs = program2026();
      Object.entries(programs).forEach(([id, data]) => {
        operations.push({ ref: db.collection('years').doc('2026').collection('days').doc(id), data: { ...data, restoredFromLegacy: true, updatedAt: serverTimestamp(), updatedBy: user.uid } });
      });

      const pSnap = await db.collection('years').doc('2026').collection('participants').get();
      const participants = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const legacyGroups = {};
      for (let group = 1; group <= 5; group++) {
        const snap = await db.collection('fotballskule2026').doc('krysselister').collection(`gruppe${group}`).get();
        legacyGroups[group] = new Map(snap.docs.map(d => [d.id, d.data()]));
      }

      const sessionMap = {
        man_for: ['2026-06-22', 'for'], man_etter: ['2026-06-22', 'etter'],
        tir_for: ['2026-06-23', 'for'], tir_etter: ['2026-06-23', 'etter'],
        ons_for: ['2026-06-24', 'for'], ons_etter: ['2026-06-24', 'etter']
      };

      let attendanceCount = 0;
      participants.forEach(p => {
        const group = Number(p.group);
        const legacy = legacyGroups[group]?.get(legacyParticipantId(p.name));
        if (!legacy) return;
        Object.entries(sessionMap).forEach(([legacyKey, [dayId, slot]]) => {
          if (!Object.prototype.hasOwnProperty.call(legacy, legacyKey)) return;
          const sessionId = `${dayId}_${slot}_g${group}`;
          operations.push({
            ref: db.collection('years').doc('2026').collection('attendance').doc(sessionId).collection('entries').doc(p.id),
            data: { present: legacy[legacyKey] === true, restoredFromLegacy: true, updatedAt: serverTimestamp(), updatedBy: user.uid }
          });
          attendanceCount++;
        });
      });

      const oldFeedback = await db.collection('fotballskule2026').doc('tilbakemeldingar').collection('instruktorar').get();
      oldFeedback.docs.forEach(doc => {
        const data = doc.data();
        operations.push({ ref: db.collection('years').doc('2026').collection('feedback').doc(`legacy-${doc.id}`), data: { ...data, anonymous: true, source: 'legacy-2026', restoredFromLegacy: true } });
      });

      await commitOperations(operations);
      statusBox.innerHTML = `<div class="status-box success">✅ Gjenoppretting ferdig: ${attendanceCount} gamle kryss/oppmøtefelt, ${oldFeedback.size} tilbakemeldingar og program for 3 dagar er kopiert inn i 2026.</div><p>Du kan no opne Krysselister og Tilbakemeldingar for å kontrollere historikken.</p>`;
    } catch (error) {
      console.error(error);
      statusBox.innerHTML = `<div class="status-box error">${esc(error.message || 'Migreringa mislukkast.')}</div><p>Om feilen er «Missing or insufficient permissions», må dei oppdaterte Firestore-reglane publiserast først.</p>`;
    }
  };

  // The secure app may already have rendered the home screen before this addon loaded.
  if (auth.currentUser) enhanceHomeMenu();
})();