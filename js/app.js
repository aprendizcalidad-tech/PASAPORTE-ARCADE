import {connect} from './firebase.js';
import {appConfig} from '../firebase-config.js';
const $=id=>document.getElementById(id);
const demo=new URLSearchParams(location.search).get('demo')==='1';
let person=null,publication=null,coursesShown=5,badgesShown=5,sequence=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>s ? new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z')) : 'Sin fecha registrada';
function safeImage(s){return /^https:\/\/[^\s]+$/i.test(String(s)) || s==='assets/medal.svg' ? s : 'assets/medal.svg';}
function icon(title){const t=title.toLowerCase();return /emergencia|evacua/.test(t)?'🏃':/salud|pausa|bienestar/.test(t)?'♥':/riesgo|prevenci/.test(t)?'⚠':/epp|protecci/.test(t)?'🥽':/seguridad/.test(t)?'⛑':/tecnol|digital|sistema/.test(t)?'▥':'📘';}
function status(message,error=false){$('search-status').textContent=message;$('search-status').classList.toggle('error',error);}
function resetResults(){person=null;publication=null;$('person-name').textContent='Tu historia está por descubrir';$('person-id').textContent='Consulta tu número de cédula';$('header-id').textContent='—';$('player-level').textContent='Jugador Arcade';['completed-count','badge-count','progress-number'].forEach(id=>$(id).textContent='—');$('catalog-count').textContent='Tu aprendizaje';$('badge-total').textContent='Tus reconocimientos';$('level-name').textContent='Explorador';$('level-number').textContent='Un nuevo comienzo';$('progress-ring').style.setProperty('--progress',0);$('progress-ring').setAttribute('aria-valuenow','0');$('course-count').textContent='';$('updated-at').textContent='APRENDE. AVANZA. DEJA HUELLA.';$('course-grid').innerHTML='<div class="empty-card"><h3>Tu pasaporte te espera</h3><p>Ingresa tu cédula para consultar tus cursos e insignias.</p></div>';$('badge-grid').innerHTML='<div class="empty-badges"><img src="assets/medal.svg" alt=""><p>Aquí brillarán tus logros.</p></div>';$('more-courses').hidden=true;$('more-badges').hidden=true;}
function renderCourses(){
  $('course-count').textContent=person.courses.length+' completados';
  $('course-grid').innerHTML=person.courses.slice(0,coursesShown).map((c,i)=>`<button class="course-card" type="button" data-course="${i}" aria-label="Ver detalle de ${esc(c.title)}"><span class="course-icon" aria-hidden="true">${icon(c.title)}</span><span class="course-body"><h3>${esc(c.title)}</h3><span class="complete">⬟ Completado</span><span class="course-date">▣ ${esc(date(c.date))}<b>›</b></span></span></button>`).join('');
  $('more-courses').hidden=coursesShown>=person.courses.length;
  $('more-courses').textContent=`Ver más cursos (${person.courses.length-Math.min(coursesShown,person.courses.length)} restantes) →`;
}
function renderBadges(){
  $('badge-grid').innerHTML=person.badges.length?person.badges.slice(0,badgesShown).map((b,i)=>`<article class="badge-card" style="--i:${i%5}"><div class="badge-image"><img src="${esc(safeImage(b.image))}" alt="${esc(b.name)}" loading="lazy" referrerpolicy="no-referrer"></div><h3>${esc(b.name)}</h3><p>Aprendizaje que<br>deja huella</p><time datetime="${esc(b.date)}">▣ ${esc(date(b.date))}</time></article>`).join(''):'<div class="empty-badges"><img src="assets/medal.svg" alt=""><p>Tus cursos ya cuentan.<br><span>Aún no tienen insignias asociadas en el archivo.</span></p></div>';
  $('badge-grid').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.src='assets/medal.svg';img.alt+=' (imagen no disponible)';},{once:true}));
  $('more-badges').hidden=badgesShown>=person.badges.length;
}
function render(){
  const count=person.courses.length, pct=Math.min(100,Math.round(count/publication.courseCount*100));
  let level=appConfig.levelThresholds.filter(n=>count>=n).length;level=Math.max(1,level);
  $('person-name').textContent=person.name;$('person-id').textContent='Cédula: '+person.cedula;$('header-id').textContent=person.cedula;
  $('player-level').textContent='Jugador Arcade';$('completed-count').textContent=count;$('catalog-count').textContent='de '+publication.courseCount+' cursos';
  $('badge-count').textContent=person.badges.length;$('badge-total').textContent='de '+publication.badgeCount+' insignias';
  $('level-name').textContent=appConfig.levelNames[level-1];$('level-number').textContent='Nivel '+level;
  $('progress-ring').style.setProperty('--progress',pct);$('progress-ring').setAttribute('aria-valuenow',pct);$('progress-number').textContent=pct+'%';
  $('updated-at').textContent=publication.updatedAt?'ACTUALIZADO: '+date(publication.updatedAt.slice(0,10)):'VISTA DE DEMOSTRACIÓN';
  coursesShown=5;badgesShown=5;renderCourses();renderBadges();
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
$('search-form').addEventListener('submit',search);
$('clear-search').addEventListener('click',()=>{sequence++;$('cedula').value='';resetResults();status('Tu próxima aventura comienza con lo que aprendes.');$('search-button').disabled=false;$('search-button').querySelector('span').textContent='Consultar progreso';$('passport').classList.remove('loading');$('cedula').focus();});
$('more-courses').addEventListener('click',()=>{coursesShown+=10;renderCourses();});
$('more-badges').addEventListener('click',()=>{badgesShown+=10;renderBadges();});
$('help-button').addEventListener('click',()=>$('help-dialog').showModal());
document.querySelectorAll('.dialog-close').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
$('course-grid').addEventListener('click',e=>{const button=e.target.closest('[data-course]');if(!button||!person)return;const c=person.courses[Number(button.dataset.course)];$('course-details').innerHTML=`<h2>${esc(c.title)}</h2><span class="complete">✓ Completado · Aprobación 100 %</span><p style="margin-top:20px">Finalización: ${esc(date(c.date))}</p><p>Código de capacitación: ${esc(c.id)}</p><p>${c.image?'Este curso tiene una insignia asociada.':'El archivo no tiene una insignia asociada a este curso.'}</p>`;$('course-dialog').showModal();});
if(demo){$('demo-notice').hidden=false;loadDemo();status('Demostración con datos ficticios; no consulta Firebase.');}
