(() => {
  'use strict';
  const db=firebase.firestore(), auth=firebase.auth();
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;','&quot;').replaceAll("'",'&#39;');
  const year=()=>document.getElementById('currentYearLabel')?.textContent?.match(/20\d{2}/)?.[0]||'2027';
  let stop=null;
  async function permitted(){
    const user=auth.currentUser;if(!user)throw Error('Du må logge inn.');
    const [profile,annual]=await Promise.all([db.collection('users').doc(user.uid).get(),db.collection('years').doc(year()).collection('staffAccess').doc(user.uid).get()]);
    if(profile.data()?.role!=='admin'&&annual.data()?.role!=='responsible')throw Error('Berre ansvarlege og administrator kan registrere barn.');
    return user;
  }
  window.showArrivalRegistration=async function(){
    const host=document.getElementById('content');if(!host)return;
    try{await permitted();}catch(e){alert(e.message);return;}
    if(stop){stop();stop=null;}
    document.getElementById('pageIntro').innerHTML='';
    document.getElementById('mainMenu').innerHTML='';
    host.innerHTML='<section class="welcome-box arrival-registration"><h2>🎒 Registrering ved ankomst</h2><p>Første dag · Kryss av når barnet har fått sekk med ball og T-skjorte.</p><div class="arrival-stats" id="arrivalStats">Hentar deltakarar…</div><div class="arrival-filters"><input id="arrivalSearch" type="search" placeholder="Søk etter namn…" aria-label="Søk etter namn"><select id="arrivalGroup" aria-label="Vel gruppe"><option value="">Alle grupper</option></select><select id="arrivalStatus" aria-label="Registreringsstatus"><option value="all">Alle</option><option value="pending">Ikkje registrerte</option><option value="done">Registrerte</option></select></div><div id="arrivalList"></div></section>';
    const ref=db.collection('years').doc(year()),root=host.querySelector('.arrival-registration');
    let people=[],registered=new Set(),busy=new Set();
    const list=root.querySelector('#arrivalList'),stats=root.querySelector('#arrivalStats');
    function render(){
      if(!root.isConnected)return;
      const q=root.querySelector('#arrivalSearch').value.trim().toLocaleLowerCase('no');
      const group=root.querySelector('#arrivalGroup').value,status=root.querySelector('#arrivalStatus').value;
      const filtered=people.filter(p=>(!group||String(p.group)===group)&&String(p.name||'').toLocaleLowerCase('no').includes(q)&&(status==='all'||(status==='done')===registered.has(p.id)));
      stats.textContent=registered.size+' av '+people.length+' registrerte · '+(people.length-registered.size)+' står att';
      list.innerHTML=filtered.length?filtered.map(p=>'<label class="arrival-person '+(registered.has(p.id)?'is-registered':'')+'"><span><strong>'+esc(p.name)+'</strong><small>Gruppe '+esc(p.group)+'</small></span><span class="arrival-check"><input type="checkbox" data-id="'+esc(p.id)+'" '+(registered.has(p.id)?'checked':'')+' '+(busy.has(p.id)?'disabled':'')+'> Registrert</span></label>').join(''):'<p>Ingen deltakarar funne.</p>';
    }
    try{
      const snap=await ref.collection('participants').get();
      people=snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>Number(p.group)>0).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'no'));
      const groups=[...new Set(people.map(p=>Number(p.group)))].sort((a,b)=>a-b);
      root.querySelector('#arrivalGroup').innerHTML='<option value="">Alle grupper</option>'+groups.map(g=>'<option value="'+g+'">Gruppe '+g+'</option>').join('');
      ['arrivalSearch','arrivalGroup','arrivalStatus'].forEach(id=>root.querySelector('#'+id).addEventListener(id==='arrivalSearch'?'input':'change',render));
      list.addEventListener('change',async e=>{
        const box=e.target;if(!box.matches('input[data-id]'))return;
        const id=box.dataset.id,checked=box.checked;box.disabled=true;busy.add(id);
        try{
          const user=await permitted(),doc=ref.collection('arrivalRegistration').doc(id);
          if(checked)await doc.set({registered:true,registeredAt:firebase.firestore.FieldValue.serverTimestamp(),registeredBy:user.uid},{merge:true});
          else if(confirm('Fjerne registreringa for dette barnet?'))await doc.delete();
          else {box.checked=true;return;}
        }catch(err){box.checked=!checked;alert('Kunne ikkje lagre: '+err.message);}
        finally{busy.delete(id);render();}
      });
      stop=ref.collection('arrivalRegistration').where('registered','==',true).onSnapshot(s=>{registered=new Set(s.docs.map(d=>d.id));render();},e=>{stats.textContent='Kunne ikkje hente registreringar: '+e.message;});
      render();
    }catch(e){list.textContent='Kunne ikkje hente deltakarar: '+e.message;}
  };
})();