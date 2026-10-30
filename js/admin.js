import {connect} from './firebase.js';
import {appConfig} from '../firebase-config.js';
import './course-import.js?v=1';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalogState=null,personState=null,managementBusy=false;
let stagedCourseCatalog=null;
let services,user=null,parsed=null,fingerprint='',currentJob=null,busy=false,worker=null,fileSequence=0,pollTimer=null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function message(text,error=false){$('admin-status').textContent=text;$('admin-status').classList.toggle('error',error);}
function controls(value){busy=value;['import-button','catalog-from-excel','drive-button','excel','cancel-job','logout'].forEach(id=>$(id).disabled=value);courseImportControls();}
async function api(action,data={},retry=true){
  if(!user)throw new Error('Inicia sesión de nuevo.');
  if(!/^https:\/\/script.google.com\/macros\/s\/[\w-]+\/exec$/.test(appConfig.gasUrl))throw new Error('Configura gasUrl con la URL /exec de Apps Script.');
  for(let attempt=0;attempt<(retry?3:1);attempt++){
    try{
      const token=await user.getIdToken();
      const response=await fetch(appConfig.gasUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,idToken:token,...data}),redirect:'follow',signal:AbortSignal.timeout(180000),credentials:'omit'});
      const raw=await response.text();
      let result;
      try{result=JSON.parse(raw);}catch{throw new Error('Apps Script no respondió con JSON. Comprueba acceso "Cualquier persona", URL /exec y la versión del despliegue.');}
      if(!result.ok){const error=new Error(result.error||'No se pudo completar la operación.');error.retryable=/BUSY|HTTP 429|HTTP 5\d\d/.test(error.message);throw error;}
      return result.data;
    }catch(error){
      const retryable=error.retryable||error.name==='TypeError'||error.name==='TimeoutError';
      if(!retryable||attempt===(retry?2:0))throw error;
      message('La conexión está tardando. Reintentando el mismo lote…');await sleep(1500*(attempt+1));
    }
  }
}
function displayStatus(state){
  currentJob=state.job;
  const pub=state.publication;
  $('published-people').textContent=pub?.people??'—';$('published-courses').textContent=pub?.courseCount??'—';$('published-date').textContent=pub?.updatedAt?new Date(pub.updatedAt).toLocaleString('es-CO'):'Sin publicaciones';
  const j=currentJob, labels={queued:'En cola: espera al activador de Apps Script',preparing:'Preparando el archivo de Drive',uploading:'Importación en curso',published:'Publicación completada',cancelled:'Importación cancelada',error:'Importación detenida'};
  $('job-state').textContent=j?`${labels[j.status]||j.status} · ${j.written||0} de ${j.summary?.people??'…'} personas${j.error?' · '+j.error:''}`:'Todavía no hay importaciones.';
  $('job-progress').value=j?.summary?.people?Math.round((j.written||0)/j.summary.people*100):0;
  $('cancel-job').hidden=!j||['published','cancelled'].includes(j.status);
  clearTimeout(pollTimer);
  if(j?.source==='drive'&&['queued','preparing','uploading'].includes(j.status))pollTimer=setTimeout(()=>refresh(false),15000);
}
async function refresh(notify=true){try{displayStatus(await api('status'));if(notify)message('Estado actualizado.');return true;}catch(e){message(e.message,true);return false;}}
async function login(e){e.preventDefault();$('login-submit').disabled=true;try{await services.authApi.signInWithEmailAndPassword(services.auth,$('email').value.trim(),$('password').value);}catch(error){message('No fue posible iniciar sesión. Revisa el correo, la contraseña y la configuración de Firebase. ('+(error.code||error.message)+')',true);}finally{$('login-submit').disabled=false;}}
$('login-form').addEventListener('submit',login);
$('logout').addEventListener('click',()=>services.authApi.signOut(services.auth));
$('reset-password').addEventListener('click',async()=>{try{const email=$('email').value.trim();if(!email)throw new Error('Escribe primero tu correo electrónico.');await services.authApi.sendPasswordResetEmail(services.auth,email);message('Si la cuenta existe, recibirás un correo para restablecer la contraseña.');}catch(e){message(e.message,true);}});
$('excel').addEventListener('change',async()=>{
  const request=++fileSequence;worker?.terminate();parsed=null;fingerprint='';$('preview').hidden=true;
  const file=$('excel').files[0];if(!file)return;
  if(!/\.xlsx$/i.test(file.name)||file.size>25*1024*1024){message('Selecciona un archivo .xlsx de hasta 25 MB.',true);return;}
  $('file-name').textContent=file.name+' · '+(file.size/1024/1024).toFixed(1)+' MB';message('Leyendo el Excel y consolidando personas. Puedes seguir usando la página…');
  try{
    const buffer=await file.arrayBuffer();fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(request!==fileSequence)return;
    const taskWorker=new Worker(new URL('./excel-worker.js',import.meta.url));worker=taskWorker;
    const result=await new Promise((resolve,reject)=>{taskWorker.onmessage=e=>resolve(e.data);taskWorker.onerror=()=>reject(new Error('No se pudo cargar el lector Excel. Verifica que assets/vendor/xlsx.full.min.js esté publicado.'));taskWorker.postMessage(buffer,[buffer]);});
    taskWorker.terminate();if(worker===taskWorker)worker=null;if(request!==fileSequence)return;if(!result.ok)throw new Error(result.error);
    parsed=result.data;const r=parsed.report,s=parsed.summary;
    $('import-summary').innerHTML=`<b>${s.people.toLocaleString('es-CO')}</b> personas · <b>${s.courseCount}</b> cursos de catálogo<br><b>${r.rows.toLocaleString('es-CO')}</b> filas · <b>${s.completed.toLocaleString('es-CO')}</b> cursos aprobados únicos por persona`;
    $('validation-report').innerHTML=`Duplicados consolidados: ${r.duplicates}<br>Filas sin aprobación 100 %: ${r.notApproved}<br>Filas inválidas: ${r.invalid}<br>Cursos aprobados sin imagen de insignia: ${r.missingBadge}<br>${r.warnings.map(esc).join('<br>')}`;
    $('preview').hidden=false;$('import-button').disabled=!!r.invalid||!s.people;
    message(r.invalid?'Corrige las filas inválidas antes de importar.':s.people?'Excel validado. Revisa el resumen y pulsa Importar y publicar.':'No hay cursos aprobados para importar.',!!r.invalid||!s.people);
  }catch(e){message(e.message,true);}
});
function savedImport(){try{return JSON.parse(localStorage.getItem('arcadeImport')||'null');}catch{return null;}}
$('import-button').addEventListener('click',async()=>{
  if(!parsed||busy||managementBusy||parsed.report.invalid)return;controls(true);
  try{
    const saved=savedImport();
    const session=saved?.fingerprint===fingerprint&&saved?.uid===user.uid?saved:{fingerprint,uid:user.uid,id:'web-'+crypto.randomUUID()};
    localStorage.setItem('arcadeImport',JSON.stringify(session));
    let job=await api('begin',{importId:session.id,summary:parsed.summary});
    if(job.status==='cancelled')throw new Error('La importación anterior fue cancelada. Vuelve a pulsar para crear una nueva.');
    while(job.status!=='published'&&job.next<job.chunks){
      message(`Importando lote ${job.next+1} de ${job.chunks}…`);
      job=await api('chunk',{importId:session.id,index:job.next,profiles:parsed.profiles.slice(job.written,job.written+50)});
      currentJob=job;$('job-state').textContent=`Importando: ${job.written} de ${job.summary.people} personas`;$('job-progress').value=job.written/job.summary.people*100;
    }
    await api('publish',{importId:session.id});localStorage.removeItem('arcadeImport');await refresh(false);message('¡Publicación completa! Los pasaportes ya muestran los datos actualizados.');
  }catch(e){if(/cancelada/.test(e.message))localStorage.removeItem('arcadeImport');message(e.message+' Si la carga se interrumpió, selecciona el mismo archivo y pulsa Importar y publicar para reanudar.',true);}
  finally{controls(false);}
});
$('drive-button').addEventListener('click',async()=>{if(managementBusy)return;controls(true);try{await api('drive',{},false);await refresh(false);message('Sincronización en cola. El activador continuará en segundo plano; puedes cerrar esta página.');}catch(e){message(e.message,true);}finally{controls(false);}});
$('refresh-status').addEventListener('click',()=>refresh());
$('cancel-job').addEventListener('click',async()=>{if(!currentJob||!confirm('¿Cancelar la importación pendiente? El pasaporte publicado actualmente se conserva.'))return;controls(true);try{await api('cancel',{importId:currentJob.id});localStorage.removeItem('arcadeImport');await refresh(false);message('Importación cancelada.');}catch(e){message(e.message,true);}finally{controls(false);}});
initManagement();
try{
  services=await connect();await services.authApi.setPersistence(services.auth,services.authApi.browserSessionPersistence);
  services.authApi.onAuthStateChanged(services.auth,async account=>{
    user=null;resetManagement();$('dashboard').hidden=true;$('login-view').hidden=false;clearTimeout(pollTimer);
    if(!account){message('Ingresa con una cuenta administradora.');return;}
    try{
      const role=await services.storeApi.getDocFromServer(services.storeApi.doc(services.db,'admins',account.uid));
      if(!role.exists()||role.data().enabled!==true)throw new Error('Esta cuenta no está autorizada. Crea su documento admins/UID con enabled: true en Firestore.');
      user=account;$('password').value='';$('admin-email').textContent=account.email;$('login-view').hidden=true;$('dashboard').hidden=false;if(await refresh(false))message('Sesión de administrador activa.');
    }catch(e){message(e.message,true);}
  });
}catch(e){message(e.message,true);$('login-submit').disabled=true;$('reset-password').disabled=true;}


function resetManagement(){catalogState=null;personState=null;stagedCourseCatalog=null;$('course-catalog-file').value='';$('course-catalog-preview').hidden=true;courseImportControls();$('person-form').hidden=true;$('course-fields').disabled=true;$('catalog-list').replaceChildren();$('course-form').reset();$('course-id').readOnly=false;$('person-form').reset();$('badge-preview').hidden=true;$('catalog-status').textContent='';}
async function manage(task){
  if(managementBusy||busy||!user)return;
  managementBusy=true;
  courseImportControls();
  const uid=user.uid;
  document.querySelectorAll('.management-card button').forEach(b=>b.disabled=true);
  try{await task(()=>user?.uid===uid);}catch(e){message(e.message,true);}
  finally{managementBusy=false;document.querySelectorAll('.management-card button').forEach(b=>b.disabled=false);courseImportControls();}
}
function courseImportControls(){
  $('course-catalog-file').disabled=busy||managementBusy;
  $('apply-course-catalog').disabled=busy||managementBusy||!stagedCourseCatalog;
}
async function readCourseCatalog(file){
  if(!/\.xlsx$/i.test(file.name)||file.size>25*1024*1024)throw new Error('Selecciona un Excel .xlsx de hasta 25 MB.');
  const buffer=await file.arrayBuffer(),task=new Worker(new URL('./excel-worker.js?v=8',import.meta.url));
  try{return await new Promise((resolve,reject)=>{
    task.onmessage=e=>e.data.ok?resolve(e.data.courses):reject(new Error(e.data.error));
    task.onerror=()=>reject(new Error('No se pudo leer el catálogo. Revisa que el lector Excel esté publicado.'));
    task.postMessage({mode:'courses',buffer},[buffer]);
  });}finally{task.terminate();}
}
function renderCourseCatalogPreview(courses,catalog){
  const {counts,rows}=PassportCourseImport.preview(courses,catalog.courses);
  $('course-catalog-summary').textContent=`${counts.total} cursos · ${counts.active} activos · ${counts.inactive} inactivos. Cambios: ${counts.added} nuevos · ${counts.renamed} nombres · ${counts.archived} pasan a inactivo · ${counts.activated} pasan a activo · ${counts.unchanged} sin cambios.`;
  $('course-catalog-rows').innerHTML=rows.map(c=>`<tr><td>${esc(c.id)}</td><td>${esc(c.previousTitle||'—')}</td><td>${esc(c.title)}</td><td>${c.active?'Activo':'Inactivo'}</td><td>${esc(c.changes)}</td></tr>`).join('');
  $('course-catalog-preview').hidden=false;
}
function renderCatalog(){
  const courses=catalogState?.courses||[],q=$('catalog-search').value.trim().toLocaleLowerCase('es');
  const filtered=courses.filter(c=>(c.id+' '+c.title).toLocaleLowerCase('es').includes(q));
  $('catalog-list').innerHTML=filtered.slice(0,100).map(c=>`<button class="catalog-item" type="button" data-edit-course="${esc(c.id)}"><b>${esc(c.id)}</b> ${esc(c.title)} <small>${c.active?'Activo':'Archivado'}</small></button>`).join('');
  $('catalog-status').textContent=`${courses.length} cursos gestionados · ${filtered.length} coincidencias${filtered.length>100?' (se muestran 100; afina la búsqueda)':''}. Para actualizar un curso del Excel, usa su mismo ID.`;
  $('completion-course').innerHTML='<option value="">Selecciona un curso</option>'+courses.filter(c=>c.active).map(c=>`<option value="${esc(c.id)}">${esc(c.id)} · ${esc(c.title)}</option>`).join('');
}
function previewBadge(){
  const url=$('course-image').value.trim(),img=$('badge-preview');img.hidden=true;$('badge-preview-status').textContent='';
  if(!url)return;
  try{if(new URL(url).protocol!=='https:')return;}catch{return;}
  img.onload=()=>{img.hidden=false;$('badge-preview-status').textContent='';};img.onerror=()=>{img.hidden=true;$('badge-preview-status').textContent='No se pudo cargar la imagen. Revisa que el enlace sea público y directo.';};img.referrerPolicy='no-referrer';img.src=url;
}
function renderManual(){
  $('manual-courses').innerHTML=personState.courses.length?personState.courses.map((c,i)=>`<div class="manual-row"><span>${esc(c.id)} · ${esc(c.title)} · ${esc(c.date)}</span><button type="button" class="text-button danger" data-remove-completion="${i}">Retirar de la lista</button></div>`).join(''):'<p>No hay aprobaciones manuales.</p>';
}
function initManagement(){
  $('course-catalog-file').addEventListener('change',()=>{
    const file=$('course-catalog-file').files[0];stagedCourseCatalog=null;$('course-catalog-preview').hidden=true;courseImportControls();if(!file)return;
    manage(async current=>{
      $('course-catalog-status').textContent='Leyendo el catálogo y preparando la vista previa…';
      try{
        const [courses,catalog]=await Promise.all([readCourseCatalog(file),api('catalog',{},false)]);
        if(!current())return;catalogState=catalog;stagedCourseCatalog={courses,revision:catalog.revision||0};
        renderCourseCatalogPreview(courses,catalog);$('course-catalog-status').textContent='Vista previa lista. Revisa la tabla y pulsa Guardar catálogo de cursos.';
      }catch(e){if(current()){$('course-catalog-status').textContent=e.message;$('course-catalog-file').value='';}throw e;}
    });
  });
  $('apply-course-catalog').addEventListener('click',()=>manage(async current=>{
    if(!stagedCourseCatalog)return;
    const staged=stagedCourseCatalog;
    try{
      const data=await api('importCourses',staged,false);
      if(!current())return;catalogState=data;stagedCourseCatalog=null;$('course-catalog-preview').hidden=true;$('course-fields').disabled=false;renderCatalog();
      $('course-catalog-status').textContent='Catálogo guardado. Puedes buscar los cursos por su ID y configurar sus insignias.';message('Catálogo actualizado. Se conservaron los diseños de insignias y el historial del personal.');
    }catch(e){if(current()){$('course-catalog-file').value='';$('course-catalog-status').textContent=e.message+' Si los datos cambiaron, selecciona otra vez el archivo para revisar una nueva vista previa.';}throw e;}
  }));
  $('catalog-from-excel').addEventListener('click',()=>manage(async current=>{
    if(!parsed||parsed.report.invalid)throw new Error('Primero selecciona y valida el Excel completo.');
    const data=await api('seedCatalog',{courses:parsed.catalogCourses},false);
    if(!current())return;catalogState=data;renderCatalog();$('course-fields').disabled=false;
    message('Cursos añadidos al catálogo. Los cursos que ya estaban gestionados conservan sus nombres e insignias. No se publicaron personas.');
  }));
  $('load-catalog').addEventListener('click',()=>manage(async current=>{const data=await api('catalog',{},false);if(!current())return;catalogState=data;renderCatalog();$('course-fields').disabled=false;message('Catálogo cargado. Puedes crear cursos o editar los existentes.');}));
  $('catalog-search').addEventListener('input',renderCatalog);
  $('catalog-list').addEventListener('click',e=>{
    const button=e.target.closest('[data-edit-course]');if(!button||managementBusy)return;
    const c=catalogState.courses.find(c=>c.id===button.dataset.editCourse);
    $('course-id').value=c.id;$('course-id').readOnly=true;$('course-title').value=c.title;$('course-badge').value=c.badgeName;$('course-image').value=c.image;$('course-active').value=String(c.active);previewBadge();$('course-title').focus();
  });
  $('new-course').addEventListener('click',()=>{$('course-form').reset();$('course-id').readOnly=false;previewBadge();$('course-id').focus();});
  $('course-image').addEventListener('change',previewBadge);
  $('course-form').addEventListener('submit',e=>{e.preventDefault();if(!catalogState)return;manage(async current=>{
    const id=$('course-id').value.trim();
    if(!$('course-id').readOnly&&catalogState.courses.some(c=>c.id===id))throw new Error('Ese ID ya existe. Selecciónalo en el catálogo para editarlo.');
    const data=await api('saveCourse',{revision:catalogState.revision,course:{id,title:$('course-title').value.trim(),badgeName:$('course-badge').value.trim(),image:$('course-image').value.trim(),active:$('course-active').value==='true'}},false);
    if(!current())return;catalogState=data;$('course-id').readOnly=true;renderCatalog();message('Curso guardado. Su nombre e insignia se actualizarán al consultar los pasaportes.');
  });});
  $('person-search').addEventListener('submit',e=>{e.preventDefault();if(personState&&!confirm('¿Descartar los cambios sin guardar y buscar otra persona?'))return;manage(async current=>{
    const cedula=$('person-lookup').value.trim(),data=await api('person',{cedula},false);if(!current())return;
    const p=data.managed;personState={cedula,revision:p?.revision||0,courses:(p?.courses||[]).map(c=>({...c}))};
    $('person-heading').textContent='Cédula: '+cedula;$('edit-name').value=p?.name||data.base?.name||'';$('person-active').value=String(p?.active!==false);
    $('base-history').textContent=`${data.base?.courses.length||0} cursos en el Excel publicado. Estos se conservan y se combinan con las aprobaciones manuales.`;
    $('person-form').hidden=false;renderManual();message(data.base||p?'Persona cargada.':'Cédula nueva. Completa el nombre y guarda su pasaporte.');
  });});
  $('add-completion').addEventListener('click',()=>{
    if(!personState||managementBusy)return;
    const id=$('completion-course').value,course=catalogState?.courses.find(c=>c.id===id&&c.active),date=$('completion-date').value;
    if(!course||!date){message('Selecciona un curso activo y su fecha de aprobación.',true);return;}
    if(personState.courses.some(c=>c.id===id)){message('Ese curso ya está en la lista manual. Retíralo antes de corregir su fecha.',true);return;}
    personState.courses.push({...course,date,approval:100});renderManual();message('Aprobación preparada. Guarda la persona para publicarla.');
  });
  $('manual-courses').addEventListener('click',e=>{const b=e.target.closest('[data-remove-completion]');if(b&&!managementBusy){personState.courses.splice(Number(b.dataset.removeCompletion),1);renderManual();}});
  $('cancel-person').addEventListener('click',()=>{if(confirm('¿Descartar los cambios de esta persona?')){personState=null;$('person-form').hidden=true;}});
  $('person-form').addEventListener('submit',e=>{e.preventDefault();if(!personState)return;manage(async current=>{
    const data=await api('savePerson',{revision:personState.revision,person:{cedula:personState.cedula,name:$('edit-name').value.trim(),active:$('person-active').value==='true',courses:personState.courses.map(c=>({id:c.id,date:c.date}))}},false);
    if(!current())return;personState={...data};renderManual();message('Persona guardada. Los cambios ya están disponibles al consultar su cédula.');
  });});
}
