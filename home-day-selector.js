(() => {
  'use strict';

  const db = firebase.firestore();
  const auth = firebase.auth();
  const selection = window.__v2HomeDaySelection || (window.__v2HomeDaySelection = {});
  const cache = new Map();
  const previousShowHome = window.showHome;
  let enhanceToken = 0;

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
    return /^20\d{2}-09(?:-|$)/.test(value)
      || /\bseptember\b/i.test(`${day.title || ''} ${day.name || ''}`);
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateParts(value) {
    const date = parseDate(value);
    if (!date) return { day: '–', month: '', long: value || '', short: value || '' };
    return {
      day: new Intl.DateTimeFormat('nn-NO', { day: '2-digit' }).format(date),
      month: new Intl.DateTimeFormat('nn-NO', { month: 'short' }).format(date).replace('.', ''),
      long: new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date),
      short: new Intl.DateTimeFormat('nn-NO', { weekday: 'short', day: 'numeric', month: 'short' }).format(date).replaceAll('.', '')
    };
  }

  function lines(text = '') {
    return String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }

  function firstLine(text = '') {
    return lines(text)[0] || '';
  }

  function automaticDay(days) {
    const today = localIsoDate();
    return days.find(day => String(day.date || day.id) === today)
      || days.find(day => String(day.date || day.id) > today)
      || days[days.length - 1]
      || null;
  }

  async function loadDays(year, force = false) {
    if (!force && cache.has(year)) return cache.get(year);
    const snap = await db.collection('years').doc(year).collection('days').get();
    const days = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(day => !isSeptemberDay(day))
      .sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));
    cache.set(year, days);
    return days;
  }

  function assignedCount(day) {
    const before = Object.keys(day?.instructorPlan?.for || {});
    const after = Object.keys(day?.instructorPlan?.etter || {});
    return new Set([...before, ...after]).size;
  }

  function renderPicker(days, selectedId) {
    const host = document.getElementById('v2HomeDayPicker');
    if (!host) return;
    host.innerHTML = days.map(day => {
      const parts = dateParts(day.date || day.id);
      const active = day.id === selectedId;
      return `<button class="v2-home-day-chip ${active ? 'is-active' : ''}" type="button" onclick="v2SelectHomeDay('${esc(day.id)}')" aria-pressed="${active ? 'true' : 'false'}">
        <span class="v2-home-day-dot">⚽</span>
        <span><strong>${esc(day.title || parts.short || day.id)}</strong><small>${esc(parts.short)}</small></span>
      </button>`;
    }).join('');
  }

  function renderDayCard(day) {
    const card = document.querySelector('.v2-home .v2-today-card');
    if (!card || !day) return;

    const role = document.body.dataset.v2Role || '';
    const parts = dateParts(day.date || day.id);
    const program = lines(day.program || '');
    const menu = firstLine(day.menu || '') || 'Meny ikkje lagt inn';
    const note = String(day.note || '').trim();
    const count = assignedCount(day);
    const planText = count ? `${count} instruktørar sett opp` : 'Sjå instruktørplan';
    const today = localIsoDate();
    const relation = String(day.date || day.id) === today ? 'I dag' : 'Vald programdag';

    card.innerHTML = `
      <div>
        <div class="v2-date-block">
          <div class="v2-date-badge"><strong>${esc(parts.day)}</strong><span>${esc(parts.month)}</span></div>
          <div class="v2-day-copy">
            <p class="v2-eyebrow">${esc(relation)}</p>
            <h3>${esc(day.title || parts.long || 'Fotballskuledag')}</h3>
            <p>${esc(parts.long)}</p>
          </div>
        </div>
        <div class="v2-program-lines">${program.length
          ? program.map(line => `<div class="v2-program-line">${esc(line)}</div>`).join('')
          : '<div class="v2-program-line">Program ikkje lagt inn enno</div>'}</div>
      </div>
      <div class="v2-today-side">
        <div class="v2-info-tile"><span>🍽️ Mat</span><strong>${esc(menu)}</strong></div>
        <div class="v2-info-tile"><span>🔄 Bemanning</span><strong>${esc(planText)}</strong></div>
        ${note && role !== 'instructor' ? `<div class="v2-info-tile"><span>📌 Beskjed</span><strong>${esc(note)}</strong></div>` : ''}
        <button class="v2-action" type="button" onclick="v2Open('showDays','home')" style="min-height:auto;padding:13px"><span class="v2-action-copy"><strong>Opne heile dagsplanen →</strong><span>Program, meny og beskjedar</span></span></button>
      </div>`;

    const section = card.closest('.v2-section');
    const heading = section?.querySelector('.v2-section-head h2');
    const copy = section?.querySelector('.v2-section-head p');
    if (heading) heading.textContent = relation;
    if (copy) copy.textContent = 'Vel programdag under — appen vel dagens dag automatisk under fotballskulen.';
  }

  async function enhanceHome(token, attempt = 0) {
    if (token !== enhanceToken || !auth.currentUser) return;
    const card = document.querySelector('.v2-home .v2-today-card');
    if (!card) {
      if (attempt < 12) window.setTimeout(() => enhanceHome(token, attempt + 1), 160);
      return;
    }

    const year = currentYear();
    if (!year) return;

    try {
      const days = await loadDays(year);
      if (token !== enhanceToken || !days.length) return;

      const validSelected = days.find(day => day.id === selection[year]);
      const selected = validSelected || automaticDay(days);
      if (!selected) return;
      selection[year] = selected.id;

      let picker = document.getElementById('v2HomeDayPicker');
      if (!picker) {
        picker = document.createElement('div');
        picker.id = 'v2HomeDayPicker';
        picker.className = 'v2-home-day-picker';
        card.parentNode.insertBefore(picker, card);
      }

      renderPicker(days, selected.id);
      renderDayCard(selected);
    } catch (error) {
      console.error('Kunne ikkje lage dagveljar på framsida:', error);
    }
  }

  window.v2SelectHomeDay = async function (dayId) {
    const year = currentYear();
    if (!year) return;
    selection[year] = String(dayId);
    try {
      const days = await loadDays(year);
      const selected = days.find(day => day.id === String(dayId));
      if (!selected) return;
      renderPicker(days, selected.id);
      renderDayCard(selected);
      document.querySelector('.v2-today-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      console.error('Kunne ikkje byte programdag:', error);
    }
  };

  function scheduleEnhance() {
    const token = ++enhanceToken;
    window.setTimeout(() => enhanceHome(token), 320);
  }

  if (previousShowHome) {
    window.showHome = function () {
      const result = previousShowHome.apply(this, arguments);
      scheduleEnhance();
      return result;
    };
    window.goHome = window.showHome;
  }

  auth.onAuthStateChanged(user => {
    if (user) scheduleEnhance();
    else {
      enhanceToken++;
      cache.clear();
    }
  });
})();
