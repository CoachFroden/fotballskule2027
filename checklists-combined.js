(() => {
  'use strict';
  const db = firebase.firestore();
  const auth = firebase.auth();
  const previous = window.showChecklistSession;
  const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const year = () => document.getElementById('currentYearLabel')?.textContent?.match(/20\d{2}/)?.[0] || '2027';
  const today = () => { const d = new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
  const clock = () => { const d = new Date(); return d.getHours()*60+d.getMinutes(); };
  const minutes = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? Number(value.slice(0,2))*60+Number(value.slice(3,5)) : null;
  let active = null;
  let refresh = null;
  let beforeOverride = false;
  let correctionMode = false;
  function refreshLock() {
    if (!active) return;
    const unlock = active.day.date === today() && minutes(active.day.lunchTime) !== null && clock() >= minutes(active.day.lunchTime);
    const beforeOpen = correctionMode || (active.day.date === today() && (!unlock || beforeOverride));
    document.querySelectorAll('.combined-before').forEach(box => { box.disabled = !beforeOpen || active.archived; });
    const correction = document.getElementById('combinedBeforeUnlock');
    if (correction) {
      correction.hidden = active.archived || correctionMode || !unlock;
      correction.textContent = beforeOverride ? '🔒 Lås før lunsj' : '🔓 Lås opp før lunsj';
    }
    const beforeTag = document.getElementById('combinedBeforeTag');
    if (beforeTag) beforeTag.textContent = beforeOpen ? 'Open' : 'Låst';
    document.querySelectorAll('.combined-after').forEach(box => { box.disabled = !(unlock || correctionMode) || active.archived; });
    const manual = document.getElementById('combinedCorrectionMode');
    if (manual) { manual.hidden = active.archived; manual.textContent = correctionMode ? '🔒 Avslutt redigering' : '✏️ Rediger låst liste'; }
    const hint = document.getElementById('combinedAfterHint');
    if (hint) hint.textContent = active.archived ? 'Arkivert' : !active.day.lunchTime ? 'Vent på at administrator set klokkeslett' : unlock ? 'Open for registrering' : 'Opnar kl. '+active.day.lunchTime;
    const tag = document.getElementById('combinedAfterTag');
    if (tag) tag.textContent = (unlock || correctionMode) ? 'Open' : 'Låst';
  }
  window.showCombinedChecklist = async function(dayId, group) {
    const y = year(), ref = db.collection('years').doc(y), sessionKey = slot => dayId+'_'+slot+'_g'+group;
    const [peopleSnap, beforeSnap, afterSnap, daySnap, yearSnap] = await Promise.all([
      ref.collection('participants').get(),
      ref.collection('attendance').doc(sessionKey('for')).collection('entries').get(),
      ref.collection('attendance').doc(sessionKey('etter')).collection('entries').get(),
      ref.collection('days').doc(dayId).get(),
      ref.get()
    ]);
    const day = {id:dayId,date:dayId,...(daySnap.data() || {})};
    const people = peopleSnap.docs.map(d => ({id:d.id,...d.data()})).filter(p => Number(p.group) === Number(group)).sort((a,b) => String(a.name||'').localeCompare(String(b.name||''),'no'));
    const before = new Map(beforeSnap.docs.map(d => [d.id,d.data().present===true]));
    const after = new Map(afterSnap.docs.map(d => [d.id,d.data().present===true]));
    const archived = yearSnap.data()?.status === 'archived';
    active = {day,archived};
    beforeOverride = false;
    correctionMode = false;
    document.getElementById('pageIntro').innerHTML = '<div class="hero-card"><p class="hero-kicker">Fotballskule '+escape(y)+'</p><h2>Gruppe '+Number(group)+'</h2><p>'+escape(day.date)+' · Krysseliste</p></div>';
    document.getElementById('mainMenu').innerHTML = '<button class="back-button" type="button" onclick="showChecklists()">← Vel anna gruppe</button>';
    document.getElementById('content').innerHTML = '<section class="welcome-box combined-checklist"><div class="combined-heading"><strong>Oppmøte · Gruppe '+Number(group)+'</strong><small>Før og etter lunsj på same liste</small></div>'+
      '<div class="combined-head"><span>Barn</span><span>☀️ Før <small id="combinedBeforeTag">Open</small></span><span>🌤️ Etter <small id="combinedAfterTag">Låst</small></span></div>'+
      '<div class="combined-rows">'+people.map(p => '<div class="combined-row"><strong>'+escape(p.name)+'</strong><label aria-label="Før lunsj: '+escape(p.name)+'"><input type="checkbox" class="combined-before" data-id="'+escape(p.id)+'" '+(before.get(p.id)?'checked':'')+' '+(archived?'disabled':'')+'></label><label aria-label="Etter lunsj: '+escape(p.name)+'"><input type="checkbox" class="combined-after" data-id="'+escape(p.id)+'" '+(after.get(p.id)?'checked':'')+' disabled></label></div>').join('')+'</div>'+
      '<div class="combined-foot"><strong id="combinedCount"></strong><span id="combinedAfterHint"></span></div><button id="combinedBeforeUnlock" class="combined-unlock" type="button" hidden>🔓 Lås opp før lunsj</button><button id="combinedCorrectionMode" class="combined-unlock" type="button">✏️ Rediger låst liste</button></section>';
    const host = document.querySelector('.combined-checklist');
    host.querySelector('#combinedBeforeUnlock').addEventListener('click', () => { beforeOverride = !beforeOverride; refreshLock(); });
    host.querySelector('#combinedCorrectionMode').addEventListener('click', () => { correctionMode = !correctionMode; refreshLock(); });
    const update = () => { const all=host.querySelectorAll('.combined-row').length;const b=host.querySelectorAll('.combined-before:checked').length;const a=host.querySelectorAll('.combined-after:checked').length; document.getElementById('combinedCount').textContent='Før: '+b+'/'+all+' · Etter: '+a+'/'+all; };
    host.addEventListener('change', async event => {
      const box=event.target;
      if (!box.matches('input[type=checkbox]')) return;
      const slot=box.classList.contains('combined-after')?'etter':'for';
      const current=box.checked;
      box.disabled=true;
      try {
        if (!correctionMode && slot==='for' && (day.date!==today() || (minutes(day.lunchTime)!==null && clock()>=minutes(day.lunchTime) && !beforeOverride))) throw Error('Før lunsj er låst');
        if (!correctionMode && slot==='etter' && (day.date!==today() || minutes(day.lunchTime)===null || clock()<minutes(day.lunchTime))) throw Error('Etter lunsj er ikkje open enno');
        await ref.collection('attendance').doc(sessionKey(slot)).collection('entries').doc(box.dataset.id).set({present:current,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:auth.currentUser.uid},{merge:true});
        update();
      } catch(err) {
        box.checked=!current;
        alert('Kunne ikkje lagre krysset. '+err.message);
      } finally {box.disabled=archived;refreshLock();}
    });
    update();refreshLock();
    if (refresh) clearInterval(refresh);
    refresh=setInterval(() => {if (!document.querySelector('.combined-checklist')) {clearInterval(refresh);refresh=null;active=null;return;}refreshLock();},15000);
  };
  window.showChecklistSession = async function(dayId, slot, group) { return window.showCombinedChecklist(dayId,group); };
  window.openSmartChecklist = async function(group) {
    const y=year(), d=today();
    const snap=await db.collection('years').doc(y).collection('days').get();
    const day=snap.docs.find(x => (x.data().date || x.id)===d);
    if (!day) return window.showSmartOtherLists(group);
    return window.showCombinedChecklist(day.id,group);
  };
  window.openManualSmartChecklist = async function(dayId,slot,group) {return window.showCombinedChecklist(dayId,group);};
  // The legacy group page displayed separate morning and afternoon cards.
  // Replace it for every role, including admin preview and historical dates.
  window.showChecklistGroup = async function(group) {
    const y=year();
    const snap=await db.collection('years').doc(y).collection('days').get();
    const days=snap.docs.map(doc=>({id:doc.id,...doc.data()}))
      .filter(d=>!/^(20\d{2})-09-/.test(String(d.date||d.id)))
      .sort((a,b)=>String(a.date||a.id).localeCompare(String(b.date||b.id)));
    const chosen = days.find(d=>String(d.date||d.id)===today()) || (days.length===1 ? days[0] : null);
    if (chosen) return window.showCombinedChecklist(chosen.id,group);
    document.getElementById('pageIntro').innerHTML='<div class="hero-card"><p class="hero-kicker">Fotballskule '+escape(y)+'</p><h2>Krysseliste · Gruppe '+Number(group)+'</h2><p>Vel dag. Før og etter lunsj ligg på same liste.</p></div>';
    document.getElementById('mainMenu').innerHTML='<button class="back-button" type="button" onclick="showChecklists()">← Krysselister</button>';
    document.getElementById('content').innerHTML='<div class="welcome-box"><div class="combined-day-grid">'+
      (days.length ? days.map(d=>'<button type="button" class="combined-day-button" data-day="'+escape(d.id)+'"><strong>📅 '+escape(d.date||d.title||d.id)+'</strong><small>Opne samla krysseliste →</small></button>').join('') : '<p>Ingen programdagar er registrerte.</p>')+
      '</div></div>';
    document.querySelectorAll('.combined-day-button').forEach(button=>button.addEventListener('click',()=>window.showCombinedChecklist(button.dataset.day,group)));
  };
  const oldShowChecklists=window.showChecklists;
  window.showChecklists=async function() {
    const user=auth.currentUser;
    if (user) {
      const profile=await db.collection('users').doc(user.uid).get();
      if (profile.data()?.role==='instructor') {
        const y=year(), d=today(), ref=db.collection('years').doc(y);
        const days=await ref.collection('days').get();
        const day=days.docs.find(x=>(x.data().date||x.id)===d);
        if(day) {
          const plan=await ref.collection('instructorPlans').doc(day.id).get();
          const time=minutes(day.data().lunchTime);
          const slot=time!==null && clock()>=time?'etter':'for';
          let group=Number(plan.data()?.[slot]?.[user.uid]);
          if (!group) {
            const instructors=await ref.collection('instructors').get();
            const linked=instructors.docs.find(i=>i.data().linkedUid===user.uid);
            if(linked) group=Number(plan.data()?.[slot]?.[linked.id]);
          }
          if(group) return window.showCombinedChecklist(day.id,group);
        }
      }
    }
    return oldShowChecklists.apply(this,arguments);
  };
})();
