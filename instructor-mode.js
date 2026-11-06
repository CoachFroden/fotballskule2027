(() => {
  'use strict';

  const auth = firebase.auth();
  const db = firebase.firestore();

  let cachedRole = null;
  let rolePromise = null;

  async function getRole() {
    const user = auth.currentUser;
    if (!user) return null;
    if (cachedRole) return cachedRole;
    if (!rolePromise) {
      rolePromise = db.collection('users').doc(user.uid).get().then(doc => {
        cachedRole = doc.exists ? doc.data().role || null : null;
        return cachedRole;
      }).finally(() => { rolePromise = null; });
    }
    return rolePromise;
  }

  auth.onAuthStateChanged(() => {
    cachedRole = null;
    rolePromise = null;
  });

  const previousShowHome = window.showHome;
  if (!previousShowHome) return;

  function escapeHtml(value = '') {
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

  function menuButton(icon, title, subtitle, action, tone = '') {
    return `<button class="menu-button ${tone}" type="button" onclick="${action}">
      <span class="menu-icon" aria-hidden="true">${icon}</span>
      <span class="menu-copy"><span>${escapeHtml(title)}</span><small>${escapeHtml(subtitle)}</small></span>
    </button>`;
  }

  async function applyInstructorMode() {
    if (await getRole() !== 'instructor') return;

    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    const intro = document.getElementById('pageIntro');
    const year = currentYear();
    if (!menu || !content || !intro || !year) return;

    intro.innerHTML = `
      <div class="hero-card">
        <p class="hero-kicker">Instruktør</p>
        <h2>Fotballskule ${escapeHtml(year)}</h2>
        <p>Det du treng under fotballskuledagen – enkelt og raskt.</p>
      </div>`;

    document.body.classList.add('instructor-simple-home');
    menu.innerHTML = [
      menuButton('✓', 'Registrer oppmøte', 'Dagens gruppe · før og etter lunsj', 'showChecklists()'),
      menuButton('↗', 'Øvingsbank', 'Søk og finn øvingar på få sekund', 'showExercises()'),
      menuButton('▦', 'Dagens program', 'Økter, tidspunkt og mat', 'showDays()')
    ].join('');

    content.innerHTML = `
      <section class="instructor-more" aria-label="Andre instruktørverktøy">
        <h3>Meir når du treng det</h3>
        <div class="instructor-more-links">
          <button type="button" onclick="showInstructorSchedule()">Instruktørplan <span aria-hidden="true">›</span></button>
          <button type="button" onclick="showGroups()">Deltakargrupper <span aria-hidden="true">›</span></button>
          <button type="button" onclick="showInstructorFeedback()">Tilbakemelding <span aria-hidden="true">›</span></button>
        </div>
      </section>`;

  }

  window.showHome = function () {
    const result = previousShowHome.apply(this, arguments);
    setTimeout(applyInstructorMode, 0);
    return result;
  };
  window.goHome = window.showHome;
})();
