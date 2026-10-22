(() => {
  'use strict';

  const db = firebase.firestore();
  const auth = firebase.auth();
  const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

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

  function menu() { return document.getElementById('mainMenu'); }
  function content() { return document.getElementById('content'); }
  function intro() { return document.getElementById('pageIntro'); }

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

  function formatDate(value) {
    if (!value) return '';
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  }

  async function getRole() {
    const user = auth.currentUser;
    if (!user) return null;
    const doc = await db.collection('users').doc(user.uid).get();
    return doc.exists ? doc.data().role || null : null;
  }

  async function loadYearData(year) {
    const yearRef = db.collection('years').doc(year);
    const [daysSnap, instructorsSnap, participantsSnap, plansSnap] = await Promise.all([
      yearRef.collection('days').get(),
      yearRef.collection('instructors').get(),
      yearRef.collection('participants').get(),
      yearRef.collection('instructorPlans').get()
    ]);

    const days = daysSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));
    const instructors = instructorsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'no'));
    const participants = participantsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'no'));
    const plans = Object.fromEntries(plansSnap.docs.map(d => [d.id, d.data()]));
    const groups = [...new Set(participants.map(p => Number(p.group)).filter(Boolean))].sort((a, b) => a - b);

    return { days, instructors, participants, plans, groups: groups.length ? groups : [1, 2, 3, 4, 5] };
  }

  function namesForGroup(plan = {}, group, instructors = []) {
    const ids = Object.entries(plan)
      .filter(([, assignedGroup]) => Number(assignedGroup) === Number(group))
      .map(([id]) => id);
    return ids
      .map(id => instructors.find(i => i.id === id)?.name || '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'no'));
  }

  window.showGroups = async function () {
    const year = currentYear();
    if (!year) return;
    const { participants, groups } = await loadYearData(year);

    setIntro('Deltakargrupper', 'Dei faste gruppene med deltakarane. Instruktørane rullerer og ligg derfor i eigen instruktørplan.', `Fotballskule ${year}`);
    menu().innerHTML = backButton('Framside', 'showHome()');
    content().innerHTML = `<div class="welcome-box quick-grid">${groups.map(group => {
      const people = participants.filter(p => Number(p.group) === Number(group));
      return `<section class="instruction-section"><h3>Gruppe ${group}</h3><p><strong>${people.length} deltakarar</strong></p><ul>${people.map(p => `<li>${esc(p.name)}</li>`).join('') || '<li>Ingen deltakarar</li>'}</ul></section>`;
    }).join('')}</div>`;
  };

  window.showInstructorSchedule = async function () {
    const year = currentYear();
    if (!year) return;

    const { days, instructors, groups, plans } = await loadYearData(year);
    setIntro('Instruktørplan', 'Instruktørane kan rullere både etter lunsj og frå dag til dag.', `Fotballskule ${year}`);
    menu().innerHTML = backButton('Framside', 'showHome()');

    if (!days.length) {
      content().innerHTML = '<div class="welcome-box"><div class="status-box warning">Ingen dagar er registrerte enno.</div></div>';
      return;
    }

    content().innerHTML = `<div class="welcome-box"><div class="day-grid">${days.map(day => {
      const plan = plans[day.id] || {};
      return `<article class="day-card"><p class="section-label">${esc(formatDate(day.date) || day.title || day.id)}</p><h3>${esc(day.title || 'Fotballskuledag')}</h3>${['for', 'etter'].map(slot => {
        const slotPlan = plan[slot] || {};
        return `<div class="detail-card"><h4>${slot === 'for' ? '☀️ Før lunsj' : '🌤️ Etter lunsj'}</h4>${groups.map(group => {
          const names = namesForGroup(slotPlan, group, instructors);
          return `<div class="schedule-group"><strong>Gruppe ${group}</strong>${names.length ? `<ul>${names.map(name => `<li>${esc(name)}</li>`).join('')}</ul>` : '<p class="muted">Ikkje sett opp</p>'}</div>`;
        }).join('')}</div>`;
      }).join('')}</article>`;
    }).join('')}</div></div>`;
  };

  const previousShowAdmin = window.showAdmin;
  if (previousShowAdmin) {
    window.showAdmin = function () {
      const result = previousShowAdmin.apply(this, arguments);
      const mainMenu = menu();
      if (!mainMenu || [...mainMenu.querySelectorAll('.menu-button')].some(b => b.textContent.includes('Instruktørplan'))) return result;
      const holder = document.createElement('div');
      holder.innerHTML = menuButton('🔄', 'Instruktørplan', 'Fordel instruktørane per dag og før/etter lunsj', 'showInstructorScheduleAdmin()');
      const button = holder.firstElementChild;
      if (button) mainMenu.appendChild(button);
      return result;
    };
  }

  window.showInstructorScheduleAdmin = async function () {
    const year = currentYear();
    if (!year) return;
    if (await getRole() !== 'admin') return window.showHome();

    const { days } = await loadYearData(year);
    setIntro('Administrer instruktørplan', 'Vel dag og økt. Kvar instruktør kan plasserast på éi gruppe for denne halvdagen.', `Fotballskule ${year}`);
    menu().innerHTML = backButton('Administrasjon', 'showAdmin()');

    content().innerHTML = `<div class="welcome-box">${days.length ? `<form class="form-grid" onsubmit="openInstructorScheduleEditor(event)"><label>Dag<select id="scheduleDay">${days.map(day => `<option value="${esc(day.id)}">${esc(formatDate(day.date) || day.title || day.id)}</option>`).join('')}</select></label><label>Økt<select id="scheduleSlot"><option value="for">Før lunsj</option><option value="etter">Etter lunsj</option></select></label><button class="menu-button compact" type="submit">Rediger fordeling</button></form>` : '<div class="status-box warning">Legg inn dagane først.</div>'}<div id="scheduleEditor"></div></div>`;
  };

  window.openInstructorScheduleEditor = async function (event) {
    event.preventDefault();
    await window.renderInstructorScheduleEditor(
      document.getElementById('scheduleDay').value,
      document.getElementById('scheduleSlot').value
    );
  };

  window.renderInstructorScheduleEditor = async function (dayId, slot) {
    const year = currentYear();
    if (await getRole() !== 'admin') return;
    const target = document.getElementById('scheduleEditor');
    if (!target) return;
    target.innerHTML = '<div class="status-box info">Hentar instruktørar…</div>';

    const { instructors, groups } = await loadYearData(year);
    const planDoc = await db.collection('years').doc(year).collection('instructorPlans').doc(dayId).get();
    const current = planDoc.exists ? (planDoc.data()?.[slot] || {}) : {};

    target.innerHTML = `<form class="form-stack" onsubmit="saveInstructorSchedule(event,'${esc(dayId)}','${esc(slot)}')"><div class="important-box"><strong>${slot === 'for' ? 'Før lunsj' : 'Etter lunsj'}</strong><p>Vel gruppe for kvar instruktør. «Ikkje med» betyr at instruktøren ikkje er sett opp i denne økta.</p></div>${instructors.map(instructor => `<label>${esc(instructor.name)}<select data-instructor-id="${esc(instructor.id)}"><option value="">Ikkje med</option>${groups.map(group => `<option value="${group}" ${Number(current[instructor.id]) === Number(group) ? 'selected' : ''}>Gruppe ${group}</option>`).join('')}</select></label>`).join('')}<button class="menu-button compact success" type="submit">Lagre instruktørplan</button></form><div id="scheduleSaveStatus"></div>`;
  };

  window.saveInstructorSchedule = async function (event, dayId, slot) {
    event.preventDefault();

    // Safari nuller event.currentTarget når den asynkrone event-handleren har yielda.
    // Ta vare på skjemaet før første await.
    const form = event.currentTarget;
    if (!form) throw new Error('Fann ikkje instruktørskjemaet. Last sida på nytt og prøv igjen.');

    const year = currentYear();
    if (await getRole() !== 'admin') throw new Error('Du er ikkje logga inn som administrator.');

    const assignments = {};
    form.querySelectorAll('select[data-instructor-id]').forEach(select => {
      if (select.value) assignments[select.dataset.instructorId] = Number(select.value);
    });

    const planRef = db.collection('years').doc(year).collection('instructorPlans').doc(dayId);
    const planDoc = await planRef.get();
    const existing = planDoc.exists ? planDoc.data() : {};

    await planRef.set({
      ...existing,
      [slot]: assignments,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    }, { merge: true });

    const status = document.getElementById('scheduleSaveStatus');
    if (status) status.innerHTML = '<div class="status-box success">✅ Instruktørplanen er lagra.</div>';
  };
})();