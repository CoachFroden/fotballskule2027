(() => {
  'use strict';

  const db = firebase.firestore();
  const auth = firebase.auth();
  let viewerCache = null;

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
    const date = String(day.date || '');
    if (/^\d{4}-09-/.test(date)) return true;
    const label = `${day.title || ''} ${day.name || ''}`.toLowerCase();
    return label.includes('september');
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('nn-NO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(date);
  }

  function setIntro(title, text, kicker = '') {
    const intro = document.getElementById('pageIntro');
    if (!intro) return;
    intro.innerHTML = `<div class="hero-card">${kicker ? `<p class="hero-kicker">${esc(kicker)}</p>` : ''}<h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
  }

  function backButton(label, action) {
    return `<button class="back-button" type="button" onclick="${action}">← ${esc(label)}</button>`;
  }

  async function getRole() {
    const user = auth.currentUser;
    if (!user) return null;
    const profile = await db.collection('users').doc(user.uid).get();
    return profile.exists ? profile.data().role || null : null;
  }

  async function loadData(year) {
    const yearRef = db.collection('years').doc(year);
    const [daysSnap, instructorsSnap, participantsSnap, plansSnap] = await Promise.all([
      yearRef.collection('days').get(),
      yearRef.collection('instructors').get(),
      yearRef.collection('participants').get(),
      yearRef.collection('instructorPlans').get()
    ]);

    const days = daysSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(day => !isSeptemberDay(day))
      .sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));
    const instructors = instructorsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'no'));
    const participants = participantsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'no'));
    const plans = Object.fromEntries(plansSnap.docs.map(doc => [doc.id, doc.data()]));
    const groups = [...new Set(participants.map(p => Number(p.group)).filter(Boolean))]
      .sort((a, b) => a - b);

    return {
      days,
      instructors,
      participants,
      plans,
      groups: groups.length ? groups : [1, 2, 3, 4, 5]
    };
  }

  function namesForGroup(plan, group, instructors) {
    return Object.entries(plan || {})
      .filter(([, assignedGroup]) => Number(assignedGroup) === Number(group))
      .map(([id]) => instructors.find(instructor => instructor.id === id)?.name || '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'no'));
  }

  function groupCards(slotPlan, groups, instructors) {
    return `<div class="schedule-card-grid">${groups.map(group => {
      const names = namesForGroup(slotPlan, group, instructors);
      return `<section class="schedule-mini-card group-card-${group}"><div class="schedule-mini-head"><strong>Gruppe ${group}</strong><span>${names.length}</span></div>${names.length ? `<ul class="instructor-chip-list">${names.map(name => `<li class="instructor-chip group-tone-${group}">${esc(name)}</li>`).join('')}</ul>` : '<p class="muted">Ingen sett opp</p>'}</section>`;
    }).join('')}</div>`;
  }

  window.renderCompactInstructorDay = function (dayId) {
    if (!viewerCache) return;
    const { days, plans, groups, instructors } = viewerCache;
    const day = days.find(item => item.id === dayId) || days[0];
    const target = document.getElementById('compactScheduleDay');
    if (!day || !target) return;

    const plan = plans[day.id] || {};
    target.innerHTML = `
      <div class="compact-day-heading">
        <p class="section-label">${esc(formatDate(day.date) || day.title || day.id)}</p>
        <h3>${esc(day.title || 'Fotballskuledag')}</h3>
      </div>
      <details class="schedule-accordion" open>
        <summary><span>☀️ Før lunsj</span><small>Vis grupper</small></summary>
        <div class="schedule-accordion-body">${groupCards(plan.for || {}, groups, instructors)}</div>
      </details>
      <details class="schedule-accordion">
        <summary><span>🌤️ Etter lunsj</span><small>Vis grupper</small></summary>
        <div class="schedule-accordion-body">${groupCards(plan.etter || {}, groups, instructors)}</div>
      </details>`;
  };

  window.showInstructorSchedule = async function () {
    const year = currentYear();
    if (!year) return;

    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    const data = await loadData(year);
    viewerCache = data;

    setIntro('Instruktørplan', 'Vel dag. Før og etter lunsj kan opnast kvar for seg.', `Fotballskule ${year}`);
    if (menu) menu.innerHTML = backButton('Framside', 'showHome()');

    if (!content) return;
    if (!data.days.length) {
      content.innerHTML = '<div class="welcome-box"><div class="status-box warning">Ingen fotballskuledagar er registrerte.</div></div>';
      return;
    }

    content.innerHTML = `
      <div class="welcome-box compact-schedule-shell">
        <label class="compact-day-picker">Dag
          <select onchange="renderCompactInstructorDay(this.value)">
            ${data.days.map(day => `<option value="${esc(day.id)}">${esc(formatDate(day.date) || day.title || day.id)}</option>`).join('')}
          </select>
        </label>
        <div id="compactScheduleDay"></div>
      </div>`;

    window.renderCompactInstructorDay(data.days[0].id);
  };

  window.showGroups = async function () {
    const year = currentYear();
    if (!year) return;

    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    const { participants, groups } = await loadData(year);

    setIntro('Deltakargrupper', 'Opne berre gruppa du treng å sjå.', `Fotballskule ${year}`);
    if (menu) menu.innerHTML = backButton('Framside', 'showHome()');
    if (!content) return;

    content.innerHTML = `<div class="welcome-box compact-group-list">${groups.map((group, index) => {
      const people = participants.filter(person => Number(person.group) === Number(group));
      return `<details class="schedule-accordion" ${index === 0 ? 'open' : ''}><summary><span>Gruppe ${group}</span><small>${people.length} deltakarar</small></summary><div class="schedule-accordion-body"><ul class="compact-name-list">${people.map(person => `<li>${esc(person.name)}</li>`).join('') || '<li>Ingen deltakarar</li>'}</ul></div></details>`;
    }).join('')}</div>`;
  };

  window.renderInstructorScheduleEditor = async function (dayId, slot) {
    const year = currentYear();
    if (!year || await getRole() !== 'admin') return;

    const target = document.getElementById('scheduleEditor');
    if (!target) return;
    target.innerHTML = '<div class="status-box info">Hentar instruktørar…</div>';

    const { instructors, groups } = await loadData(year);
    const planDoc = await db.collection('years').doc(year).collection('instructorPlans').doc(dayId).get();
    const current = planDoc.exists ? (planDoc.data()?.[slot] || {}) : {};

    const buckets = groups.map(group => ({
      key: String(group),
      title: `Gruppe ${group}`,
      people: instructors.filter(instructor => Number(current[instructor.id]) === Number(group))
    }));
    buckets.push({
      key: '',
      title: 'Ikkje med',
      people: instructors.filter(instructor => !current[instructor.id])
    });

    const selectHtml = instructor => {
      const group = Number(current[instructor.id]) || 0;
      return `<label class="schedule-person-row instructor-editor-row group-tone-${group}"><span>${esc(instructor.name)}</span><select data-instructor-id="${esc(instructor.id)}"><option value="">Ikkje med</option>${groups.map(optionGroup => `<option value="${optionGroup}" ${Number(current[instructor.id]) === Number(optionGroup) ? 'selected' : ''}>Gruppe ${optionGroup}</option>`).join('')}</select></label>`;
    };

    target.innerHTML = `
      <form class="form-stack compact-editor" onsubmit="saveInstructorSchedule(event,'${esc(dayId)}','${esc(slot)}')">
        <div class="important-box compact-editor-head">
          <div><strong>${slot === 'for' ? '☀️ Før lunsj' : '🌤️ Etter lunsj'}</strong><p>Opne ei gruppe for å endre instruktørane.</p></div>
          <button class="menu-button compact success schedule-save-top" type="submit">Lagre instruktørplan</button>
        </div>
        <div class="schedule-editor-groups">
          ${buckets.map((bucket, index) => `<details class="schedule-accordion" ${index === 0 ? 'open' : ''}><summary><span>${esc(bucket.title)}</span><small>${bucket.people.length} instruktørar</small></summary><div class="schedule-accordion-body schedule-person-list">${bucket.people.length ? bucket.people.map(selectHtml).join('') : '<p class="muted">Ingen her</p>'}</div></details>`).join('')}
        </div>
      </form>
      <div id="scheduleSaveStatus"></div>`;
  };
})();
