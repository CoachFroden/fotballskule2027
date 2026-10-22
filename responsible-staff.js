(() => {
  'use strict';

  const db = firebase.firestore();
  const auth = firebase.auth();
  const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

  let staffState = { year: '', role: '', days: [], adults: [], privateById: new Map(), selectedDayId: '' };

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
    const raw = `${day.date || day.id || ''} ${day.title || ''} ${day.name || ''}`;
    return /^20\d{2}-09(?:-|\s|$)/.test(String(day.date || day.id || '')) || /\bseptember\b/i.test(raw);
  }

  function normalize(value = '') {
    return String(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'o')
      .replace(/å/g, 'a')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function formatDate(value) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value || '';
    return new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  }

  function shortDay(value) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value || '';
    const weekday = new Intl.DateTimeFormat('nn-NO', { weekday: 'short' }).format(date).replace('.', '');
    const day = new Intl.DateTimeFormat('nn-NO', { day: 'numeric' }).format(date);
    return `${weekday} ${day}`;
  }

  async function getRole() {
    const user = auth.currentUser;
    if (!user) return null;
    const doc = await db.collection('users').doc(user.uid).get();
    return doc.exists ? doc.data().role || null : null;
  }

  function pickDefaultDay(days) {
    const today = localIsoDate();
    return days.find(day => String(day.date || day.id) === today)
      || days.find(day => String(day.date || day.id) > today)
      || days[days.length - 1]
      || null;
  }

  function dayKey(day) {
    return String(day?.id || day?.date || '');
  }

  function adultIsPresent(adult, day) {
    const ids = Array.isArray(adult.dayIds) ? adult.dayIds.map(String) : [];
    const targetIds = new Set([String(day.id || ''), String(day.date || '')].filter(Boolean));
    if (ids.length) return ids.some(id => targetIds.has(id));

    const raw = String(adult.days || '').trim();
    if (!raw || /alle/i.test(raw)) return true;

    const hay = normalize(raw);
    const date = new Date(`${day.date || day.id}T12:00:00`);
    const weekday = Number.isNaN(date.getTime()) ? '' : normalize(new Intl.DateTimeFormat('nn-NO', { weekday: 'long' }).format(date));
    const title = normalize(`${day.title || ''} ${day.name || ''}`);
    const dateText = normalize(String(day.date || day.id || ''));
    return Boolean((weekday && hay.includes(weekday)) || (title && hay.includes(title)) || (dateText && hay.includes(dateText)));
  }

  async function loadStaffData() {
    const year = currentYear();
    const role = await getRole();
    if (!year || !role) return { year, role, days: [], adults: [], privateById: new Map() };

    const yearRef = db.collection('years').doc(year);
    const [daysSnap, adultsSnap] = await Promise.all([
      yearRef.collection('days').get(),
      yearRef.collection('adults').get()
    ]);

    let privateSnap = null;
    if (role === 'admin' || role === 'responsible') {
      try {
        privateSnap = await yearRef.collection('adultPrivate').get();
      } catch (error) {
        if (role === 'admin') throw error;
        console.warn('Kontaktinfo for ansvarlege er ikkje tilgjengeleg enno:', error);
      }
    }

    const days = daysSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(day => !isSeptemberDay(day))
      .sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));

    const adults = adultsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'no'));

    const privateById = new Map(privateSnap ? privateSnap.docs.map(doc => [doc.id, doc.data()]) : []);
    return { year, role, days, adults, privateById };
  }

  function backButton(label = 'Framside') {
    return `<button class="back-button" type="button" onclick="showHome()">← ${esc(label)}</button>`;
  }

  function roleBadges(roleText = '') {
    const parts = String(roleText || 'Ansvarleg')
      .split(/[·,;\n]+/)
      .map(part => part.trim())
      .filter(Boolean);
    return `<div class="v2-staff-roles">${parts.map(part => `<span class="v2-staff-role ${/hovud|hoved/i.test(part) ? 'is-lead' : ''}">${esc(part)}</span>`).join('')}</div>`;
  }

  function contactHtml(priv = {}) {
    const phone = String(priv.phone || '').trim();
    const email = String(priv.email || '').trim();
    if (!phone && !email) return '<p class="muted v2-staff-no-contact">Ingen kontaktinfo registrert.</p>';
    return `<div class="v2-staff-contact">
      ${phone ? `<a href="tel:${esc(phone.replace(/\s+/g, ''))}" class="v2-staff-contact-btn">📞 ${esc(phone)}</a>` : ''}
      ${email ? `<a href="mailto:${esc(email)}" class="v2-staff-contact-btn">✉️ ${esc(email)}</a>` : ''}
    </div>`;
  }

  function renderResponsibleDay(dayId) {
    const day = staffState.days.find(item => dayKey(item) === String(dayId)) || staffState.days[0];
    if (!day) return;
    staffState.selectedDayId = dayKey(day);

    document.querySelectorAll('.v2-staff-day-button').forEach(button => {
      button.classList.toggle('is-active', button.dataset.dayId === staffState.selectedDayId);
    });

    const adults = staffState.adults.filter(adult => adultIsPresent(adult, day));
    const target = document.getElementById('responsibleStaffList');
    const summary = document.getElementById('responsibleStaffSummary');
    if (summary) summary.innerHTML = `<strong>${esc(formatDate(day.date || day.id))}</strong><span>${adults.length} ansvarleg${adults.length === 1 ? '' : 'e'} på plass</span>`;
    if (!target) return;

    target.innerHTML = adults.length ? `<div class="v2-staff-grid">${adults.map(adult => {
      const priv = staffState.privateById.get(adult.id) || {};
      const lead = /hovud|hoved/i.test(String(adult.role || ''));
      return `<article class="v2-staff-card ${lead ? 'is-lead' : ''}">
        <div class="v2-staff-card-head">
          <div class="v2-staff-avatar">${esc(String(adult.name || '?').trim().charAt(0).toUpperCase())}</div>
          <div><h3>${esc(adult.name || 'Utan namn')}</h3>${lead ? '<span class="v2-staff-lead-label">⭐ Hovudansvarleg</span>' : ''}</div>
        </div>
        ${roleBadges(adult.role)}
        ${contactHtml(priv)}
      </article>`;
    }).join('')}</div>` : '<div class="status-box info">Ingen ansvarlege er registrerte på denne dagen enno.</div>';
  }

  window.selectResponsibleStaffDay = function (dayId) {
    renderResponsibleDay(dayId);
  };

  window.showResponsibleAdults = async function () {
    const data = await loadStaffData();
    if (data.role !== 'responsible' && !window.v2IsPreviewRole?.('responsible')) return window.showHome();
    staffState = { ...data, selectedDayId: '' };

    const intro = document.getElementById('pageIntro');
    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    if (!intro || !menu || !content) return;

    intro.innerHTML = `<div class="hero-card"><p class="hero-kicker">Fotballskule ${esc(data.year)}</p><h2>Ansvarlege på plass</h2><p>Sjå kven av dei vaksne som er med den aktuelle dagen, kva rolle dei har og korleis du får tak i dei.</p></div>`;
    menu.innerHTML = backButton();

    if (!data.days.length) {
      content.innerHTML = '<section class="match-empty-state" role="status"><span class="match-empty-eyebrow">BEMANNING · ' + esc(data.year) + '</span><h3>Her kjem laget for kvar dag.</h3><p>Ingen programdagar er lagde inn enno. Når dagane er klare, får du oversikt over ansvarlege, roller og kontaktinformasjon her.</p><button type="button" class="match-empty-back" onclick="showHome()">Tilbake til oversikta <span aria-hidden="true">↗</span></button></section>';
      return;
    }

    const focus = pickDefaultDay(data.days);
    content.innerHTML = `<div class="welcome-box v2-staff-page">
      <div class="v2-staff-day-picker" role="tablist" aria-label="Vel programdag">
        ${data.days.map(day => `<button type="button" class="v2-staff-day-button" data-day-id="${esc(dayKey(day))}" onclick="selectResponsibleStaffDay('${esc(dayKey(day))}')"><strong>${esc(shortDay(day.date || day.id))}</strong><span>${esc(day.title || '')}</span></button>`).join('')}
      </div>
      <div id="responsibleStaffSummary" class="v2-staff-summary"></div>
      <div id="responsibleStaffList"></div>
      <div class="v2-staff-shared-note">🤝 <strong>Felles ansvar:</strong> Dei ansvarlege fordeler dei praktiske oppgåvene seg imellom gjennom dagen. Denne sida viser berre kven som er på plass og eventuelle særlege roller.</div>
    </div>`;
    renderResponsibleDay(dayKey(focus));
  };

  function slugify(value = '') {
    return String(value)
      .trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || `ansvarleg-${Date.now()}`;
  }

  function adminDayChecks(days, adult = {}) {
    const selected = new Set(Array.isArray(adult.dayIds) ? adult.dayIds.map(String) : []);
    const allDays = !selected.size && (!adult.days || /alle/i.test(String(adult.days)));
    return `<div class="v2-staff-admin-days">
      <label class="v2-staff-check"><input id="adultAllDays" type="checkbox" ${allDays ? 'checked' : ''} onchange="toggleAdultDayChecks()"><span>Alle programdagar</span></label>
      ${days.map(day => `<label class="v2-staff-check"><input class="adult-day-check" type="checkbox" value="${esc(dayKey(day))}" ${selected.has(dayKey(day)) ? 'checked' : ''}><span>${esc(formatDate(day.date || day.id))}</span></label>`).join('')}
    </div>`;
  }

  window.toggleAdultDayChecks = function () {
    const all = document.getElementById('adultAllDays')?.checked;
    document.querySelectorAll('.adult-day-check').forEach(input => {
      input.disabled = Boolean(all);
      if (all) input.checked = false;
    });
  };

  function renderAdultAdminEditor(adult = null) {
    const target = document.getElementById('adultAdminEditor');
    if (!target) return;
    const priv = adult ? (staffState.privateById.get(adult.id) || {}) : {};
    target.innerHTML = `<form class="v2-staff-admin-form" onsubmit="saveResponsibleAdult(event)">
      <input id="adultEditId" type="hidden" value="${esc(adult?.id || '')}">
      <div class="v2-staff-admin-head"><div><span class="v2-day-admin-kicker">${adult ? '✏️ Rediger ansvarleg' : '＋ Ny ansvarleg'}</span><h3>${esc(adult?.name || 'Legg til vaksen')}</h3></div><button type="button" class="v2-day-close" onclick="closeResponsibleAdultEditor()">Lukk</button></div>
      <div class="form-grid">
        <label>Namn<input id="adultName" required value="${esc(adult?.name || '')}" placeholder="Namn"></label>
        <label>Rolle / særleg ansvar<input id="adultRole" value="${esc(adult?.role || '')}" placeholder="t.d. Hovudansvarleg · Ansvar for instruktørar"></label>
        <label>Telefon<input id="adultPhone" type="tel" value="${esc(priv.phone || '')}" placeholder="Telefonnummer"></label>
        <label>E-post<input id="adultEmail" type="email" value="${esc(priv.email || '')}" placeholder="E-post"></label>
      </div>
      <div class="v2-staff-admin-days-title"><strong>Kva dagar er personen med?</strong><span>Vel programdagane, eller alle.</span></div>
      ${adminDayChecks(staffState.days, adult || {})}
      <button class="menu-button compact success" type="submit">Lagre ansvarleg</button>
      <div id="adultAdminStatus"></div>
    </form>`;
    window.toggleAdultDayChecks();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.newResponsibleAdult = function () {
    renderAdultAdminEditor(null);
  };

  window.editResponsibleAdult = function (id) {
    const adult = staffState.adults.find(item => item.id === String(id));
    if (adult) renderAdultAdminEditor(adult);
  };

  window.closeResponsibleAdultEditor = function () {
    const target = document.getElementById('adultAdminEditor');
    if (target) target.innerHTML = '';
  };

  function dayLabelList(ids) {
    return ids.map(id => {
      const day = staffState.days.find(item => dayKey(item) === id);
      return day ? formatDate(day.date || day.id) : id;
    }).join(', ');
  }

  window.saveResponsibleAdult = async function (event) {
    event.preventDefault();
    if (staffState.role !== 'admin' || !auth.currentUser) return;

    const year = staffState.year;
    const existingId = String(document.getElementById('adultEditId')?.value || '');
    const name = String(document.getElementById('adultName')?.value || '').trim();
    const roleText = String(document.getElementById('adultRole')?.value || '').trim();
    const phone = String(document.getElementById('adultPhone')?.value || '').trim();
    const email = String(document.getElementById('adultEmail')?.value || '').trim();
    const allDays = Boolean(document.getElementById('adultAllDays')?.checked);
    const selectedIds = allDays ? [] : [...document.querySelectorAll('.adult-day-check:checked')].map(input => String(input.value));
    const status = document.getElementById('adultAdminStatus');

    if (!name) return;
    if (!allDays && !selectedIds.length) {
      if (status) status.innerHTML = '<div class="status-box error">Vel minst éin dag eller «Alle programdagar».</div>';
      return;
    }

    const id = existingId || slugify(name);
    const yearRef = db.collection('years').doc(year);
    const batch = db.batch();
    batch.set(yearRef.collection('adults').doc(id), {
      name,
      role: roleText || 'Ansvarleg',
      dayIds: selectedIds,
      days: allDays ? 'Alle dagar' : dayLabelList(selectedIds),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    }, { merge: true });
    batch.set(yearRef.collection('adultPrivate').doc(id), {
      phone,
      email,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    }, { merge: true });

    try {
      if (status) status.innerHTML = '<div class="status-box info">Lagrar…</div>';
      await batch.commit();
      if (status) status.innerHTML = '<div class="status-box success">✓ Lagret</div>';
      window.setTimeout(() => window.showAdminAdults(), 450);
    } catch (error) {
      console.error(error);
      if (status) status.innerHTML = `<div class="status-box error">Kunne ikkje lagre: ${esc(error.message || 'ukjend feil')}</div>`;
    }
  };

  window.showAdminAdults = async function () {
    const data = await loadStaffData();
    if (data.role !== 'admin') return;
    staffState = { ...data, selectedDayId: '' };

    const intro = document.getElementById('pageIntro');
    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    if (!intro || !menu || !content) return;

    intro.innerHTML = `<div class="hero-card"><p class="hero-kicker">Administrator · Fotballskule ${esc(data.year)}</p><h2>Ansvarlege på plass</h2><p>Legg inn dei vaksne, kva dagar dei er med, rolle og kontaktinformasjon.</p></div>`;
    menu.innerHTML = '<button class="back-button" type="button" onclick="showAdmin()">← Administrasjon</button>';

    content.innerHTML = `<div class="welcome-box v2-staff-admin-page">
      <div class="v2-staff-admin-toolbar"><div><strong>${data.adults.length} registrerte</strong><span>Kontaktinfo er berre synleg for admin og ansvarlege.</span></div><button class="v2-day-new" type="button" onclick="newResponsibleAdult()"><span>＋</span> Ny ansvarleg</button></div>
      <div class="v2-staff-grid">${data.adults.length ? data.adults.map(adult => `<article class="v2-staff-card ${/hovud|hoved/i.test(String(adult.role || '')) ? 'is-lead' : ''}">
        <div class="v2-staff-card-head"><div class="v2-staff-avatar">${esc(String(adult.name || '?').charAt(0).toUpperCase())}</div><div><h3>${esc(adult.name || 'Utan namn')}</h3>${roleBadges(adult.role)}</div></div>
        <p class="v2-staff-days">📅 ${esc(adult.days || 'Alle dagar')}</p>
        ${contactHtml(data.privateById.get(adult.id) || {})}
        <button class="text-button" type="button" onclick="editResponsibleAdult('${esc(adult.id)}')">Rediger</button>
      </article>`).join('') : '<p>Ingen ansvarlege er registrerte enno.</p>'}</div>
      <div id="adultAdminEditor"></div>
    </div>`;
  };

  function relabelResponsibleLinks(root = document) {
    root.querySelectorAll('button, .v2-action-copy strong, .v2-more-row span').forEach(node => {
      if (String(node.textContent || '').trim() === 'Ansvarsfordeling') node.textContent = 'Ansvarlege på plass';
    });
    root.querySelectorAll('.menu-copy small, .v2-action-copy span').forEach(node => {
      const text = String(node.textContent || '');
      if (/kven av dei vaksne gjer kva/i.test(text) || /kven av dei vaksne som har kva rolle/i.test(text)) {
        node.textContent = 'Kven er med i dag, rolle og kontakt';
      }
    });
  }

  const observer = new MutationObserver(() => relabelResponsibleLinks(document));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  relabelResponsibleLinks(document);
})();
