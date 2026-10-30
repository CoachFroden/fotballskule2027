(() => {
  'use strict';

  const db = firebase.firestore();
  const auth = firebase.auth();
  const originalShowChecklists = window.showChecklists;
  const originalShowChecklistSession = window.showChecklistSession;
  let cachedRole = null;
  let roleUid = null;
  let smartDays = [];

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

  function localIsoDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function isSeptemberDay(day = {}) {
    const value = String(day.date || day.id || '');
    return /^20\d{2}-09(?:-|$)/.test(value) || /\bseptember\b/i.test(`${day.title || ''} ${day.name || ''}`);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  }

  function formatClock(minutes) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    return `${h}.${m}`;
  }

  async function getRole() {
    const user = auth.currentUser;
    if (!user) return null;
    if (roleUid === user.uid && cachedRole) return cachedRole;
    const doc = await db.collection('users').doc(user.uid).get();
    roleUid = user.uid;
    cachedRole = doc.exists ? doc.data().role || null : null;
    return cachedRole;
  }

  auth.onAuthStateChanged(() => {
    roleUid = null;
    cachedRole = null;
    smartDays = [];
  });

  async function loadDays(year) {
    const snap = await db.collection('years').doc(String(year)).collection('days').get();
    return snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(day => !isSeptemberDay(day))
      .sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));
  }

  function switchMinutes(day, year) {
    const text = String(day.program || day.schedule || '');
    const match = text.match(/(\d{1,2})[.:](\d{2})[\s\S]{0,90}?nye\s+instruktørgrupper\s+startar/i);
    if (match) return Number(match[1]) * 60 + Number(match[2]);

    if (String(year) === '2026') {
      const date = String(day.date || day.id || '');
      if (date === '2026-06-24') return 12 * 60;
      if (date === '2026-06-22' || date === '2026-06-23') return 12 * 60 + 15;
    }
    return 12 * 60;
  }

  function currentContext(days, year, now = new Date()) {
    const today = localIsoDate(now);
    const day = days.find(item => String(item.date || item.id) === today) || null;
    if (!day) return { day: null, slot: null, switchAt: null };
    const minutes = now.getHours() * 60 + now.getMinutes();
    const switchAt = switchMinutes(day, year);
    return { day, slot: minutes >= switchAt ? 'etter' : 'for', switchAt };
  }

  function setIntro(title, text, kicker = '') {
    const intro = document.getElementById('pageIntro');
    if (!intro) return;
    intro.innerHTML = `<div class="hero-card">${kicker ? `<p class="hero-kicker">${esc(kicker)}</p>` : ''}<h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
  }

  function smartNav() {
    const menu = document.getElementById('mainMenu');
    if (!menu) return;
    menu.innerHTML = '<button class="back-button" type="button" onclick="showHome()">← Framside</button>';
  }

  function groupButton(group, count, context) {
    const hint = context.day
      ? `${context.slot === 'for' ? 'Før lunsj' : 'Etter lunsj'} · ${formatDate(context.day.date || context.day.id)}`
      : 'Vel gruppe – deretter vel du liste';
    return `<button class="smart-group-card smart-group-${group}" type="button" onclick="openSmartChecklist(${group})">
      <span class="smart-group-number">${group}</span>
      <span class="smart-group-copy"><strong>Gruppe ${group}</strong><small>${esc(hint)}</small></span>
      <span class="smart-group-count">${count}</span>
    </button>`;
  }

  async function showInstructorSmartChecklists() {
    const year = currentYear();
    if (!year) return;

    const [participantsSnap, days] = await Promise.all([
      db.collection('years').doc(year).collection('participants').get(),
      loadDays(year)
    ]);
    smartDays = days;
    const participants = participantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const groups = [...new Set(participants.map(p => Number(p.group)).filter(Boolean))].sort((a, b) => a - b);
    const context = currentContext(days, year);
    if (context.day && auth.currentUser) {
      try {
        const planDoc = await db.collection('years').doc(year).collection('instructorPlans').doc(context.day.id).get();
        const assignedGroup = Number(planDoc.data()?.[context.slot]?.[auth.currentUser.uid]);
        if (assignedGroup && groups.includes(assignedGroup)) {
          await originalShowChecklistSession(context.day.id, context.slot, assignedGroup);
          injectSmartSessionTools(assignedGroup, context);
          return;
        }
      } catch (error) {
        console.warn('Kunne ikkje finne automatisk instruktørgruppe', error);
      }
    }

    setIntro('Krysseliste no', 'Vel gruppa du har no. Rett liste blir vald automatisk ut frå dag og klokkeslett.', `Fotballskule ${year}`);
    smartNav();

    const content = document.getElementById('content');
    if (!content) return;

    const contextBox = context.day
      ? `<div class="smart-now-card"><span class="smart-now-dot"></span><div><strong>${esc(formatDate(context.day.date || context.day.id))}</strong><span>${context.slot === 'for' ? 'Før lunsj' : 'Etter lunsj'} · byter automatisk kl. ${formatClock(context.switchAt)}</span></div></div>`
      : `<div class="smart-now-card is-off"><span class="smart-now-dot"></span><div><strong>Ingen fotballskuledag i dag</strong><span>Vel gruppe for å finne dei andre listene. Under fotballskulen opnar rett liste automatisk.</span></div></div>`;

    content.innerHTML = `<div class="welcome-box smart-checklist-home">
      ${contextBox}
      <div class="smart-group-grid">${groups.map(group => groupButton(group, participants.filter(p => Number(p.group) === group).length, context)).join('')}</div>
      <button class="smart-secondary-button" type="button" onclick="showSmartAllLists()">🗂️ Sjå alle krysselister</button>
    </div>`;
  }

  window.openSmartChecklist = async function (group) {
    const year = currentYear();
    if (!year) return;
    const days = smartDays.length ? smartDays : await loadDays(year);
    smartDays = days;
    const context = currentContext(days, year);

    if (!context.day) {
      return window.showSmartOtherLists(group);
    }

    await originalShowChecklistSession(context.day.id, context.slot, Number(group));
    injectSmartSessionTools(group, context);
  };

  function injectSmartSessionTools(group, context) {
    const menu = document.getElementById('mainMenu');
    if (menu) {
      menu.innerHTML = `
        <button class="back-button" type="button" onclick="showChecklists()">← Vel anna gruppe</button>
        <button class="smart-nav-button" type="button" onclick="showSmartOtherLists(${Number(group)})">🗂️ Andre lister</button>`;
    }

    const content = document.getElementById('content');
    const box = content?.querySelector('.welcome-box');
    if (box && !box.querySelector('.smart-session-banner')) {
      box.insertAdjacentHTML('afterbegin', `<div class="smart-session-banner"><span>⚡ Automatisk vald</span><strong>Gruppe ${Number(group)} · ${context.slot === 'for' ? 'før lunsj' : 'etter lunsj'}</strong><small>${esc(formatDate(context.day.date || context.day.id))}</small></div>`);
    }
  }

  window.showSmartOtherLists = async function (group) {
    const year = currentYear();
    if (!year) return;
    const days = smartDays.length ? smartDays : await loadDays(year);
    smartDays = days;

    setIntro(`Andre lister · Gruppe ${group}`, 'Bruk denne sida berre når du treng ei anna liste enn den appen vel automatisk.', `Fotballskule ${year}`);
    const menu = document.getElementById('mainMenu');
    if (menu) menu.innerHTML = '<button class="back-button" type="button" onclick="showChecklists()">← Bytt gruppe</button>';

    const content = document.getElementById('content');
    if (!content) return;
    content.innerHTML = `<div class="welcome-box smart-other-lists">
      ${days.map(day => `<article class="smart-day-row"><div><strong>${esc(formatDate(day.date || day.id) || day.title || day.id)}</strong><small>Vel tidspunkt manuelt</small></div><div class="smart-slot-buttons"><button type="button" onclick="openManualSmartChecklist('${esc(day.id)}','for',${Number(group)})">☀️ Før lunsj</button><button type="button" onclick="openManualSmartChecklist('${esc(day.id)}','etter',${Number(group)})">🌤️ Etter lunsj</button></div></article>`).join('')}
    </div>`;
  };

  window.showSmartAllLists = async function () {
    const role = await getRole();
    if (role !== 'instructor') return originalShowChecklists?.();
    const year = currentYear();
    if (!year) return;
    const snap = await db.collection('years').doc(year).collection('participants').get();
    const participants = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const groups = [...new Set(participants.map(p => Number(p.group)).filter(Boolean))].sort((a, b) => a - b);

    setIntro('Alle krysselister', 'Vel gruppe først. Deretter får du alle dagar og tidspunkt.', `Fotballskule ${year}`);
    smartNav();
    const content = document.getElementById('content');
    if (content) content.innerHTML = `<div class="welcome-box"><div class="smart-group-grid">${groups.map(group => `<button class="smart-group-card smart-group-${group}" type="button" onclick="showSmartOtherLists(${group})"><span class="smart-group-number">${group}</span><span class="smart-group-copy"><strong>Gruppe ${group}</strong><small>Vis alle lister</small></span><span class="smart-group-count">${participants.filter(p => Number(p.group) === group).length}</span></button>`).join('')}</div></div>`;
  };

  window.openManualSmartChecklist = async function (dayId, slot, group) {
    const year = currentYear();
    const days = smartDays.length ? smartDays : await loadDays(year);
    smartDays = days;
    const day = days.find(item => item.id === dayId) || { id: dayId, date: dayId };
    await originalShowChecklistSession(dayId, slot, Number(group));
    const context = { day, slot, switchAt: switchMinutes(day, year) };
    injectSmartSessionTools(group, context);
  };

  window.showChecklists = async function () {
    const role = await getRole();
    if (role === 'instructor') return showInstructorSmartChecklists();
    return originalShowChecklists?.apply(this, arguments);
  };
})();
