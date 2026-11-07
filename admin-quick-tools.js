(() => {
  'use strict';

  const db = firebase.firestore();
  const auth = firebase.auth();
  const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

  const previousShowHome = window.showHome;
  const previousShowAdmin = window.showAdmin;

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

  function appendUniqueButton(key, html) {
    if (!menu() || menu().querySelector(`[data-quick-tool="${key}"]`)) return;
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const button = holder.firstElementChild;
    if (!button) return;
    button.dataset.quickTool = key;
    menu().appendChild(button);
  }

  function isAdminMenuVisible() {
    return [...(menu()?.querySelectorAll('.menu-button') || [])].some(btn => btn.textContent.includes('Administrasjon'));
  }

  function enhanceHome() {
    if (!isAdminMenuVisible()) return;
  }

  function enhanceAdmin() {
    if (!menu()) return;
    appendUniqueButton('instructor-account-links', menuButton('👤', 'Instruktørar – brukarkontoar', 'Kople instruktørar til innlogging', 'showInstructorAccountLinks()'));

    // Manglande oppmøte har snarveg på admin-forsida, ikkje her.
    [...menu().querySelectorAll('.menu-button')].filter(btn =>
      btn.textContent.includes('Manglande oppmøte') || btn.textContent.includes('Mangler nå')
    ).forEach(btn => btn.remove());

    const feedback = [...menu().querySelectorAll('.menu-button')].find(btn => btn.textContent.includes('Tilbakemeldingar'));
    if (feedback) {
      feedback.setAttribute('onclick', 'showSimpleFeedbackAdmin()');
      const title = feedback.querySelector('.menu-copy > span');
      const subtitle = feedback.querySelector('.menu-copy > small');
      if (title) title.textContent = 'Les tilbakemeldinger';
      if (subtitle) subtitle.textContent = 'Alle svar og oppsummering';
    } else {
      appendUniqueButton('read-feedback-admin', menuButton('💬', 'Les tilbakemeldinger', 'Alle svar og oppsummering', 'showSimpleFeedbackAdmin()'));
    }
  }

  if (previousShowHome) {
    window.showHome = function () {
      const result = previousShowHome.apply(this, arguments);
      enhanceHome();
      return result;
    };
    window.goHome = window.showHome;
  }

  if (previousShowAdmin) {
    window.showAdmin = function () {
      const result = previousShowAdmin.apply(this, arguments);
      enhanceAdmin();
      return result;
    };
  }

  async function ensureAdmin() {
    const user = auth.currentUser;
    if (!user) throw new Error('Du er ikkje logga inn.');
    const profile = await db.collection('users').doc(user.uid).get();
    if (!profile.exists || profile.data().role !== 'admin') throw new Error('Berre administrator kan opne denne sida.');
    return user;
  }

  function formatDate(value) {
    if (!value) return '';
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  }

  function fallback2026Days() {
    return [
      { id: '2026-06-22', date: '2026-06-22', title: 'Måndag' },
      { id: '2026-06-23', date: '2026-06-23', title: 'Tysdag' },
      { id: '2026-06-24', date: '2026-06-24', title: 'Onsdag' }
    ];
  }

  async function loadDays(year) {
    const snap = await db.collection('years').doc(year).collection('days').get();
    const days = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));
    return days.length ? days : (year === '2026' ? fallback2026Days() : []);
  }

  function average(rows, field) {
    const values = rows.map(r => Number(r[field])).filter(v => v >= 1 && v <= 5);
    return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : '–';
  }

  function feedbackDate(value) {
    try {
      const date = value?.toDate ? value.toDate() : null;
      return date ? new Intl.DateTimeFormat('nn-NO', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '';
    } catch (_) {
      return '';
    }
  }

  window.showSimpleFeedbackAdmin = async function () {
    const year = currentYear();
    try {
      await ensureAdmin();
      if (!year) throw new Error('Ingen årgang er vald.');

      setIntro('Tilbakemeldinger fra instruktørene', 'Alle anonyme svar samlet på ett sted.', `Fotballskule ${year}`);
      menu().innerHTML = backButton('Framside', 'showHome()');
      content().innerHTML = '<div class="welcome-box"><div class="status-box info">Hentar tilbakemeldingar…</div></div>';

      let snap = await db.collection('years').doc(year).collection('feedback').get();
      let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      let sourceLabel = '';

      if (!rows.length && year === '2026') {
        const legacy = await db.collection('fotballskule2026').doc('tilbakemeldingar').collection('instruktorar').get();
        rows = legacy.docs.map(d => ({ id: d.id, ...d.data() }));
        if (rows.length) sourceLabel = 'Leses direkte frå det gamle 2026-arkivet.';
      }

      rows.sort((a, b) => (b.tidspunkt?.seconds || 0) - (a.tidspunkt?.seconds || 0));
      const again = { Ja: 0, Kanskje: 0, Nei: 0 };
      rows.forEach(r => { if (Object.prototype.hasOwnProperty.call(again, r.igjen)) again[r.igjen]++; });

      content().innerHTML = `<div class="welcome-box">
        ${sourceLabel ? `<div class="status-box info">${esc(sourceLabel)}</div>` : ''}
        <div class="quick-grid">
          <div class="contact-card"><h3>${rows.length}</h3><p>Svar</p></div>
          <div class="contact-card"><h3>${average(rows, 'trivsel')}</h3><p>Trivsel / 5</p></div>
          <div class="contact-card"><h3>${average(rows, 'app')}</h3><p>App / 5</p></div>
          <div class="contact-card"><h3>${average(rows, 'ovelser')}</h3><p>Øvelser / 5</p></div>
          <div class="contact-card"><h3>${average(rows, 'stotte')}</h3><p>Støtte / 5</p></div>
        </div>
        <div class="important-box"><strong>Vil være instruktør igjen:</strong><br>Ja ${again.Ja} · Kanskje ${again.Kanskje} · Nei ${again.Nei}</div>
        <div class="contact-grid">${rows.map((r, index) => `<article class="contact-card"><p class="section-label">Svar ${index + 1}${feedbackDate(r.tidspunkt) ? ` · ${esc(feedbackDate(r.tidspunkt))}` : ''}</p><p><strong>Trivsel:</strong> ${esc(r.trivsel || '–')}/5 · <strong>App:</strong> ${esc(r.app || '–')}/5</p><p><strong>Øvelser:</strong> ${esc(r.ovelser || '–')}/5 · <strong>Støtte:</strong> ${esc(r.stotte || '–')}/5</p>${r.bra ? `<h4>Det som fungerte bra</h4><p>${esc(r.bra)}</p>` : ''}${r.bedre ? `<h4>Kan bli bedre</h4><p>${esc(r.bedre)}</p>` : ''}${r.forslag ? `<h4>Forslag</h4><p>${esc(r.forslag)}</p>` : ''}<p><strong>Instruktør igjen:</strong> ${esc(r.igjen || '–')}</p></article>`).join('') || '<div class="status-box warning">Ingen tilbakemeldinger ble funnet for denne årgangen.</div>'}</div>
      </div>`;
    } catch (error) {
      console.error(error);
      content().innerHTML = `<div class="welcome-box"><div class="status-box error">${esc(error.message || 'Kunne ikkje hente tilbakemeldingane.')}</div></div>`;
    }
  };
})();