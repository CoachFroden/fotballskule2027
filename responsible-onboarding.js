(() => {
  'use strict';
  const db = firebase.firestore();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = id => document.getElementById(id);
  let context = null;

  window.responsibleOnboardingGate = async (user, year, days) => {
    if (!user || !year) return false;
    const base = db.collection('years').doc(String(year));
    const [adult, privateDoc] = await Promise.all([
      base.collection('adults').doc(user.uid).get(),
      base.collection('adultPrivate').doc(user.uid).get()
    ]);
    if (adult.data()?.onboardingComplete && privateDoc.data()?.phone) return false;
    context = {user, year: String(year), days: days || [], adult: adult.data() || {}, privateData: privateDoc.data() || {}};
    const a = context.adult, p = context.privateData;
    $('mainMenu').innerHTML = '';
    $('pageIntro').innerHTML = '<div class="hero-card"><p class="hero-kicker">SAMNANGER IL · '+esc(year)+'</p><h2>Velkomen på laget!</h2><p>Fyll inn kontaktinformasjon og vel dagane du skal vere med.</p></div>';
    $('content').innerHTML = '<section class="welcome-box staff-onboarding"><form id="responsibleOnboardingForm" onsubmit="saveResponsibleOnboarding(event)"><h3>Din informasjon</h3><div class="form-grid"><label>Fullt namn<input id="onboardName" required maxlength="120" autocomplete="name" value="'+esc(a.name || user.displayName || '')+'"></label><label>Telefonnummer<input id="onboardPhone" type="tel" required minlength="5" maxlength="25" autocomplete="tel" value="'+esc(p.phone || '')+'"></label></div><h3>Kva dagar skal du vere med?</h3><p>Vel alle dagane som passar. Du kan endre dette seinare.</p><div class="onboard-days">'+context.days.map(d => '<label class="onboard-day"><input type="checkbox" name="onboardDay" value="'+esc(d.id)+'"><span>'+esc(d.date || d.title || d.id)+'</span></label>').join('')+'</div>'+(context.days.length ? '' : '<p class="status-box warning">Ingen programdagar er registrerte enno. Du kan lagre kontaktinformasjonen no og velje dagar seinare.</p>')+'<p id="onboardError" role="alert"></p><button class="menu-button compact" type="submit">Lagre og gå vidare</button></form></section>';
    return true;
  };

  window.saveResponsibleOnboarding = async event => {
    event.preventDefault();
    if (!context) return;
    const name = $('onboardName').value.trim(), phone = $('onboardPhone').value.trim();
    const dayIds = [...document.querySelectorAll('input[name="onboardDay"]:checked')].map(e => e.value);
    const error = $('onboardError'), button = event.target.querySelector('button[type="submit"]');
    if (!name || !/^[+0-9 ()-]{5,25}$/.test(phone)) { error.textContent = 'Kontroller namn og telefonnummer.'; return; }
    if (context.days.length && !dayIds.length) { error.textContent = 'Vel minst éin dag.'; return; }
    button.disabled = true; error.textContent = '';
    try {
      const base = db.collection('years').doc(context.year);
      const batch = db.batch();
      batch.update(base.collection('adults').doc(context.user.uid), {
        name, dayIds, days: dayIds.length ? dayIds.join(', ') : 'Ikkje valt',
        onboardingComplete: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.set(base.collection('adultPrivate').doc(context.user.uid), {
        phone, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, {merge: true});
      await batch.commit();
      context = null;
      window.location.reload();
    } catch (e) {
      console.error(e);
      error.textContent = 'Kunne ikkje lagre. Prøv igjen. ('+(e.code || 'ukjend feil')+')';
      button.disabled = false;
    }
  };
})();
