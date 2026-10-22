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

    menu.innerHTML = [
      menuButton('📅', 'Dagsprogram & meny', 'Tidspunkt, mat, frukt og beskjedar', 'showDays()'),
      menuButton('✅', 'Krysselister', 'Kryss av gruppa før og etter lunsj', 'showChecklists()', 'success'),
      menuButton('🔄', 'Instruktørplan', 'Sjå kven som har kva gruppe i kvar økt', 'showInstructorSchedule()'),
      menuButton('🎯', 'Øvingar', 'Finn ei øving som passar gruppa', 'showExercises()'),
      menuButton('👥', 'Deltakargrupper', 'Sjå dei faste deltakargruppene', 'showGroups()'),
      menuButton('📝', 'Tilbakemelding', 'Anonym evaluering etter fotballskulen', 'showInstructorFeedback()')
    ].join('');

    content.innerHTML = `
      <div class="welcome-box">
        <h2>Klar for dagen</h2>
        <p>Vel det du treng over. Du ser berre arbeidsverktøya for instruktørar.</p>
        <button class="text-button" type="button" onclick="logout()">Logg ut</button>
      </div>`;
  }

  window.showHome = function () {
    const result = previousShowHome.apply(this, arguments);
    setTimeout(applyInstructorMode, 0);
    return result;
  };
  window.goHome = window.showHome;
})();
