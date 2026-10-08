import {connect} from './firebase.js';
import {appConfig} from '../firebase-config.js';
import {createRoute} from './progress.js?v=3';
const $=id=>document.getElementById(id);
const demo=new URLSearchParams(location.search).get('demo')==='1';
let person=null,publication=null,sequence=0,historyOpen=false,spread=0,flipAnimation=null,flipVersion=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>s ? new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z')) : 'Sin fecha registrada';
function safeImage(s){return /^https:\/\/[^\s]+$/i.test(String(s)) || s==='assets/medal.svg' ? s : 'assets/medal.svg';}
function icon(title){const t=title.toLowerCase();return /emergencia|evacua/.test(t)?'🏃':/salud|pausa|bienestar/.test(t)?'♥':/riesgo|prevenci/.test(t)?'⚠':/epp|protecci/.test(t)?'🥽':/seguridad/.test(t)?'⛑':/tecnol|digital|sistema/.test(t)?'▥':'📘';}
function status(message,error=false){$('search-status').textContent=message;$('search-status').classList.toggle('error',error);}
const ANIMALS=[['león',51,55],['elefante',128,55],['mono',208,55],['jirafa',286,55],['venado',51,134],['oso',128,134],['zorro',208,134],['koala',286,134],['panda',90,208],['pingüino',168,208],['búho',245,208]];
const PAGE_SIZE=6;
function randomAvatar(){
  const previous=$('animal-avatar').dataset.animal;
  let n=Math.floor(Math.random()*ANIMALS.length);
  if(String(n)===previous)n=(n+1)%ANIMALS.length;
  const [name,x,y]=ANIMALS[n];
  $('animal-avatar').dataset.animal=String(n);
  $('animal-avatar').style.backgroundPosition=`${(x-35)/(337-70)*100}% ${(y-35)/(280-70)*100}%`;
  $('animal-avatar').setAttribute('aria-label','Avatar de '+name);
}
function showSpread(open){
  historyOpen=open;
  document.querySelectorAll('[data-home]').forEach(page=>page.hidden=open);
  $('history-left').hidden=!open;$('history-right').hidden=!open;$('spread-controls').hidden=!open;
  $('passport').classList.toggle('history-open',open);
}
function cancelFlip(){flipVersion++;flipAnimation?.cancel();flipAnimation=null;document.querySelector('.turn-leaf')?.remove();$('passport').classList.remove('flipping');}
function resetResults(){
  cancelFlip();showSpread(false);person=null;publication=null;spread=0;
  $('person-name').textContent='Tu historia está por descubrir';$('person-id').textContent='Consulta tu número de cédula';$('header-id').textContent='—';$('player-level').textContent='Jugador Arcade';
  ['completed-count','badge-count'].forEach(id=>$(id).textContent='—');$('level-name').textContent='Explorador';$('level-number').textContent='Un nuevo comienzo';$('course-count').textContent='';$('updated-at').textContent='APRENDE. AVANZA. DEJA HUELLA.';
  $('course-grid').innerHTML='<div class="empty-card"><h3>Tu pasaporte te espera</h3><p>Ingresa tu cédula para consultar tus cursos e insignias.</p></div>';
  $('badge-grid').innerHTML='<div class="empty-badges"><img src="assets/medal.svg" alt=""><p>Aquí brillarán tus logros.</p></div>';$('more-history').hidden=true;
  $('history-courses').replaceChildren();$('history-badges').replaceChildren();route.refresh();
}
function courseMarkup(c,i){return `<button class="course-card" type="button" data-course="${i}" aria-label="Ver detalle de ${esc(c.title)}"><span class="course-icon" aria-hidden="true">${icon(c.title)}</span><span class="course-body"><h3>${esc(c.title)}</h3><span class="complete">⬟ Completado</span><span class="course-date">▣ ${esc(date(c.date))}<b>›</b></span></span></button>`;}
function badgeMarkup(b,i){return `<article class="badge-card" style="--i:${i%6}"><div class="badge-image"><img src="${esc(safeImage(b.image))}" alt="${esc(b.name)}" loading="lazy" referrerpolicy="no-referrer"></div><h3>${esc(b.name)}</h3><p>Aprendizaje que deja huella</p><time datetime="${esc(b.date)}">▣ ${esc(date(b.date))}</time></article>`;}
function renderBadgesInto(target,badges,emptyMessage){
  target.innerHTML=badges.length?badges.map(badgeMarkup).join(''):`<div class="empty-badges"><img src="assets/medal.svg" alt=""><p>${emptyMessage}</p></div>`;
  target.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.src='assets/medal.svg';img.alt+=' (imagen no disponible)';},{once:true}));
}
function totalSpreads(){return Math.max(1,Math.ceil(Math.max(person.courses.length,person.badges.length)/PAGE_SIZE));}
function renderHistory(){
  const start=spread*PAGE_SIZE;
  $('history-person').textContent=person.name;
  $('history-courses').innerHTML=person.courses.slice(start,start+PAGE_SIZE).map((c,i)=>courseMarkup(c,start+i)).join('')||'<div class="empty-card"><h3>Ya recorriste todos tus cursos</h3><p>Puedes volver a las hojas anteriores para verlos de nuevo.</p></div>';
  renderBadgesInto($('history-badges'),person.badges.slice(start,start+PAGE_SIZE),person.badges.length?'Ya recorriste todas tus insignias.': 'Aún no hay insignias asociadas en el archivo.');
  $('history-left-number').textContent=String(3+spread*2).padStart(2,'0');$('history-right-number').textContent=String(4+spread*2).padStart(2,'0');
  $('spread-position').textContent=`Hojas ${3+spread*2}–${4+spread*2} · ${spread+1} / ${totalSpreads()}`;
  $('previous-spread').disabled=spread===0;$('next-spread').disabled=spread>=totalSpreads()-1;
}
async function turnTo(open,index=0){
  if(!person||$('passport').classList.contains('flipping'))return;
  $('passport').classList.remove('turning');
  const forward=open&&(!historyOpen||index>spread);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const version=++flipVersion;
  const source=historyOpen?$(forward?'history-right':'history-left'):document.querySelector('[data-home].right-page');
  let leaf;
  if(!reduced){
    leaf=document.createElement('div');leaf.className='turn-leaf '+(forward?'forward':'backward');leaf.setAttribute('aria-hidden','true');leaf.inert=true;
    const face=source.cloneNode(true);face.hidden=false;face.className+=' leaf-front';
    face.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));face.removeAttribute('id');
    const back=document.createElement('div');back.className='page leaf-back';back.innerHTML='<img src="assets/sello-jer.jpeg" alt=""><span>Tu historia sigue creciendo</span>';
    leaf.append(face,back);$('passport').append(leaf);$('passport').classList.add('flipping');
  }
  spread=index;if(open)renderHistory();showSpread(open);
  if(leaf){
    flipAnimation=leaf.animate([{transform:'rotateY(0deg)',filter:'brightness(1)'},{transform:`rotateY(${forward?-80:80}deg)`,filter:'brightness(.83)',offset:.45},{transform:`rotateY(${forward?-180:180}deg)`,filter:'brightness(1)'}],{duration:1050,easing:'cubic-bezier(.35,.05,.2,1)',fill:'forwards'});
    try{await flipAnimation.finished;}catch{ return; }
    if(version!==flipVersion)return;
    leaf.remove();flipAnimation=null;$('passport').classList.remove('flipping');
  }
  if(open)$('history-title').focus({preventScroll:true});else $('more-history').focus({preventScroll:true});
  if(open)$('passport').scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});
}
function render(){
  const count=person.courses.length;
  let level=appConfig.levelThresholds.filter(n=>count>=n).length;level=Math.max(1,level);
  showSpread(false);randomAvatar();
  $('person-name').textContent=person.name;$('person-id').textContent='Cédula: '+person.cedula;$('header-id').textContent=person.cedula;
  $('player-level').textContent='Jugador Arcade';$('completed-count').textContent=count;$('badge-count').textContent=person.badges.length;
  $('level-name').textContent=count>=600?'Leyenda Arcade':count>=75?'Maestro Arcade':appConfig.levelNames[level-1];$('level-number').textContent='Nivel '+level;
  $('updated-at').textContent=publication.updatedAt?'ACTUALIZADO: '+date(publication.updatedAt.slice(0,10)):'VISTA DE DEMOSTRACIÓN';
  $('course-count').textContent=count+' completados';
  $('course-grid').innerHTML=person.courses.slice(0,5).map(courseMarkup).join('');
  renderBadgesInto($('badge-grid'),person.badges.slice(0,3),'Aún no hay insignias asociadas en el archivo.');
  $('more-history').hidden=false;route.refresh();
  $('passport').classList.remove('turning');void $('passport').offsetWidth;$('passport').classList.add('turning');
}
async function search(event){
  event.preventDefault();const cedula=$('cedula').value.trim();
  if(!/^\d{1,20}$/.test(cedula)){status('Escribe tu cédula sin puntos ni espacios.',true);return;}
  const request=++sequence;$('search-button').disabled=true;$('search-button').querySelector('span').textContent='Consultando…';$('passport').classList.add('loading');resetResults();status('Buscando tu historia de aprendizaje…');
  try{
    if(demo){
      if(cedula!=='1234567890')throw new Error('En la demostración usa la cédula ficticia 1234567890.');
      loadDemo();status('Demostración con datos ficticios.');return;
    }
    const {db,storeApi:f}=await connect();
    const config=await f.getDocFromServer(f.doc(db,'public','config'));
    if(!config.exists())throw new Error('Todavía no se han importado datos. Contacta al administrador.');
    const current=config.data();
    const record=await f.getDocFromServer(f.doc(db,'releases',current.activeRelease,'people',cedula));
    if(request!==sequence)return;
    if(!record.exists())throw new Error('No encontramos cursos aprobados para esta cédula. Verifica el número o contacta al equipo de formación.');
    person=JSON.parse(record.data().payload);publication=current;render();status('Pasaporte encontrado. Estos son tus cursos aprobados e insignias.');
  }catch(error){if(request===sequence)status(error.code==='permission-denied'?'La publicación cambió o las reglas impiden consultar. Intenta otra vez; si continúa, contacta al administrador.':error.message,true);}
  finally{if(request===sequence){$('search-button').disabled=false;$('search-button').querySelector('span').textContent='Consultar progreso';$('passport').classList.remove('loading');}}
}
function loadDemo(){
  const titles=['Seguridad y Salud en el Trabajo','Uso de EPP','Prevención de Riesgos','Evacuación y Emergencias','Pausas Activas'];
  person={name:'Alex Martínez',cedula:'1234567890',courses:titles.map((title,i)=>({id:String(i+1),title,date:'2026-02-'+String(10+i*3).padStart(2,'0'),approval:100,image:'assets/medal.svg'})),badges:['Explorador','Prevención Pro','Guardián SST','Misión Completa','Nivel Experto'].map((name,i)=>({name,image:'assets/medal.svg',date:'2026-02-'+String(10+i*3).padStart(2,'0')}))};
  publication={courseCount:5,badgeCount:5};render();$('cedula').value='1234567890';
}
const route=createRoute({getPerson:()=>person,getPublication:()=>publication,getLevel:()=>$('level-name').textContent,getAvatar:()=>$('animal-avatar'),openHistory:()=>{cancelFlip();showSpread(false);turnTo(true,0);}});
$('search-form').addEventListener('submit',search);
$('clear-search').addEventListener('click',()=>{sequence++;$('cedula').value='';resetResults();status('Tu próxima aventura comienza con lo que aprendes.');$('search-button').disabled=false;$('search-button').querySelector('span').textContent='Consultar progreso';$('passport').classList.remove('loading');$('cedula').focus();});
$('more-history').addEventListener('click',()=>turnTo(true,0));
$('back-summary').addEventListener('click',()=>turnTo(false));
$('previous-spread').addEventListener('click',()=>{if(spread>0)turnTo(true,spread-1);});
$('next-spread').addEventListener('click',()=>{if(person&&spread<totalSpreads()-1)turnTo(true,spread+1);});
document.addEventListener('keydown',e=>{
  if(!historyOpen||document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(e.key==='ArrowRight'&&spread<totalSpreads()-1){e.preventDefault();turnTo(true,spread+1);}
  if(e.key==='ArrowLeft'&&spread>0){e.preventDefault();turnTo(true,spread-1);}
  if(e.key==='Escape'){e.preventDefault();turnTo(false);}
});
document.querySelectorAll('.topbar nav a').forEach(link=>link.addEventListener('click',()=>{if(historyOpen){cancelFlip();showSpread(false);}}));
$('help-button').addEventListener('click',()=>$('help-dialog').showModal());
document.querySelectorAll('.dialog-close').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.addEventListener('click',e=>{const button=e.target.closest('[data-course]');if(!button||!person)return;const c=person.courses[Number(button.dataset.course)];$('course-details').innerHTML=`<h2>${esc(c.title)}</h2><span class="complete">✓ Completado · Aprobación 100 %</span><p style="margin-top:20px">Finalización: ${esc(date(c.date))}</p><p>Código de capacitación: ${esc(c.id)}</p><p>${c.image?'Este curso tiene una insignia asociada.':'El archivo no tiene una insignia asociada a este curso.'}</p>`;$('course-dialog').showModal();});
randomAvatar();route.refresh();
if(demo){$('demo-notice').hidden=false;loadDemo();status('Demostración con datos ficticios; no consulta Firebase.');}
