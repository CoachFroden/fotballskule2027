(() => {
  'use strict';

  const db = firebase.firestore();
  const auth = firebase.auth();

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

  function isSeptemberValue(value = '') {
    const text = String(value).trim();
    return /^20\d{2}-09(?:-|$)/.test(text) || /\bseptember\b/i.test(text);
  }

  function isSeptemberDay(day = {}) {
    return isSeptemberValue(day.date || day.id || '') || /\bseptember\b/i.test(`${day.title || ''} ${day.name || ''}`);
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

  async function getRole() {
    const user = auth.currentUser;
    if (!user) return null;
    const profile = await db.collection('users').doc(user.uid).get();
    return profile.exists ? profile.data().role || null : null;
  }

  async function loadVisibleDays(year) {
    if (!year) return [];
    const snap = await db.collection('years').doc(year).collection('days').get();
    return snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(day => !isSeptemberDay(day))
      .sort((a, b) => String(a.date || a.id).localeCompare(String(b.date || b.id)));
  }

  function cleanInstructorProgram(program = '') {
    return String(program)
      .split(/\r?\n/)
      .filter(line => !/ansvarleg/i.test(line))
      .join('\n')
      .trim();
  }

  function shouldHideResponsibleNote(day, year, role) {
    if (role !== 'instructor' || !day?.note) return false;
    if (year !== '2026') return false;
    if (day.restoredFromLegacy) return true;
    return /registrering|utdeling|matservering|allergi|spesielle behov|rydding|opprydding/i.test(String(day.note));
  }

  // Dagsprogram: instruktørar får berre det dei treng. Ansvarleg-oppgåver blir ikkje viste.
  window.showDays = async function () {
    const year = currentYear();
    if (!year) return;

    const [days, role] = await Promise.all([loadVisibleDays(year), getRole()]);
    const intro = document.getElementById('pageIntro');
    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');

    if (intro) {
      intro.innerHTML = `<div class="hero-card"><p class="hero-kicker">Fotballskule ${esc(year)}</p><h2>Dagsprogram & meny</h2><p>${role === 'instructor' ? 'Programmet du treng som instruktør.' : 'Program, meny og beskjedar for fotballskulen.'}</p></div>`;
    }
    if (menu) {
      menu.innerHTML = '<button class="back-button" type="button" onclick="showHome()">← Framside</button>';
    }
    if (!content) return;

    if (!days.length) {
      content.innerHTML = '<div class="welcome-box"><p>Program og meny er ikkje lagt inn enno.</p></div>';
      return;
    }

    content.innerHTML = `<div class="welcome-box"><div class="day-grid">${days.map(day => {
      const program = role === 'instructor' ? cleanInstructorProgram(day.program || '') : String(day.program || '');
      const hideNote = shouldHideResponsibleNote(day, year, role);
      return `<article class="day-card">
        <p class="section-label">${esc(formatDate(day.date) || day.title || day.id)}</p>
        <h3>${esc(day.title || day.name || 'Fotballskuledag')}</h3>
        <div class="detail-card"><h4>🍽️ Meny</h4><p>${esc(day.menu || 'Ikkje lagt inn').replaceAll('\n', '<br>')}</p></div>
        <div class="detail-card"><h4>🕒 Program</h4><p>${esc(program || 'Ikkje lagt inn').replaceAll('\n', '<br>')}</p></div>
        ${day.note && !hideNote ? `<div class="important-box"><strong>Beskjed:</strong> ${esc(day.note)}</div>` : ''}
      </article>`;
    }).join('')}</div></div>`;
  };

  window.showInstructorInstructions = async function () {
    if (await getRole() !== 'instructor') return window.showHome();

    const intro = document.getElementById('pageIntro');
    const menu = document.getElementById('mainMenu');
    const content = document.getElementById('content');
    const year = currentYear();

    if (intro) intro.innerHTML = `<div class="hero-card"><p class="hero-kicker">Instruktør</p><h2>Instruksar</h2><p>Det viktigaste før, under og etter øktene.</p></div>`;
    if (menu) menu.innerHTML = '<button class="back-button" type="button" onclick="showHome()">← Framside</button>';
    if (!content) return;

    content.innerHTML = `
      <div class="welcome-box instructor-instructions">
        <h2>⚽ Instruktørinstruksar</h2>

        <h3>Før gruppa kjem</h3>
        <p>• Møt opp i god tid.<br>• Sjekk kva gruppe du skal ha.<br>• Finn fram nødvendig utstyr.<br>• Avtal kven som tek opprop.</p>

        <h3>Oppstart av gruppa</h3>
        <p>• Ta opprop.<br>• Presenter dykk som instruktørar.<br>• Fortel kort kva som skal skje denne dagen.<br>• Sjekk at alle har fotballsko og leggskinn.<br>• På dag 2 og 3 kan du spørje om dei hugsar noko frå dagen før.<br>• Start raskt med aktivitet. Vel blant øvingane eller finn på eigne.</p>

        <h3>Under øktene</h3>
        <p>• Ver positiv og inkluderande.<br>• Snakk med alle deltakarane.<br>• Ros innsats og forsøk.<br>• Hjelp dei som synest noko er vanskeleg.<br>• Hald aktiviteten i gang.<br>• Ingen skal stå lenge i kø.</p>

        <h3>Dersom nokon blir lei seg eller skadar seg</h3>
        <p>• Ta deg tid til å snakke med barnet.<br>• Meld frå til ein ansvarleg vaksen dersom du er usikker.<br>• Ingen barn skal gå aleine frå gruppa.</p>

        <h3>Etter lunsj</h3>
        <p>• Ta nytt opprop.<br>• Presenter dykk dersom gruppa har fått nye instruktørar.<br>• Start med ei enkel øving i 15–20 minutt.<br>• Del deretter inn i lag og spel kampar resten av økta, eller gjer fleire øvingar.</p>

        <h3>Avslutting av dagen</h3>
        <p>• Samle gruppa før dei går heim.<br>• Takk for innsatsen og den gode dagen.<br>• Fortel kort kva som skal skje neste dag.<br>• Rydd saman utstyr før du går.</p>

        <div class="important-box">
          <h3>⭐ Det viktigaste av alt</h3>
          <p>Målet er ikkje å vinne flest kampar eller gjennomføre flest mogleg øvingar.</p>
          <p>⚽ Alle skal ha det kjekt<br>⚽ Alle skal oppleve meistring<br>⚽ Alle skal bli inkluderte<br>⚽ Alle skal få nye vennskap<br>⚽ Alle skal gå heim med lyst til å spele meir fotball</p>
        </div>
      </div>`;
  };

  function addInstructorInstructionsButton() {
    const menu = document.getElementById('mainMenu');
    if (!menu || [...menu.querySelectorAll('.menu-button')].some(button => button.textContent.includes('Instruksar'))) return;

    const buttons = [...menu.querySelectorAll('.menu-button')];
    const dayButton = buttons.find(button => button.textContent.includes('Dagsprogram'));
    if (!dayButton) return;

    const button = document.createElement('button');
    button.className = 'menu-button';
    button.type = 'button';
    button.setAttribute('onclick', 'showInstructorInstructions()');
    button.innerHTML = '<span class="menu-icon" aria-hidden="true">📋</span><span class="menu-copy"><span>Instruksar</span><small>Det viktigaste for deg som instruktør</small></span>';
    dayButton.insertAdjacentElement('afterend', button);
  }

  async function updateVisibleDayCount() {
    const year = currentYear();
    if (!year) return;
    const days = await loadVisibleDays(year);
    document.querySelectorAll('.contact-card').forEach(card => {
      const label = card.querySelector('p')?.textContent || '';
      if (/Dagar i programmet/i.test(label)) {
        const number = card.querySelector('h3');
        if (number) number.textContent = String(days.length);
      }
    });
  }

  function removeSeptemberUi() {
    document.querySelectorAll('option').forEach(option => {
      if (isSeptemberValue(option.value) || /\bseptember\b/i.test(option.textContent || '')) option.remove();
    });

    document.querySelectorAll('.day-card').forEach(card => {
      if (/\bseptember\b/i.test(card.textContent || '')) card.remove();
    });

    document.querySelectorAll('.menu-button').forEach(button => {
      const text = button.textContent || '';
      if (/\bseptember\b/i.test(text)) button.remove();
    });
  }

  // Hindrar at nye septemberdagar blir lagde inn via admin.
  const previousSaveDay = window.saveDay;
  if (previousSaveDay) {
    window.saveDay = function (event) {
      const date = document.getElementById('dayDate')?.value || '';
      if (isSeptemberValue(date)) {
        event?.preventDefault?.();
        alert('Septemberdagar skal ikkje ligge i Fotballskule-appen. Vel ein annan dato.');
        return;
      }
      return previousSaveDay.apply(this, arguments);
    };
  }

  // Etter alle andre showHome-wrapperar: legg Instruksar berre hos instruktørane.
  const previousShowHome = window.showHome;
  if (previousShowHome) {
    window.showHome = function () {
      const result = previousShowHome.apply(this, arguments);
      window.setTimeout(async () => {
        try {
          removeSeptemberUi();
          await updateVisibleDayCount();
          if (await getRole() === 'instructor') addInstructorInstructionsButton();
        } catch (error) {
          console.error('Kunne ikkje rydde Fotballskule-visninga:', error);
        }
      }, 40);
      return result;
    };
    window.goHome = window.showHome;
  }

  // Funksjonar som framleis byggjer dagslister internt: rydd UI etter rendering.
  [
    'showAdminDays',
    'showAttendanceStart',
    'showMissingAdmin',
    'showSimpleMissingAdmin',
    'showChecklistGroup',
    'showInstructorSchedule',
    'showInstructorScheduleAdmin'
  ].forEach(name => {
    const previous = window[name];
    if (!previous || name === 'showDays') return;
    window[name] = function () {
      const result = previous.apply(this, arguments);
      Promise.resolve(result).finally(() => window.setTimeout(removeSeptemberUi, 0));
      return result;
    };
  });

  // Ekstra sikkerheit for dynamisk innhald som kjem inn etter async Firestore-kall.
  const observer = new MutationObserver(() => removeSeptemberUi());
  observer.observe(document.body, { childList: true, subtree: true });

  removeSeptemberUi();
})();
