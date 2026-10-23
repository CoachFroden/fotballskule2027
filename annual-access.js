(() => {
 const db=firebase.firestore(),auth=firebase.auth(),ts=firebase.firestore.FieldValue.serverTimestamp;
 const el=id=>document.getElementById(id);
 const safe=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const screen=html=>{el('mainMenu').innerHTML='';el('pageIntro').innerHTML='';el('content').innerHTML='<div class="staff-stage"><div class="staff-stadium"><div class="staff-kicker">SAMNANGER IL · FOTBALLSKULE</div><div class="staff-ball">⚽</div><div class="staff-stadium-title">Bli med på laget!</div><div class="staff-stadium-sub">Ny sesong. Nye moglegheiter.</div></div><div class="staff-panel">'+html+'</div></div>';};
 const currentYear=async()=>{const snap=await db.collection('years').get();return snap.docs.filter(d=>d.data().status==='active').map(d=>d.id).sort((a,b)=>Number(b)-Number(a))[0]||'2027';};
 window.staffAccessPending=async(user,requestedYear)=>{
   const year=requestedYear||await currentYear(),ref=db.collection('years').doc(year).collection('accessRequests').doc(user.uid);
   let data=null;try{const doc=await ref.get();data=doc.data()||null;}catch(e){console.error(e);}
   const pending=data?.status==='pending';
   screen('<div class="staff-eyebrow">FOTBALLSKULE '+safe(year)+'</div><h2>'+(pending?'Vent på godkjenning':'Søk om tilgang')+'</h2><p class="staff-email">E-post: <strong>'+safe(user.email)+'</strong></p>'+
   (pending?'<p>Søknaden for '+safe(year)+' er sendt. Administrator må godkjenne deg før du får tilgang.</p>':
   '<p class="staff-help">Du bruker same konto kvart år, men må godkjennast på nytt for kvar fotballskule.</p><form class="form-grid" onsubmit="staffAccessApply(event)"><input id="staffYear" type="hidden" value="'+safe(year)+'"><label>Namn<input id="staffName" required maxlength="120" value="'+safe(user.displayName||'')+'"></label><label>Ønskt rolle<select id="staffRole"><option value="instructor">Instruktør</option><option value="responsible">Ansvarleg</option></select></label><button class="menu-button compact">Send søknad →</button></form>')+
   '<div class="staff-foot"><span>🔒 Årleg godkjenning</span><button class="text-button" onclick="logout()">Logg ut</button></div>');
 };
 window.staffAccessApply=async event=>{
   event.preventDefault();const user=auth.currentUser,year=el('staffYear').value,name=el('staffName').value.trim(),role=el('staffRole').value;
   if(!user||!name||!['instructor','responsible'].includes(role)||!/^20\d\d$/.test(year))return;
   try{await db.collection('years').doc(year).collection('accessRequests').doc(user.uid).set({uid:user.uid,year,name,email:user.email||'',requestedRole:role,status:'pending',createdAt:ts()});await window.staffAccessPending(user,year);}
   catch(e){console.error(e);alert('Kunne ikkje sende søknaden: '+(e.code||''));}
 };
 window.staffAccessAdmin=async()=>{
   const user=auth.currentUser;if(!user)return;
   const profile=await db.collection('users').doc(user.uid).get();if(profile.data()?.role!=='admin')return;
   screen('<h2>Tilgangssøknader</h2><p>Hentar søknader…</p>');
   try{
     const years=await db.collection('years').get();
     const results=await Promise.all(years.docs.map(async y=>{const snap=await y.ref.collection('accessRequests').get();return snap.docs.filter(d=>d.data().status==='pending').map(d=>({year:y.id,uid:d.id,...d.data()}));}));
     const items=results.flat();
     screen('<h2>Tilgangssøknader ('+items.length+')</h2><p class="staff-help">Godkjenninga gjeld berre den valde årgangen.</p>'+
       (items.map(v=>'<div class="contact-card"><h3>'+safe(v.name)+'</h3><p>'+safe(v.email)+'</p><p>'+safe(v.year)+' · '+(v.requestedRole==='responsible'?'Ansvarleg':'Instruktør')+'</p><button class="menu-button compact" onclick="staffDecide('+JSON.stringify(v.year)+','+JSON.stringify(v.uid)+',true)">Godkjenn</button><button class="text-button" onclick="staffDecide('+JSON.stringify(v.year)+','+JSON.stringify(v.uid)+',false)">Avslå</button></div>').join('')||'<p>Ingen ventande søknader.</p>')+
       '<button class="text-button" onclick="staffMigrate2027()">Overfør tidlegare godkjende til 2027</button><button class="text-button" onclick="showAdmin()">Tilbake</button>');
   }catch(e){console.error(e);screen('<h2>Tilgangssøknader</h2><p>Kunne ikkje hente søknader.</p>');}
 };
 window.staffMigrate2027=async()=>{
   const user=auth.currentUser;if(!user)return;
   const profile=await db.collection('users').doc(user.uid).get();if(profile.data()?.role!=='admin')return;
   if(!confirm('Legg tidlegare godkjende instruktørar og ansvarlege til i 2027?'))return;
   try{
     const snap=await db.collection('accessRequests').get();let count=0;
     for(const doc of snap.docs){
       const v=doc.data();
       if(v.status!=='approved'||!['instructor','responsible'].includes(v.requestedRole))continue;
       const ref=db.collection('years').doc('2027').collection('staffAccess').doc(doc.id);
       if((await ref.get()).exists)continue;
       const batch=db.batch(),list=v.requestedRole==='instructor'?'instructors':'adults';
       batch.set(ref,{role:v.requestedRole,name:v.name||'',email:v.email||'',approvedBy:user.uid,approvedAt:ts(),migratedFromLegacy:true});
       batch.set(db.collection('years').doc('2027').collection(list).doc(doc.id),{name:v.name||'',email:v.email||'',...(list==='adults'?{role:'Ansvarleg'}:{})},{merge:true});
       await batch.commit();count++;
     }
     alert(count+' tidlegare godkjende overførte til 2027.');await window.staffAccessAdmin();
   }catch(e){console.error(e);alert('Overføring mislukkast: '+(e.code||''));}
 };
 window.staffDecide=async(year,uid,approve)=>{
   const user=auth.currentUser;if(!user||!/^20\d\d$/.test(year))return;
   try{
     const profile=await db.collection('users').doc(user.uid).get();
     if(profile.data()?.role!=='admin') throw new Error('Du har ikkje administratorrolle.');
     const ref=db.collection('years').doc(year).collection('accessRequests').doc(uid),snap=await ref.get(),data=snap.data();
     if(!data||data.status!=='pending'||!['instructor','responsible'].includes(data.requestedRole)) throw new Error('Søknaden er ikkje lenger ventande. Oppdater sida.');
     const batch=db.batch();
     if(approve){
       batch.set(db.collection('users').doc(uid),{name:data.name,email:data.email,role:data.requestedRole},{merge:true});
       batch.set(db.collection('years').doc(year).collection('staffAccess').doc(uid),{role:data.requestedRole,name:data.name,email:data.email,approvedBy:user.uid,approvedAt:ts()});
       const collection=data.requestedRole==='instructor'?'instructors':'adults';
       batch.set(db.collection('years').doc(year).collection(collection).doc(uid),{name:data.name,email:data.email,...(collection==='adults'?{role:'Ansvarleg'}:{})},{merge:true});
     }
     batch.update(ref,{status:approve?'approved':'rejected',decidedBy:user.uid,decidedAt:ts()});
     await batch.commit();await window.staffAccessAdmin();
   }catch(e){console.error(e);alert('Kunne ikkje behandle søknaden: '+(e.message||e.code||'ukjend feil'));}
 };
})();