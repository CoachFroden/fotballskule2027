(() => {
  'use strict';

  const db = firebase.firestore();
  const auth = firebase.auth();
  const previousShowHome = window.showHome;
  let refreshToken = 0;
  const selectedByYear = new Map();

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
    return /^20\d{2}-09(?:-|$)/.test(value)
      || /\bseptember\b/i.test(`${day.title || ''} ${day.name || ''}`);
  }

  function esc(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function lines(text = '') {
    return String(text)
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateParts(day) {
    const value = String(day?.date || day?.id || '');
    const date = parseDate(value);
    if (!date) return { day: '–', month: '', long: value, short: value };
    return {
      day: new Intl.DateTimeFormat('nn-NO', { day: '2-digit' }).format(date),
      month: new Intl.DateTimeFormat('nn-NO', { month: 'short' }).format(date).replace('.', ''),
      long: new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date),
      short: new Intl.DateTimeFormat('nn-NO', { weekday: 'short', day: 'numeric', month: 'short' }).format(date).replaceAll('.', '')
    };
  }

  function assignedCount(day = {}) {
    const plan = day.instructorPlan || {};
    return new Set([
      ...Object.keys(plan.for || {}),
      ...Object.keys(plan.etter || {})
    ]).size;
  }

  function defaultFocusDay(days) {
    const today = localIsoDate();
    return days.find(day => String(day.date || day.id) === today)
      || days.find(day => String(day.date || day.id) > today)
      || days[days.length - 1]
      || null;
  }

  function relationFor(day, days, manuallySelected) {
    if (manuallySelected) return 'Vald programdag';
    const today = localIsoDate();
    const value = String(day?.date || day?.id || '');
    if (value === today) return 'I dag';
    if (value > today) return 'Neste programdag';
    if (day?.id === days[days.length - 1]?.id) return 'Siste programdag';
    return 'Programdag';
  }

  function ensurePicker(host, days, selectedId) {
    const card = host.closest('.v2-today-card');
    const section = card?.closest('.v2-section');
    if (!card || !section) return null;

    let picker = section.querySelector('.v2-dashboard-day-picker');
    if (!picker) {
      picker = document.createElement('div');
      picker.className = 'v2-dashboard-day-picker';
      picker.setAttribute('aria-label', 'Vel programdag');
      card.parentNode.insertBefore(picker, card);
    }

    picker.innerHTML = days.map(day => {
      const parts = dateParts(day);
      const active = String(day.id) === String(selectedId);
      return `<button type="button" class="v2-dashboard-day-button${active ? ' is-active' : ''}" data-day-id="${esc(day.id)}" aria-pressed="${active ? 'true' : 'false'}"><span>${esc(parts.short)}</span><small>${esc(day.title || '')}</small></button>`;
    }).join('');

    picker.querySelectorAll('.v2-dashboard-day-button').forEach(button => {
      button.addEventListener('click', () => {
        const year = currentYear();
        const id = button.dataset.dayId || '';
        if (!year || !id) return;
        selectedByYear.set(year, id);
        renderSelectedDay(days, id, true);
      });
    });

    return picker;
  }

  function updateInfoTiles(card, day) {
    const side = card.querySelector('.v2-today-side');
    if (!side) return;

    const tiles = [...side.querySelectorAll('.v2-info-tile')];
    const menu = lines(day.menu || '')[0] || 'Meny ikkje lagt inn';
    const count = assignedCount(day);
    const planText = count ? `${count} instruktørar sett opp` : 'Sjå instruktørplan';

    if (tiles[0]) {
      const strong = tiles[0].querySelector('strong');
      if (strong) strong.textContent = menu;
    }
    if (tiles[1]) {
      const strong = tiles[1].querySelector('strong');
      if (strong) strong.textContent = planText;
    }

    const role = document.body.dataset.v2Role || '';
    const note = String(day.note || '').trim();
    let noteTile = side.querySelector('.v2-dashboard-note-tile');
    const action = side.querySelector('.v2-action');

    if (note && role !== 'instructor') {
      if (!noteTile) {
        noteTile = document.createElement('div');
        noteTile.className = 'v2-info-tile v2-dashboard-note-tile';
        noteTile.innerHTML = '<span>📌 Beskjed</span><strong></strong>';
        side.insertBefore(noteTile, action || null);
      }
      const strong = noteTile.querySelector('strong');
      if (strong) strong.textContent = note;
    } else {
      noteTile?.remove();
    }
  }

  function renderSelectedDay(days, selectedId, manuallySelected = false) {
    const host = document.querySelector('.v2-program-lines');
    const card = host?.closest('.v2-today-card');
    if (!host || !card) return;

    const day = days.find(item => String(item.id) === String(selectedId)) || defaultFocusDay(days);
    if (!day) return;

    const parts = dateParts(day);
    const programLines = lines(day.program || '');
    const relation = relationFor(day, days, manuallySelected);

    const badgeDay = card.querySelector('.v2-date-badge strong');
    const badgeMonth = card.querySelector('.v2-date-badge span');
    const eyebrow = card.querySelector('.v2-day-copy .v2-eyebrow');
    const heading = card.querySelector('.v2-day-copy h3');
    const longDate = card.querySelector('.v2-day-copy > p:last-child');

    if (badgeDay) badgeDay.textContent = parts.day;
    if (badgeMonth) badgeMonth.textContent = parts.month;
    if (eyebrow) eyebrow.textContent = relation;
    if (heading) heading.textContent = day.title || parts.long || 'Fotballskuledag';
    if (longDate) longDate.textContent = parts.long;

    host.innerHTML = programLines.length
      ? programLines.map(line => `<div class="v2-program-line">${esc(line)}</div>`).join('')
      : '<div class="v2-program-line">Program ikkje lagt inn enno</div>';

    updateInfoTiles(card, day);

    const sectionHeading = card.closest('.v2-section')?.querySelector('.v2-section-head h2');
    if (sectionHeading) sectionHeading.textContent = relation;

    ensurePicker(host, days, day.id);
  }

  async function enhanceDashboardProgram(token, attempt = 0) {
    if (token !== refreshToken || !auth.currentUser) return;

    const host = document.querySelector('.v2-program-lines');
    if (!host) {
      if (attempt < 10) {
        window.setTimeout(() => enhanceDashboardProgram(token, attempt + 1), 180);
      }
      return;
    }

    const year = currentYear();
    if (!year) return;

    try {
      const snap = await db.collection('years').doc(year).collection('days').get();
      if (token !== refreshToken) return;

      const days = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(day => !isSeptemberDay(day))
        .sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));

      if (!days.length) return;

      const storedId = selectedByYear.get(year);
      const storedDay = days.find(day => day.id === storedId);
      const focusDay = storedDay || defaultFocusDay(days);
      if (!focusDay) return;

      renderSelectedDay(days, focusDay.id, Boolean(storedDay));
    } catch (error) {
      console.error('Kunne ikkje vise dagsprogramveljaren:', error);
    }
  }

  function scheduleRefresh() {
    const token = ++refreshToken;
    window.setTimeout(() => enhanceDashboardProgram(token), 220);
  }

  if (previousShowHome) {
    window.showHome = function () {
      const result = previousShowHome.apply(this, arguments);
      scheduleRefresh();
      return result;
    };
    window.goHome = window.showHome;
  }

  auth.onAuthStateChanged(user => {
    if (user) scheduleRefresh();
    else {
      refreshToken++;
      selectedByYear.clear();
    }
  });
})();
