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
      const [daysSnap,peopleSnap,privSnap]=await Promise.all([ref.collection('days').get(),ref.collection('participants').get(),ref.collection('participantPrivate').get()]);
      const days=daysSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.date||a.id).localeCompare(String(b.date||b.id)));
      const day=days.find(d=>d.id===dayId)||days.find(d=>(d.date||d.id)===today())||days[days.length-1];
      if(!day){root.innerHTML='<p>Ingen programdagar er registrerte.</p>';return;}
      selectedDay=day.id;
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
        const missing=members.filter(p=>['for','etter'].some(slot=>slotActive[slot]&&maps[slot].get(p.id)===false));
        const unchecked=members.filter(p=>['for','etter'].some(slot=>slotActive[slot]&&!maps[slot].has(p.id)));
        missingTotal+=missing.length;
        sections+='<section class="missing-group"><h3>Gruppe '+group+' <span>'+missing.length+' meldt manglande</span></h3>'+
          (missing.length?missing.map(p=>'<div class="missing-person"><strong>'+esc(p.name)+'</strong><small>'+['for','etter'].filter(slot=>maps[slot].get(p.id)===false).map(slot=>slot==='for'?'Før lunsj':'Etter lunsj').join(' og ')+'</small><button type="button" data-mark="'+esc(p.id)+'" data-group="'+group+'">✓ Marker møtt</button></div>').join(''):'<p>Ingen registrerte fråvær.</p>')+
          (unchecked.length?'<div class="missing-unchecked"><strong>⚠️ '+unchecked.length+' barn ikkje ferdig registrerte</strong>'+unchecked.map(p=>'<p>'+esc(p.name)+'</p>').join('')+'</div>':'')+'</section>';
      }
      const label=day.date||day.id;
      root.innerHTML='<div class="missing-summary '+(missingTotal?'has-missing':'')+'"><strong>'+missingTotal+' barn registrerte som manglande</strong><span>'+esc(label)+'</span></div>'+
        '<div class="missing-groups">'+sections+'</div>';
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
      paint('.missing-unchecked',{'background-color':'#fff0d5','color':'#593708','border-color':'#d2a15c'});
      paint('.missing-unchecked strong, .missing-unchecked p',{'color':'#593708','opacity':'1'});
      paint('.missing-summary.has-missing',{'background-color':'#fff0ed','border-color':'#cf968c'});
      root.querySelectorAll('[data-mark]').forEach(button=>button.addEventListener('click',async()=>{
        const id=button.dataset.mark,group=button.dataset.group;
        const slot=docs[groups.indexOf(Number(group))*2].docs.find(d=>d.id===id&&d.data().present===false)?'for':'etter';
        button.disabled=true;
        try{const u=await admin();await ref.collection('attendance').doc(day.id+'_'+slot+'_g'+group).collection('entries').doc(id).set({present:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:u.uid},{merge:true});await load(day.id);}catch(e){alert('Kunne ikkje lagre: '+e.message);button.disabled=false;}
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