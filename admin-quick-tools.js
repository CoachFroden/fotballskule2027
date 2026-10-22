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
    appendUniqueButton('missing-now', menuButton('🚨', 'Mangler nå', 'Se hvem som ikke er møtt og ring foresatte', 'showSimpleMissingAdmin()', 'danger'));
    appendUniqueButton('read-feedback', menuButton('💬', 'Les tilbakemeldinger', 'Administrator · alle instruktørsvar', 'showSimpleFeedbackAdmin()'));
  }

  function enhanceAdmin() {
    if (!menu()) return;

    const missing = [...menu().querySelectorAll('.menu-button')].find(btn => btn.textContent.includes('Manglande oppmøte'));
    if (missing) {
      missing.setAttribute('onclick', 'showSimpleMissingAdmin()');
      const title = missing.querySelector('.menu-copy > span');
      const subtitle = missing.querySelector('.menu-copy > small');
      if (title) title.textContent = 'Mangler nå';
      if (subtitle) subtitle.textContent = 'Hvem mangler – med foresattkontakt';
    } else {
      appendUniqueButton('missing-now-admin', menuButton('🚨', 'Mangler nå', 'Hvem mangler – med foresattkontakt', 'showSimpleMissingAdmin()', 'danger'));
    }

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

  window.showSimpleMissingAdmin = async function () {
    const year = currentYear();
    try {
      await ensureAdmin();
      if (!year) throw new Error('Ingen årgang er vald.');
      const days = await loadDays(year);

      setIntro('Mangler nå', 'Vel dag og tidspunkt. Du får ei kort liste over alle som ikkje er kryssa av.', `Fotballskule ${year}`);
      menu().innerHTML = backButton('Framside', 'showHome()');
      content().innerHTML = `<div class="welcome-box">
        ${days.length ? `<div class="day-grid">${days.map(day => {
          const label = formatDate(day.date) || day.title || day.id;
          return `<article class="day-card"><h3>${esc(label)}</h3><div class="quick-grid"><button class="menu-button compact" type="button" onclick="loadSimpleMissing('${esc(day.id)}','for')">Før lunsj</button><button class="menu-button compact" type="button" onclick="loadSimpleMissing('${esc(day.id)}','etter')">Etter lunsj</button></div></article>`;
        }).join('')}</div>` : '<div class="status-box warning">Ingen dagar er registrerte.</div>'}
        <div id="simpleMissingResult"></div>
      </div>`;
    } catch (error) {
      console.error(error);
      content().innerHTML = `<div class="welcome-box"><div class="status-box error">${esc(error.message)}</div></div>`;
    }
  };

  function extractPhones(text = '') {
    const matches = String(text).match(/(?:\+47\s*)?(?:\d[\s-]*){8}/g) || [];
    const unique = [];
    matches.forEach(match => {
      const normalized = match.replace(/[^+\d]/g, '').replace(/^0047/, '+47');
      if (!unique.includes(normalized)) unique.push(normalized);
    });
    return unique;
  }

  function contactHtml(guardian = '') {
    const phones = extractPhones(guardian);
    if (!guardian) return '<p class="muted">Ingen foresattkontakt registrert.</p>';
    const buttons = phones.map(phone => `<a class="menu-button compact" href="tel:${esc(phone)}">📞 Ring ${esc(phone)}</a>`).join('');
    return `<p><strong>Foresatt:</strong><br>${esc(guardian)}</p>${buttons || '<p class="muted">Ingen telefonnummer funne i kontaktfeltet.</p>'}`;
  }

  window.loadSimpleMissing = async function (dayId, slot) {
    const year = currentYear();
    const target = document.getElementById('simpleMissingResult');
    if (!target) return;
    target.innerHTML = '<div class="status-box info">Hentar oppmøte…</div>';

    try {
      await ensureAdmin();
      const [pSnap, privSnap, days] = await Promise.all([
        db.collection('years').doc(year).collection('participants').get(),
        db.collection('years').doc(year).collection('participantPrivate').get(),
        loadDays(year)
      ]);

      const participants = pSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'no'));
      const priv = new Map(privSnap.docs.map(d => [d.id, d.data()]));
      const groups = [...new Set(participants.map(p => Number(p.group)).filter(Boolean))].sort((a, b) => a - b);
      const attendanceSnaps = await Promise.all(groups.map(group => db.collection('years').doc(year).collection('attendance').doc(`${dayId}_${slot}_g${group}`).collection('entries').get()));

      let totalMissing = 0;
      let sections = '';

      groups.forEach((group, index) => {
        const present = new Set(attendanceSnaps[index].docs.filter(d => d.data().present === true).map(d => d.id));
        const groupPeople = participants.filter(p => Number(p.group) === group);
        const missing = groupPeople.filter(p => !present.has(p.id));
        totalMissing += missing.length;

        sections += `<section class="attendance-overview-section"><h3>Gruppe ${group} · ${missing.length} mangler</h3>${missing.length ? `<div class="contact-grid">${missing.map(p => {
          const guardian = priv.get(p.id)?.guardian || '';
          return `<article class="contact-card"><h3>${esc(p.name)}</h3>${contactHtml(guardian)}<button class="text-button" type="button" onclick="markPresentFromMissing('${esc(dayId)}','${esc(slot)}',${group},'${esc(p.id)}')">✓ Marker møtt</button></article>`;
        }).join('')}</div>` : '<p>✅ Alle er kryssa av.</p>'}</section>`;
      });

      const day = days.find(d => d.id === dayId) || { date: dayId, title: dayId };
      target.innerHTML = `<div class="important-box"><h3>${esc(formatDate(day.date) || day.title || dayId)} · ${slot === 'for' ? 'før lunsj' : 'etter lunsj'}</h3><p><strong>${totalMissing} mangler totalt</strong></p></div>${sections}`;
    } catch (error) {
      console.error(error);
      target.innerHTML = `<div class="status-box error">${esc(error.message || 'Kunne ikkje hente oppmøte.')}</div>`;
    }
  };

  window.markPresentFromMissing = async function (dayId, slot, group, participantId) {
    const year = currentYear();
    try {
      const user = await ensureAdmin();
      const sessionId = `${dayId}_${slot}_g${group}`;
      await db.collection('years').doc(year).collection('attendance').doc(sessionId).collection('entries').doc(participantId).set({
        present: true,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }, { merge: true });
      await window.loadSimpleMissing(dayId, slot);
    } catch (error) {
      console.error(error);
      alert('Kunne ikkje markere som møtt.');
    }
  };

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