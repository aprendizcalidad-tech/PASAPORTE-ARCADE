import {connect} from './firebase.js';
import {appConfig} from '../firebase-config.js';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let services,user=null,parsed=null,fingerprint='',currentJob=null,busy=false,worker=null,fileSequence=0,pollTimer=null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function message(text,error=false){$('admin-status').textContent=text;$('admin-status').classList.toggle('error',error);}
function controls(value){busy=value;['import-button','drive-button','excel','cancel-job','logout'].forEach(id=>$(id).disabled=value);}
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
  if(!parsed||busy||parsed.report.invalid)return;controls(true);
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
$('drive-button').addEventListener('click',async()=>{controls(true);try{await api('drive',{},false);await refresh(false);message('Sincronización en cola. El activador continuará en segundo plano; puedes cerrar esta página.');}catch(e){message(e.message,true);}finally{controls(false);}});
$('refresh-status').addEventListener('click',()=>refresh());
$('cancel-job').addEventListener('click',async()=>{if(!currentJob||!confirm('¿Cancelar la importación pendiente? El pasaporte publicado actualmente se conserva.'))return;controls(true);try{await api('cancel',{importId:currentJob.id});localStorage.removeItem('arcadeImport');await refresh(false);message('Importación cancelada.');}catch(e){message(e.message,true);}finally{controls(false);}});
try{
  services=await connect();await services.authApi.setPersistence(services.auth,services.authApi.browserSessionPersistence);
  services.authApi.onAuthStateChanged(services.auth,async account=>{
    user=null;$('dashboard').hidden=true;$('login-view').hidden=false;clearTimeout(pollTimer);
    if(!account){message('Ingresa con una cuenta administradora.');return;}
    try{
      const role=await services.storeApi.getDocFromServer(services.storeApi.doc(services.db,'admins',account.uid));
      if(!role.exists()||role.data().enabled!==true)throw new Error('Esta cuenta no está autorizada. Crea su documento admins/UID con enabled: true en Firestore.');
      user=account;$('password').value='';$('admin-email').textContent=account.email;$('login-view').hidden=true;$('dashboard').hidden=false;if(await refresh(false))message('Sesión de administrador activa.');
    }catch(e){message(e.message,true);}
  });
}catch(e){message(e.message,true);$('login-submit').disabled=true;$('reset-password').disabled=true;}
