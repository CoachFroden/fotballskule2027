(() => {
'use strict';
const db=firebase.firestore(),auth=firebase.auth();
const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yr=()=>document.getElementById('currentYearLabel')?.textContent?.match(/20\d{2}/)?.[0]||'2027';
let cache=null;
async function verify(){const u=auth.currentUser;if(!u)throw Error('Logg inn fyrst');const p=await db.collection('users').doc(u.uid).get();if(p.data()?.role!=='admin')throw Error('Berre administrator kan endre instruktørplanen');return u;}
const ref=()=>db.collection('years').doc(yr());
async function fetchData(){
const [ds,ins,parts,accounts]=await Promise.all([ref().collection('days').get(),ref().collection('instructors').get(),ref().collection('participants').get(),db.collection('users').get()]);
const days=ds.docs.map(d=>({id:d.id,...d.data()})).filter(d=>!/^\d{4}-09-/.test(d.date||d.id)).sort((a,b)=>String(a.date||a.id).localeCompare(String(b.date||b.id)));
const instructors=ins.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'no'));
const groups=[...new Set(parts.docs.map(d=>Number(d.data().group)).filter(Boolean))].sort((a,b)=>a-b);
const users=accounts.docs.filter(d=>d.data().role==='instructor').map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'no'));
return {days,instructors,groups:groups.length?groups:[1,2,3,4,5],users};
}
function dateText(d){try{return new Intl.DateTimeFormat('nn-NO',{weekday:'long',day:'numeric',month:'long'}).format(new Date((d.date||d.id)+'T12:00:00'))}catch(_){return d.date||d.id}}
window.showInstructorScheduleAdmin=async function(){
try{await verify();cache=await fetchData();
document.getElementById('pageIntro').innerHTML='<div class="hero-card"><p class="hero-kicker">Fotballskule '+e(yr())+'</p><h2>Instruktørfordeling</h2><p>Plasser instruktørar før og etter lunsj. Kople dei til innlogginga for automatisk krysseliste.</p></div>';
document.getElementById('mainMenu').innerHTML='<button class="back-button" type="button" onclick="showAdmin()">← Administrasjon</button>';
document.getElementById('content').innerHTML='<div class="welcome-box instructor-admin"><label>Dag<select id="instructorAdminDay">'+cache.days.map(d=>'<option value="'+e(d.id)+'">'+e(dateText(d))+'</option>').join('')+'</select></label><div id="instructorAdminEditor"></div></div>';
document.getElementById('instructorAdminDay').addEventListener('change',ev=>window.renderInstructorAdminDay(ev.target.value));
if(cache.days.length)await window.renderInstructorAdminDay(cache.days[0].id);
else document.getElementById('instructorAdminEditor').textContent='Legg inn programdagar først.';
}catch(err){alert(err.message);}
};
window.renderInstructorAdminDay=async function(dayId){
const target=document.getElementById('instructorAdminEditor');if(!target||!cache)return;
target.textContent='Hentar fordeling…';
const doc=await ref().collection('instructorPlans').doc(dayId).get(),plan=doc.data()||{};
const {instructors,groups,users}=cache;
target.innerHTML='<p class="instructor-admin-hint">Endre gruppe i rullegardinane. Vel «Ikkje med» dersom instruktøren har fri. Begge øktene blir lagra samtidig.</p>'+
'<div class="instructor-admin-header"><span>Instruktør</span><span>☀️ Før</span><span>🌤️ Etter</span></div>'+
instructors.map(i=>'<div class="instructor-admin-row"><div><strong>'+e(i.name)+'</strong><label class="instructor-account-label">Innlogging<select data-link="'+e(i.id)+'"><option value="">Ikkje kopla</option>'+users.map(u=>'<option value="'+e(u.id)+'" '+(i.linkedUid===u.id?'selected':'')+'>'+e(u.name||u.email||u.id)+'</option>').join('')+'</select></label></div>'+
['for','etter'].map(slot=>'<select aria-label="'+(slot==='for'?'Før':'Etter')+' lunsj: '+e(i.name)+'" data-slot="'+slot+'" data-id="'+e(i.id)+'"><option value="">Ikkje med</option>'+groups.map(g=>'<option value="'+g+'" '+(Number(plan[slot]?.[i.id])===g?'selected':'')+'>Gr. '+g+'</option>').join('')+'</select>').join('')+'</div>').join('')+
'<div class="instructor-admin-actions"><button type="button" id="saveInstructorAssignments">💾 Lagre fordeling og koplingar</button><span id="instructorAdminStatus" role="status"></span></div>';
target.querySelector('#saveInstructorAssignments').addEventListener('click',()=>window.saveInstructorAdminDay(dayId));
};
window.saveInstructorAdminDay=async function(dayId){
const target=document.getElementById('instructorAdminEditor'),button=target.querySelector('#saveInstructorAssignments'),status=target.querySelector('#instructorAdminStatus');
button.disabled=true;status.textContent='Lagrar…';
try{
const u=await verify(),plan={for:{},etter:{}},links={};target.querySelectorAll('[data-slot]').forEach(s=>{if(s.value)plan[s.dataset.slot][s.dataset.id]=Number(s.value)});
target.querySelectorAll('[data-link]').forEach(s=>{links[s.dataset.link]=s.value});
const used=Object.values(links).filter(Boolean);if(new Set(used).size!==used.length)throw Error('Same innlogging kan ikkje koplast til fleire instruktørar.');
const writes=[ref().collection('instructorPlans').doc(dayId).set({...plan,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:u.uid},{merge:true})];
for(const i of cache.instructors){if((i.linkedUid||'')!==(links[i.id]||''))writes.push(ref().collection('instructors').doc(i.id).set({linkedUid:links[i.id]||'',updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:u.uid},{merge:true}));}
await Promise.all(writes);
cache.instructors.forEach(i=>{i.linkedUid=links[i.id]||''});
status.textContent='✓ Lagra. Instruktørane får automatisk riktig gruppe.';
}catch(err){status.textContent='Kunne ikkje lagre: '+err.message;}finally{button.disabled=false;}
};
})();
