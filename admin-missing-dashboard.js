(() => {
  'use strict';
  const db=firebase.firestore(),auth=firebase.auth();
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const year=()=>document.getElementById('currentYearLabel')?.textContent?.match(/20\d{2}/)?.[0]||'2027';
  const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
  const minute=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v||'')?Number(v.slice(0,2))*60+Number(v.slice(3)):null;
  let selectedDay=null;
  async function admin(){const u=auth.currentUser;if(!u)throw Error('Du må logge inn');const p=await db.collection('users').doc(u.uid).get();if(p.data()?.role!=='admin')throw Error('Berre administrator har tilgang');return u;}
  async function load(dayId) {
    const y=year(),ref=db.collection('years').doc(y),root=document.getElementById('adminMissingDashboard');
    if(!root)return;
    root.innerHTML='<p>Hentar oppmøte…</p>';
    try {
      await admin();
      const [daysSnap,peopleSnap,privSnap,arrivalsSnap]=await Promise.all([ref.collection('days').get(),ref.collection('participants').get(),ref.collection('participantPrivate').get(),ref.collection('arrivalRegistration').where('registered','==',true).get()]);
      const days=daysSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.date||a.id).localeCompare(String(b.date||b.id)));
      const day=days.find(d=>d.id===dayId)||days.find(d=>(d.date||d.id)===today())||days[days.length-1];
      if(!day){root.innerHTML='<p>Ingen programdagar er registrerte.</p>';return;}
      selectedDay=day.id;
      const firstDay=days[0]?.id===day.id;
      const arrived=new Set(arrivalsSnap.docs.map(d=>d.id));
      const people=peopleSnap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>Number(p.group)>0);
      const priv=new Map(privSnap.docs.map(d=>[d.id,d.data()]));
      const groups=[...new Set(people.map(p=>Number(p.group)))].sort((a,b)=>a-b);
      const docs=await Promise.all(groups.flatMap(g=>['for','etter'].map(slot=>ref.collection('attendance').doc(day.id+'_'+slot+'_g'+g).collection('entries').get())));
      const now=new Date(),cut=minute(day.lunchTime),isToday=(day.date||day.id)===today();
      const afterActive=isToday&&cut!==null&&(now.getHours()*60+now.getMinutes())>=cut;
      const beforeActive=isToday&&(cut===null||!afterActive);
      const historical=(day.date||day.id)<today();
      const slotActive={for:beforeActive||afterActive||historical,etter:afterActive||historical};
      let missingTotal=0,sections='';
      for(let gi=0;gi<groups.length;gi++){
        const group=groups[gi],members=people.filter(p=>Number(p.group)===group);
        const maps={for:new Map(docs[gi*2].docs.map(d=>[d.id,d.data().present])),etter:new Map(docs[gi*2+1].docs.map(d=>[d.id,d.data().present]))};
        const missing=members.filter(p=>(firstDay&&!arrived.has(p.id))||['for','etter'].some(slot=>slotActive[slot]&&maps[slot].get(p.id)!==true));
        missingTotal+=missing.length;
        if(missing.length){
          sections+='<section class="missing-group"><h3>Gruppe '+group+' <span>'+missing.length+' meldt manglande</span></h3>'+
            missing.map(p=>{const unregistered=firstDay&&!arrived.has(p.id);const slots=['for','etter'].filter(slot=>slotActive[slot]&&maps[slot].get(p.id)!==true);return '<div class="missing-person '+(unregistered?'missing-unregistered':'')+'"><strong>'+esc(p.name)+'</strong><small>'+(unregistered?'⚠ Ikkje registrert ved ankomst · Må registrerast først':slots.map(slot=>slot==='for'?'Før lunsj':'Etter lunsj').join(' og '))+'</small>'+(unregistered?'':'<button type="button" data-mark="'+esc(p.id)+'" data-group="'+group+'" data-slots="'+slots.join(',')+'" data-name="'+esc(p.name)+'">✓ Marker møtt</button>')+'</div>';}).join('')+'</section>';
        }

      }
      const label=day.date||day.id;
      root.innerHTML='<div class="missing-summary '+(missingTotal?'has-missing':'')+'"><strong>'+missingTotal+' barn som manglar oppmøte</strong><span>'+esc(label)+'</span></div>'+
        (sections?'<div class="missing-groups">'+sections+'</div>':'');
      // Set readable colours directly on these generated elements; older theme rules
      // otherwise override the page-specific stylesheet on mobile.
      const paint=(selector,properties)=>root.querySelectorAll(selector).forEach(el=>{
        Object.entries(properties).forEach(([property,value])=>el.style.setProperty(property,value,'important'));
      });
      paint('.missing-summary, .missing-group',{'background-color':'#f2f7fd','color':'#122f50','border-color':'#c7d9eb'});
      paint('.missing-summary strong, .missing-group h3, .missing-group p, .missing-person, .missing-person strong, .missing-person small',{'color':'#122f50','opacity':'1'});
      paint('.missing-summary span, .missing-group h3 span',{'color':'#395a78','opacity':'1'});
      paint('.missing-status',{'background-color':'#16416c','color':'#ffffff','border-color':'#52799e'});
      paint('.missing-status span',{'color':'#ffffff','opacity':'1'});
      paint('.missing-summary.has-missing',{'background-color':'#fff0ed','border-color':'#cf968c'});
      paint('.missing-person.missing-unregistered',{'background-color':'#ffe1e1','border':'2px solid #d32f2f','border-radius':'10px','padding':'12px','margin':'7px 0'});
      paint('.missing-person.missing-unregistered strong, .missing-person.missing-unregistered small',{'color':'#8c1717'});
      async function markPresent(id,group,slots,button){
        button.disabled=true;
        try{
          const u=await admin();
          const arrival=await ref.collection('arrivalRegistration').doc(id).get();
          if(arrival.data()?.registered!==true){
            alert('Barnet må registrerast ved ankomst først.');
            await load(day.id);return;
          }
          if(!slots.length||slots.some(slot=>!['for','etter'].includes(slot)||!slotActive[slot]))throw Error('Ugyldig økt.');
          const batch=db.batch();
          slots.forEach(slot=>{
            const entry=ref.collection('attendance').doc(day.id+'_'+slot+'_g'+group).collection('entries').doc(id);
            batch.set(entry,{present:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:u.uid},{merge:true});
          });
          await batch.commit();
          await load(day.id);
        }catch(e){alert('Kunne ikkje lagre: '+e.message);button.disabled=false;}
      }
      root.querySelectorAll('[data-mark]').forEach(button=>button.addEventListener('click',()=>{
        const id=button.dataset.mark,group=button.dataset.group;
        const slots=(button.dataset.slots||'').split(',').filter(Boolean);
        if(slots.length===1){void markPresent(id,group,slots,button);return;}
        const name=button.dataset.name||'deltakaren';
        const existing=root.querySelector('.missing-choice');if(existing)existing.remove();
        const dialog=document.createElement('div');
        dialog.className='missing-choice';
        dialog.setAttribute('role','dialog');
        dialog.setAttribute('aria-label','Vel oppmøte for '+name);
        dialog.innerHTML='<div class="missing-choice-card"><strong>Marker oppmøte</strong><p>'+esc(name)+'</p><small>Vel når barnet var til stades:</small><div class="missing-choice-options"><button type="button" data-choice="for">Før lunsj</button><button type="button" data-choice="etter">Etter lunsj</button><button type="button" data-choice="begge">Begge økter</button></div><button type="button" class="missing-choice-cancel">Avbryt</button></div>';
        root.appendChild(dialog);
        const close=()=>dialog.remove();
        dialog.querySelector('.missing-choice-cancel').addEventListener('click',close);
        dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
        dialog.querySelectorAll('[data-choice]').forEach(choice=>choice.addEventListener('click',()=>{
          const selected=choice.dataset.choice==='begge'?['for','etter']:[choice.dataset.choice];
          close();
          void markPresent(id,group,selected,button);
        }));
        dialog.querySelector('[data-choice]').focus();
      }));

    }catch(e){root.innerHTML='<p role="alert">'+esc(e.message)+'</p>';}
  }
  window.showSimpleMissingAdmin=async function(){
    const y=year();
    try{await admin();}catch(e){alert(e.message);return;}
    document.getElementById('pageIntro').innerHTML='';
    document.getElementById('mainMenu').innerHTML='';
    document.getElementById('content').innerHTML='<section class="welcome-box admin-missing"><header class="missing-page-heading"><h2>🚨 Manglande oppmøte</h2><p>Oversikt før og etter lunsj</p></header><div class="missing-toolbar"><label>Vel dag <select id="missingDaySelect"></select></label><button type="button" id="missingReload">↻ Oppdater</button></div><div id="adminMissingDashboard"></div></section>';
    // The global welcome-box theme uses high-specificity dark heading colours.
    // Explicitly enforce contrast on this page's title and subtitle.
    const heading=document.querySelector('.admin-missing .missing-page-heading');
    if(heading){
      heading.style.setProperty('background','transparent','important');
      const title=heading.querySelector('h2'),subtitle=heading.querySelector('p');
      if(title){title.style.setProperty('color','#ffffff','important');title.style.setProperty('opacity','1','important');title.style.setProperty('text-shadow','none','important');}
      if(subtitle){subtitle.style.setProperty('color','#e1efff','important');subtitle.style.setProperty('opacity','1','important');subtitle.style.setProperty('text-shadow','none','important');}
    }
    const snap=await db.collection('years').doc(y).collection('days').get();
    const days=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.date||a.id).localeCompare(String(b.date||b.id)));
    const chosen=days.find(d=>(d.date||d.id)===today())||days[days.length-1];
    const select=document.getElementById('missingDaySelect');if(!select)return;
    select.innerHTML=days.map(d=>'<option value="'+esc(d.id)+'" '+(d.id===chosen?.id?'selected':'')+'>'+esc(d.date||d.id)+'</option>').join('');
    select.addEventListener('change',()=>load(select.value));
    document.getElementById('missingReload').addEventListener('click',()=>load(select.value));
    if(chosen)await load(chosen.id);
  };
})();