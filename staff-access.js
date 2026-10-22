(() => {
  const auth = firebase.auth(), db = firebase.firestore();
  const $ = id => document.getElementById(id);
  const esc = x => String(x || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const screen = html => { $('mainMenu').innerHTML = ''; $('pageIntro').innerHTML = ''; $('content').innerHTML = '<div class="welcome-box auth-card">' + html + '</div>'; };
  const errorMessage = e => ({'auth/email-already-in-use':'E-postadressa er allereie registrert. Prøv å logge inn.','auth/weak-password':'Passordet må vere minst seks teikn.','auth/invalid-email':'Ugyldig e-postadresse.','auth/invalid-credential':'Feil e-post eller passord.'}[e.code] || 'Noko gjekk gale: ' + (e.code || 'ukjend feil'));
  window.staffAccessPending = async user => {
    let request;
    try { const snap = await db.collection('accessRequests').doc(user.uid).get(); request = snap.exists ? snap.data() : null; }
    catch (e) { console.error(e); }
    const pending = request?.status === 'pending';
    screen('<h2>' + (pending ? 'Vent på godkjenning' : 'Be om tilgang') + '</h2><p>Innlogga som ' + esc(user.email) + '</p>' +
      (pending ? '<p>Brukarkontoen din er oppretta, men må godkjennast av administrator før du får tilgang til Fotballskule 2027.</p><p>Prøv å logge inn igjen når du har fått beskjed.</p>' :
      '<form onsubmit="staffAccessApply(event)" class="form-grid"><label>Namn<input id="staffName" required maxlength="120" value="' + esc(user.displayName || '') + '"></label><label>Ønskt rolle<select id="staffRole"><option value="instructor">Instruktør</option><option value="responsible">Ansvarleg</option></select></label><button class="menu-button compact">Send søknad</button></form>') +
      '<button class="text-button" onclick="logout()">Logg ut</button>');
  };
  window.staffAccessApply = async event => {
    event.preventDefault();
    const user = auth.currentUser, role = $('staffRole').value, name = $('staffName').value.trim();
    if (!user || !name || !['instructor','responsible'].includes(role)) return;
    try {
      await db.collection('accessRequests').doc(user.uid).set({uid:user.uid, name, email:user.email || '', requestedRole:role, status:'pending', createdAt:firebase.firestore.FieldValue.serverTimestamp()});
      await window.staffAccessPending(user);
    } catch (e) { alert('Kunne ikkje sende søknaden. ' + (e.code || '')); }
  };
  window.staffEmailLogin = async event => {
    event.preventDefault();
    try { await auth.signInWithEmailAndPassword($('staffEmail').value.trim(), $('staffPassword').value); }
    catch (e) { alert(errorMessage(e)); }
  };
  window.staffEmailRegister = async event => {
    event.preventDefault();
    const name = $('staffNewName').value.trim(), email = $('staffNewEmail').value.trim(), password = $('staffNewPassword').value;
    if (!name || password.length < 6) return alert('Fyll inn namn og passord med minst seks teikn.');
    try { const result = await auth.createUserWithEmailAndPassword(email,password); await result.user.updateProfile({displayName:name}); await window.staffAccessPending(result.user); }
    catch (e) { alert(errorMessage(e)); }
  };
  window.staffForgotPassword = async () => {
    const email = $('staffEmail')?.value.trim() || prompt('Skriv inn e-postadressa di');
    if (!email) return;
    try { await auth.sendPasswordResetEmail(email); alert('Dersom adressa er registrert, får du e-post med instruksjonar.'); }
    catch (e) { alert(errorMessage(e)); }
  };
  window.staffAuthForm = mode => {
    if (mode === 'register') screen('<h2>Opprett brukarkonto</h2><form class="form-grid" onsubmit="staffEmailRegister(event)"><label>Namn<input id="staffNewName" required autocomplete="name"></label><label>E-post<input id="staffNewEmail" type="email" required autocomplete="email"></label><label>Passord<input id="staffNewPassword" type="password" minlength="6" required autocomplete="new-password"></label><button class="menu-button compact">Opprett konto</button></form><button class="text-button" onclick="staffAuthForm(\'login\')">Har du konto? Logg inn</button>');
    else screen('<h2>Logg inn med e-post</h2><form class="form-grid" onsubmit="staffEmailLogin(event)"><label>E-post<input id="staffEmail" type="email" required autocomplete="email"></label><label>Passord<input id="staffPassword" type="password" required autocomplete="current-password"></label><button class="menu-button compact">Logg inn</button></form><button class="text-button" onclick="staffForgotPassword()">Gløymt passord?</button><button class="text-button" onclick="staffAuthForm(\'register\')">Opprett brukarkonto</button>');
  };
  window.staffAccessAdmin = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const profile = await db.collection('users').doc(user.uid).get();
    if (profile.data()?.role !== 'admin') return;
    screen('<h2>Tilgangssøknader</h2><p>Hentar søknader…</p>');
    try {
      const snap = await db.collection('accessRequests').get();
      const requests = snap.docs.filter(d => d.data().status === 'pending');
      screen('<h2>Tilgangssøknader (' + requests.length + ')</h2>' + (requests.map(d => {
        const v=d.data(); return '<div class="contact-card"><h3>'+esc(v.name)+'</h3><p>'+esc(v.email)+'</p><p>'+ (v.requestedRole === 'responsible' ? 'Ansvarleg' : 'Instruktør') +'</p><button class="menu-button compact" onclick="staffDecide(\''+esc(d.id)+'\',true)">Godkjenn</button><button class="text-button" onclick="staffDecide(\''+esc(d.id)+'\',false)">Avslå</button></div>';
      }).join('') || '<p>Ingen ventande søknader.</p>') + '<button class="text-button" onclick="showAdmin()">Tilbake</button>');
    } catch(e) { screen('<h2>Tilgangssøknader</h2><p>Kunne ikkje hente søknader. Kontroller Firestore-reglane.</p>'); }
  };
  window.staffDecide = async (uid, approve) => {
    const user = auth.currentUser;
    if (!user) return;
    const admin = await db.collection('users').doc(user.uid).get();
    if (admin.data()?.role !== 'admin') return;
    try {
      const ref = db.collection('accessRequests').doc(uid), snap = await ref.get(), data = snap.data();
      if (!data || data.status !== 'pending' || !['instructor','responsible'].includes(data.requestedRole)) return;
      if (approve) await db.collection('users').doc(uid).set({role:data.requestedRole,name:data.name,email:data.email,approvedBy:user.uid,approvedAt:firebase.firestore.FieldValue.serverTimestamp()}, {merge:true});
      await ref.update({status:approve?'approved':'rejected',decidedBy:user.uid,decidedAt:firebase.firestore.FieldValue.serverTimestamp()});
      await window.staffAccessAdmin();
    } catch(e) { alert('Kunne ikkje behandle søknaden: '+(e.code||'')); }
  };
  const observer = new MutationObserver(() => {
    const btn = document.querySelector('.auth-card button[onclick="loginGoogle()"]');
    if (btn && !document.getElementById('staffEmailEntry')) btn.insertAdjacentHTML('afterend','<button id="staffEmailEntry" class="menu-button compact" type="button" onclick="staffAuthForm(\'login\')">Logg inn med e-post / opprett konto</button>');
  });
  observer.observe(document.getElementById('content'), {childList:true,subtree:true});
})();