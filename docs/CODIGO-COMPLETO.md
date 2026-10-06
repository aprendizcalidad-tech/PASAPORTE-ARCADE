# Código completo por módulos

Cada bloque corresponde al archivo indicado. Conserva las rutas y copia todo su contenido. El CSS se incluye íntegro. Sigue primero GUIA-PASO-A-PASO.md.

La dependencia de terceros SheetJS ya viene completa en assets/vendor/xlsx.full.min.js, junto con su licencia; no se reproduce el bundle minificado en este documento. Crea también un archivo vacío `.nojekyll` en la raíz.

## firebase-config.js

```javascript
// Copia aquí el objeto de Firebase > Configuración del proyecto > Tus apps > Web.
// Estos identificadores web son públicos. NUNCA agregues claves privadas o contraseñas.
export const firebaseConfig = {
  apiKey: 'REEMPLAZAR_API_KEY',
  authDomain: 'REEMPLAZAR.firebaseapp.com',
  projectId: 'REEMPLAZAR',
  storageBucket: 'REEMPLAZAR.firebasestorage.app',
  messagingSenderId: 'REEMPLAZAR',
  appId: 'REEMPLAZAR'
};
export const appConfig = {
  gasUrl: 'REEMPLAZAR_URL_WEB_APP_TERMINADA_EN_EXEC',
  title: 'Pasaporte Mundo Arcade',
  // Metas de gamificación editoriales, no categorías que existan en el Excel.
  levelThresholds: [1, 5, 15, 30, 50],
  levelNames: ['Explorador', 'Aprendiz', 'Aventurero', 'Avanzado', 'Experto']
};

```

## firestore.rules

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function admin() {
      return request.auth != null
        && exists(/databases/$(database)/documents/admins/$(request.auth.uid))
        && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.enabled == true;
    }
    match /admins/{uid} {
      allow get: if request.auth != null && request.auth.uid == uid;
      allow list, write: if false;
    }
    match /public/config {
      allow get: if true;
      allow list, write: if false;
    }
    match /releases/{releaseId}/people/{cedula} {
      // Consulta puntual por cédula, nunca listado público.
      // Conocer una cédula permite consultar su pasaporte: NO es autenticación.
      allow get: if cedula.matches('^[0-9]{1,20}$') &&
        (admin() || get(/databases/$(database)/documents/public/config).data.activeRelease == releaseId);
      allow list, write: if false;
    }
    match /{document=**} { allow read, write: if false; }
  }
}

```

## firestore.indexes.json

```json
{"indexes":[],"fieldOverrides":[{"collectionGroup":"people","fieldPath":"payload","indexes":[]}]}

```

## firebase.json

```json
{"firestore":{"rules":"firestore.rules","indexes":"firestore.indexes.json"}}

```

## google-apps-script/Code.gs

```javascript
/* Pasaporte Mundo Arcade — backend. No requiere cuenta de servicio ni clave privada.
 * El propietario ejecuta con OAuth de Google; el visitante administra con Firebase Auth.
 * Copiar Normalizer.gs, Firestore.gs, DriveSync.gs y appsscript.json junto a este archivo.
 */
function cfg_() {
  var p=PropertiesService.getScriptProperties();
  var c={project:p.getProperty('FIREBASE_PROJECT_ID'),key:p.getProperty('FIREBASE_WEB_API_KEY'),source:p.getProperty('DRIVE_SOURCE_ID')};
  if(!c.project || !c.key) throw new Error('Configura FIREBASE_PROJECT_ID y FIREBASE_WEB_API_KEY.');
  return c;
}
function doGet() { return json_({ok:true,service:'Pasaporte Mundo Arcade',version:'1.0.0'}); }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function doPost(e) {
  var lock;
  try {
    if(!e || !e.postData || e.postData.contents.length>6000000) throw new Error('Solicitud inválida o demasiado grande.');
    var body=JSON.parse(e.postData.contents), user=admin_(body.idToken);
    lock=LockService.getScriptLock();
    if(!lock.tryLock(5000)) throw new Error('BUSY: hay otra operación en curso. Reintenta.');
    var result;
    switch(body.action) {
      case 'begin': result=begin_(body,user); break;
      case 'chunk': result=chunk_(body,user); break;
      case 'publish': result=publish_(body.importId,user); break;
      case 'status': result=status_(); break;
      case 'cancel': result=cancel_(body.importId); break;
      case 'drive': result=startDrive_(); break;
      default: throw new Error('Acción desconocida.');
    }
    return json_({ok:true,data:result});
  } catch(error) { return json_({ok:false,error:String(error.message || error).slice(0,500)}); }
  finally { if(lock && lock.hasLock()) lock.releaseLock(); }
}
function admin_(token) {
  if(typeof token!=='string' || token.length>10000) throw new Error('Inicia sesión como administrador.');
  var c=cfg_(), parts=token.split('.');
  if(parts.length!==3) throw new Error('Token inválido.');
  var claims=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString());
  if(claims.aud!==c.project || claims.iss!=='https://securetoken.google.com/'+c.project || claims.exp*1000<=Date.now()) throw new Error('Sesión inválida o vencida.');
  // Google valida criptográficamente el token. Decodificar JWT arriba NO es la verificación.
  var r=UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(c.key),{
    method:'post',contentType:'application/json',payload:JSON.stringify({idToken:token}),muteHttpExceptions:true
  });
  if(r.getResponseCode()!==200) throw new Error('Firebase rechazó la sesión. Vuelve a iniciar sesión.');
  var u=(JSON.parse(r.getContentText()).users || [])[0];
  if(!u || u.disabled || u.localId!==claims.sub || Number(claims.auth_time)<Number(u.validSince || 0)) throw new Error('Sesión revocada o usuario deshabilitado.');
  var role=fsGet_('admins/'+u.localId);
  if(!role || role.enabled!==true) throw new Error('Esta cuenta no tiene permiso de administrador.');
  return u.localId;
}
function validId_(id) {
  if(typeof id!=='string' || !/^[a-zA-Z0-9_-]{8,90}$/.test(id)) throw new Error('ID de importación inválido.');
  return id;
}
function status_() {
  var state=fsGet_('system/import'), publication=fsGet_('public/config');
  var job=state && state.id ? fsGet_('releases/'+state.id) : null;
  return {job:job, publication:publication};
}
function assertIdle_() {
  var s=status_();
  if(s.job && ['uploading','queued','preparing','ready','error'].indexOf(s.job.status)>=0) throw new Error('Hay una importación pendiente. Reanúdala o cancélala antes de iniciar otra.');
}
function summary_(x) {
  var out={};
  ['people','courseCount','badgeCount','rows','completed'].forEach(function(k){
    var v=Number(x && x[k]);
    if(!Number.isSafeInteger(v) || v<0 || v>2000000) throw new Error('Resumen inválido: '+k);
    out[k]=v;
  });
  if(out.people<1 || out.people>20000 || out.courseCount<1) throw new Error('No hay personas aprobadas o el lote supera 20.000 personas.');
  return out;
}
function begin_(b,user) {
  var id=validId_(b.importId), old=fsGet_('releases/'+id);
  if(old) {
    if(old.owner!==user) throw new Error('La importación pertenece a otro administrador.');
    return old;
  }
  assertIdle_();
  var summary=summary_(b.summary);
  var job={id:id,owner:user,source:'upload',status:'uploading',next:0,written:0,summary:summary,chunks:Math.ceil(summary.people/50),createdAt:new Date().toISOString()};
  fsCommit_([write_('releases/'+id,job),write_('system/import',{id:id})]);
  return job;
}
function profile_(p) {
  if(!p || !/^\d{1,20}$/.test(p.cedula) || typeof p.name!=='string' || !p.name.trim() || p.name.length>300 || !Array.isArray(p.courses) || p.courses.length<1 || p.courses.length>2000) throw new Error('Perfil inválido.');
  var seen={}, images={}, courses=p.courses.map(function(c){
    if(!c || !/^\d+$/.test(c.id) || seen[c.id] || c.approval!==100 || typeof c.title!=='string' || c.title.length>1000) throw new Error('Curso inválido o duplicado.');
    seen[c.id]=true;
    var out={id:c.id,title:c.title,date:/^\d{4}-\d{2}-\d{2}$/.test(c.date)?c.date:'',image:ArcadeNormalizer.url(c.image),badgeName:String(c.badgeName || c.title).slice(0,1000),approval:100};
    if(out.image && !images[out.image]) images[out.image]={image:out.image,name:out.badgeName,date:out.date};
    return out;
  });
  var clean={cedula:p.cedula,name:p.name.trim(),courses:courses,badges:Object.keys(images).map(function(k){return images[k];})};
  var payload=JSON.stringify(clean);
  if(Utilities.newBlob(payload).getBytes().length>850000) throw new Error('Perfil demasiado grande: '+p.cedula);
  return {payload:payload};
}
function chunk_(b,user) {
  var id=validId_(b.importId), job=fsGet_('releases/'+id);
  if(!job || job.owner!==user) throw new Error('Importación no encontrada o sin permiso.');
  if(job.status==='published') return job;
  if(job.status!=='uploading') throw new Error('La importación no admite lotes: '+job.status);
  if(!Number.isInteger(b.index) || b.index<0) throw new Error('Índice inválido.');
  if(b.index<job.next) return job; // Reintento de un commit ya confirmado.
  if(b.index!==job.next || !Array.isArray(b.profiles) || b.profiles.length!==Math.min(50,job.summary.people-job.written)) throw new Error('Lote fuera de secuencia o tamaño incorrecto.');
  var docs={}, writes=b.profiles.map(function(p){
    if(docs[p.cedula]) throw new Error('Cédula repetida en el lote.');
    docs[p.cedula]=true;
    return write_('releases/'+id+'/people/'+p.cedula,profile_(p),true);
  });
  job.next++;job.written+=b.profiles.length;
  writes.push(write_('releases/'+id,job));
  // Personas y cursor cambian en UN commit atómico. Un fallo permite reintentar sin duplicados.
  fsCommit_(writes);
  return job;
}
function publish_(id,user) {
  id=validId_(id);
  var job=fsGet_('releases/'+id);
  if(!job || (user && job.owner!==user)) throw new Error('Importación no encontrada o sin permiso.');
  if(job.status==='published') return job;
  if(job.status!=='uploading' || job.written!==job.summary.people || job.next!==job.chunks) throw new Error('La importación aún no está completa.');
  job.status='published';job.publishedAt=new Date().toISOString();
  var publication=Object.assign({},job.summary,{activeRelease:id,updatedAt:job.publishedAt});
  fsCommit_([write_('releases/'+id,job),write_('public/config',publication)]);
  return job;
}
function cancel_(id) {
  validId_(id);var job=fsGet_('releases/'+id);
  if(!job || job.status==='published') throw new Error('No se puede cancelar una publicación terminada.');
  job.status='cancelled';fsCommit_([write_('releases/'+id,job)]);
  return job;
}
function verificarConexion() {
  var c=cfg_();
  var result=fsGet_('public/config');
  console.log('Conexión correcta a '+c.project+'. Publicación: '+(result ? result.activeRelease : 'todavía sin importar'));
}

```

## google-apps-script/Firestore.gs

```javascript
function fsRoot_(){return 'projects/'+cfg_().project+'/databases/(default)/documents';}
function value_(v){
  if(v===null) return {nullValue:null};
  if(typeof v==='string') return {stringValue:v};
  if(typeof v==='boolean') return {booleanValue:v};
  if(typeof v==='number') return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(Array.isArray(v)) return {arrayValue:{values:v.map(value_)}};
  var fields={};Object.keys(v).forEach(function(k){fields[k]=value_(v[k]);});return {mapValue:{fields:fields}};
}
function plain_(v){
  if('stringValue' in v)return v.stringValue;
  if('integerValue' in v)return Number(v.integerValue);
  if('doubleValue' in v)return v.doubleValue;
  if('booleanValue' in v)return v.booleanValue;
  if('nullValue' in v)return null;
  if('arrayValue' in v)return (v.arrayValue.values||[]).map(plain_);
  var o={};Object.keys((v.mapValue||{}).fields||{}).forEach(function(k){o[k]=plain_(v.mapValue.fields[k]);});return o;
}
function fsRequest_(path,method,body,allowMissing){
  var options={method:method,headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true};
  if(body){options.contentType='application/json';options.payload=JSON.stringify(body);}
  for(var attempt=0;attempt<4;attempt++){
    var r=UrlFetchApp.fetch('https://firestore.googleapis.com/v1/'+fsRoot_()+path,options), code=r.getResponseCode();
    if(code>=200 && code<300)return JSON.parse(r.getContentText());
    if(code===404 && allowMissing)return null;
    if((code===429 || code>=500) && attempt<3){Utilities.sleep(700*Math.pow(2,attempt));continue;}
    // No incluir tokens ni cuerpos con datos de personas en los errores.
    throw new Error('Firestore HTTP '+code+'. Revisa permisos IAM, API habilitada y cuota.');
  }
}
function fsGet_(path){var d=fsRequest_('/'+path,'get',null,true);return d?plain_({mapValue:{fields:d.fields||{}}}):null;}
function write_(path,data,createOnly){
  var w={update:{name:fsRoot_()+'/'+path,fields:value_(data).mapValue.fields}};
  if(createOnly)w.currentDocument={exists:false};
  return w;
}
function fsCommit_(writes){if(writes.length)fsRequest_(':commit','post',{writes:writes},false);}

```

## google-apps-script/Normalizer.gs

```javascript
/* Compartido SIN modificaciones entre navegador, pruebas y Apps Script (Normalizer.gs). */
(function (root) {
  'use strict';
  const key = v => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  function id(v) {
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v) || v < 0) return '';
      return String(v);
    }
    const s = String(v == null ? '' : v).trim();
    if (/^\d+\.0+$/.test(s)) return s.split('.')[0];
    return /^\d+$/.test(s) ? s : '';
  }
  function url(v) {
    const s = String(v || '').trim();
    return /^https:\/\/[^\s]+$/i.test(s) && s.length < 2048 ? s : '';
  }
  function date(v) {
    if (!v) return '';
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
    if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
    const s = String(v).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[0];
    const local = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    return local ? local[3] + '-' + local[2].padStart(2, '0') + '-' + local[1].padStart(2, '0') : '';
  }
  function headers(rows, required, sheet) {
    if (!rows.length) throw new Error('La pestaña ' + sheet + ' está vacía.');
    const cols = rows[0].map(key);
    const out = {};
    required.forEach(name => {
      const index = cols.indexOf(key(name));
      if (index < 0) throw new Error('Falta la columna "' + name + '" en ' + sheet + '.');
      out[name] = index;
    });
    return out;
  }
  function build(flat, badges) {
    const h = headers(flat, ['fechaInicio','ultimaAccion','fechaFinal','percAprob','capCapacitacionId','Capacitación','capUsuarioId','Nombre','Cedula','Insignia'], 'Archivo Plano');
    const b = headers(badges, ['Id','Nombre','Insignia'], 'Insignias');
    const catalog = new Map(), people = new Map(), courseIds = new Set(), catalogBadgeUrls = new Set();
    const report = { rows: 0, approved: 0, duplicates: 0, invalid: 0, notApproved: 0, missingBadge: 0, warnings: [] };
    badges.slice(1).forEach(row => {
      const courseId = id(row[b.Id]);
      if (courseId) catalog.set(courseId, {name: String(row[b.Nombre] || '').trim(), image: url(row[b.Insignia])});
    });
    flat.slice(1).forEach((row, index) => {
      if (!row.some(v => v !== '' && v != null)) return;
      report.rows++;
      const cedula = id(row[h.Cedula]), courseId = id(row[h.capCapacitacionId]);
      const name = String(row[h.Nombre] || '').trim(), title = String(row[h['Capacitación']] || '').trim();
      if (!cedula || !courseId || !name || !title || cedula.length > 20) {
        report.invalid++;
        if (report.warnings.length < 15) report.warnings.push('Fila ' + (index + 2) + ': cédula, ID, nombre o capacitación inválidos.');
        return;
      }
      courseIds.add(courseId);
      const badge = catalog.get(courseId);
      const image = url(row[h.Insignia]) || (badge ? badge.image : '');
      if (image) catalogBadgeUrls.add(image);
      const percentage = Number(String(row[h.percAprob] == null ? '' : row[h.percAprob]).trim().replace('%','').replace(',','.'));
      if (percentage !== 100) { report.notApproved++; return; }
      report.approved++;
      if (!people.has(cedula)) people.set(cedula, {cedula, name, nameDate: '', courses: new Map()});
      const person = people.get(cedula);
      const updated = date(row[h.ultimaAccion]) || date(row[h.fechaFinal]) || date(row[h.fechaInicio]);
      if (updated >= person.nameDate) { person.name = name; person.nameDate = updated; }
      const course = {id: courseId, title, date: date(row[h.fechaFinal]) || updated, image, badgeName: badge && badge.name ? badge.name : title, approval:100};
      const previous = person.courses.get(courseId);
      if (previous) {
        report.duplicates++;
        if (course.date >= previous.date) person.courses.set(courseId, {...course, image: course.image || previous.image});
        else if (!previous.image && course.image) previous.image = course.image;
      } else person.courses.set(courseId, course);
    });
    const profiles = Array.from(people.values()).map(p => {
      const courses = Array.from(p.courses.values()).sort((a,b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
      const earned = new Map();
      courses.forEach(c => {
        if (!c.image) report.missingBadge++;
        else if (!earned.has(c.image)) earned.set(c.image, {image:c.image, name:c.badgeName, date:c.date});
      });
      return {cedula:p.cedula, name:p.name, courses, badges:Array.from(earned.values())};
    }).sort((a,b) => a.cedula.localeCompare(b.cedula));
    return {profiles, report, summary:{people:profiles.length, courseCount:courseIds.size, badgeCount:catalogBadgeUrls.size, rows:report.rows, completed:profiles.reduce((n,p)=>n+p.courses.length,0)}};
  }
  root.ArcadeNormalizer = {build,id,url,date};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ArcadeNormalizer;
})(typeof globalThis !== 'undefined' ? globalThis : this);

```

## google-apps-script/DriveSync.gs

```javascript
/* Sincronización Drive: snapshot privado, preparación y commits reanudables mediante trigger.
 * Para el Excel adjunto: 95.812 filas, 1.951 perfiles, lotes de 50 perfiles.
 */
function startDrive_(){
  assertIdle_();
  var c=cfg_();if(!c.source)throw new Error('Configura DRIVE_SOURCE_ID en las propiedades del script.');
  var id='drive-'+Utilities.getUuid(), job={id:id,owner:'drive',source:'drive',status:'queued',next:0,written:0,createdAt:new Date().toISOString()};
  fsCommit_([write_('releases/'+id,job),write_('system/import',{id:id})]);
  return job;
}
function iniciarSincronizacionDrive(){
  var lock=LockService.getScriptLock();lock.waitLock(5000);
  try{console.log(JSON.stringify(startDrive_()));}finally{lock.releaseLock();}
}
function instalarAutomatizacion(){
  cfg_();
  ScriptApp.getProjectTriggers().filter(function(t){return ['continuarDrive','detectarCambiosDrive'].indexOf(t.getHandlerFunction())>=0;}).forEach(function(t){ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger('continuarDrive').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('detectarCambiosDrive').timeBased().everyHours(1).create();
  console.log('Listo: continuación cada minuto; revisión de Drive cada hora.');
}
function detectarCambiosDrive(){
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{
    var c=cfg_();if(!c.source)return;
    var p=PropertiesService.getScriptProperties();
    var stamp=DriveApp.getFileById(c.source).getLastUpdated().toISOString();
    if(stamp===p.getProperty('DRIVE_LAST_SUCCESS'))return;
    var state=status_();
    if(state.job && ['queued','preparing','uploading','ready','error'].indexOf(state.job.status)>=0)return;
    startDrive_();
  }finally{lock.releaseLock();}
}
function continuarDrive(){
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  var job;
  try{
    var state=fsGet_('system/import');if(!state)return;
    job=fsGet_('releases/'+state.id);
    if(!job || job.source!=='drive' || ['queued','preparing','uploading'].indexOf(job.status)<0)return;
    var start=Date.now();
    if(job.status==='queued'){
      var source=DriveApp.getFileById(cfg_().source);
      job.sourceStamp=source.getLastUpdated().toISOString();
      var mime=source.getMimeType(), snapshot;
      if(mime===MimeType.GOOGLE_SHEETS)snapshot=source.makeCopy('Arcade temporal '+job.id).getId();
      else snapshot=Drive.Files.create({name:'Arcade temporal '+job.id,mimeType:MimeType.GOOGLE_SHEETS},source.getBlob(),{fields:'id'}).id;
      job.snapshotId=snapshot;job.status='preparing';
      fsCommit_([write_('releases/'+job.id,job)]);
      return; // Convertir el XLSX y procesarlo ocurren en ejecuciones distintas.
    }
    if(job.status==='preparing'){
      var book=SpreadsheetApp.openById(job.snapshotId),flat=book.getSheetByName('Archivo Plano'),badges=book.getSheetByName('Insignias');
      if(!flat || !badges)throw new Error('El archivo debe tener las pestañas Archivo Plano e Insignias.');
      if(flat.getLastRow()>120001)throw new Error('Este flujo Drive admite hasta 120.000 filas. Divide la fuente o usa el panel para archivos mayores.');
      var parsed=ArcadeNormalizer.build(flat.getDataRange().getValues(),badges.getDataRange().getValues());
      if(parsed.report.invalid)throw new Error('Hay '+parsed.report.invalid+' filas inválidas. Corrige la fuente antes de importar.');
      job.summary=summary_(parsed.summary);job.chunks=Math.ceil(job.summary.people/50);
      job.dataId=DriveApp.createFile('Arcade datos temporales '+job.id+'.json',JSON.stringify(parsed.profiles),MimeType.PLAIN_TEXT).getId();
      job.status='uploading';job.report=parsed.report;
      fsCommit_([write_('releases/'+job.id,job)]);
      return;
    }
    var profiles=JSON.parse(DriveApp.getFileById(job.dataId).getBlob().getDataAsString());
    // Cursor persistido: cada minuto continúa donde quedó; nunca activa datos parciales.
    while(job.next<job.chunks && Date.now()-start<180000){
      job=chunk_({importId:job.id,index:job.next,profiles:profiles.slice(job.written,job.written+50)},'drive');
    }
    if(job.next===job.chunks){
      job=publish_(job.id,'drive');
      PropertiesService.getScriptProperties().setProperty('DRIVE_LAST_SUCCESS',job.sourceStamp);
      [job.dataId,job.snapshotId].forEach(function(id){if(id)DriveApp.getFileById(id).setTrashed(true);});
    }
  }catch(e){
    if(job) job=fsGet_('releases/'+job.id) || job;
    if(job && job.status!=='published'){
      job.resumeStatus=job.status;job.status='error';job.error=String(e.message).slice(0,500);
      fsCommit_([write_('releases/'+job.id,job)]);
    }
    console.error(String(e.message));
  }finally{lock.releaseLock();}
}
function reanudarDrive(){
  var lock=LockService.getScriptLock();lock.waitLock(5000);
  try{
    var state=fsGet_('system/import'),job=state?fsGet_('releases/'+state.id):null;
    if(!job || job.source!=='drive' || job.status!=='error')throw new Error('No hay una sincronización Drive con error.');
    job.status=job.resumeStatus || 'queued';delete job.error;
    fsCommit_([write_('releases/'+job.id,job)]);
  }finally{lock.releaseLock();}
}

```

## google-apps-script/Maintenance.gs

```javascript
/* Mantenimiento manual. Conserva la publicación activa y la más reciente anterior.
 * Ejecutar de nuevo si indica que debe continuar; se detiene antes del límite de GAS.
 */
function limpiarVersionesAntiguas(){
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw new Error('Hay una importación en ejecución.');
  try{
    var start=Date.now(),state=status_(),active=state.publication?state.publication.activeRelease:'';
    var docs=[],page='';
    do{
      var r=fsRequest_('/releases?pageSize=100'+(page?'&pageToken='+encodeURIComponent(page):''),'get',null,false);
      docs=docs.concat((r.documents||[]).map(function(d){return plain_({mapValue:{fields:d.fields||{}}});}));page=r.nextPageToken||'';
    }while(page && Date.now()-start<120000);
    if(page)throw new Error('Demasiadas versiones para esta limpieza. Usa Firebase CLI recursive delete para las versiones antiguas.');
    var previous=docs.filter(function(j){return j.status==='published'&&j.id!==active;}).sort(function(a,b){return (b.publishedAt||'').localeCompare(a.publishedAt||'');})[0];
    var candidates=docs.filter(function(j){return j.id!==active && (!previous||j.id!==previous.id) && (!state.job||j.id!==state.job.id) && ['published','cancelled'].indexOf(j.status)>=0;});
    for(var i=0;i<candidates.length;i++){
      var job=candidates[i];
      while(Date.now()-start<180000){
        var found=fsRequest_('/releases/'+job.id+'/people?pageSize=100','get',null,false).documents||[];
        if(!found.length)break;
        fsCommit_(found.map(function(d){return {delete:d.name};}));
      }
      if(Date.now()-start>=180000){console.log('Limpieza parcial. Vuelve a ejecutar limpiarVersionesAntiguas.');return;}
      [job.snapshotId,job.dataId].forEach(function(id){if(id)DriveApp.getFileById(id).setTrashed(true);});
      fsCommit_([{delete:fsRoot_()+'/releases/'+job.id}]);
    }
    console.log('Limpieza completada. Se conservan la versión activa, la anterior y la última tarea.');
  }finally{lock.releaseLock();}
}

```

## google-apps-script/appsscript.json

```json
{
  "timeZone":"America/Bogota",
  "dependencies":{"enabledAdvancedServices":[{"userSymbol":"Drive","version":"v3","serviceId":"drive"}]},
  "exceptionLogging":"STACKDRIVER",
  "runtimeVersion":"V8",
  "oauthScopes":["https://www.googleapis.com/auth/script.external_request","https://www.googleapis.com/auth/datastore","https://www.googleapis.com/auth/drive","https://www.googleapis.com/auth/spreadsheets","https://www.googleapis.com/auth/script.scriptapp"]
}

```

## index.html

```html
<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#061b32"><meta name="description" content="Consulta tus cursos e insignias en tu Pasaporte Mundo Arcade."><title>Pasaporte Mundo Arcade</title><link rel="icon" href="assets/medal.svg" type="image/svg+xml"><link rel="stylesheet" href="styles.css"></head>
<body>
<svg class="svg-defs" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
<symbol id="i-book" viewBox="0 0 24 24"><path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-1-7-2-10 1Zm0 0v16"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></symbol>
<symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M3 22v-4a9 9 0 0 1 18 0v4Z"/></symbol>
<symbol id="i-chart" viewBox="0 0 24 24"><path d="M3 21v-7h4v7ZM10 21V8h4v13ZM17 21V2h4v19Z"/></symbol>
<symbol id="i-medal" viewBox="0 0 24 24"><circle cx="12" cy="9" r="7"/><path d="m7 15-2 7 7-3 7 3-2-7M12 5l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/></symbol>
<symbol id="i-home" viewBox="0 0 24 24"><path d="m2 11 10-9 10 9M5 9v13h5v-8h4v8h5V9"/></symbol>
<symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20M4 6h16M4 18h16"/></symbol>
</defs></svg>
<header class="topbar"><a class="brand" href="./" aria-label="Pasaporte Mundo Arcade, inicio"><span class="planet"><svg><use href="#i-globe"/></svg><span class="orbit"></span><b>✦</b></span><span>PASAPORTE<strong>MUNDO ARCADE</strong></span></a>
<nav aria-label="Navegación principal"><a href="#inicio" class="active"><svg><use href="#i-home"/></svg>Inicio</a><a href="#perfil"><svg><use href="#i-user"/></svg>Mi Pasaporte</a><a href="#cursos"><svg><use href="#i-book"/></svg>Cursos</a><a href="#insignias"><svg><use href="#i-medal"/></svg>Insignias</a><a href="#progreso"><svg><use href="#i-chart"/></svg>Progreso</a></nav>
<div class="nav-actions"><a class="login-link" href="admin/"><svg><use href="#i-user"/></svg>Iniciar sesión</a><button class="help-button" id="help-button" type="button">ⓘ <span>Ayuda</span></button></div></header>
<main id="inicio" class="stage">
<div id="demo-notice" class="demo-notice" hidden>VISTA DE DEMOSTRACIÓN · DATOS FICTICIOS <a href="./">Salir del demo</a></div>
<div class="book-wrap"><div class="book" id="passport">
<section class="page left-page" aria-labelledby="main-title">
<div class="page-kicker"><span><svg><use href="#i-globe"/></svg> PASAPORTE MUNDO ARCADE</span><span>TU HISTORIA DE APRENDIZAJE ✈</span></div>
<div class="intro"><div class="passport-stamp" aria-hidden="true"><svg><use href="#i-globe"/></svg><span>APRENDER<br>HOY<br>CONSTRUYE<br>MAÑANA</span></div><h1 id="main-title">Tu pasaporte<br><span>de aprendizaje</span></h1><p>Consulta tu progreso, revisa los cursos que has completado<br class="wide-only"> y las insignias que has obtenido en Mundo Arcade.<br>Ingresa tu número de cédula para ver tu historial de aprendizaje.</p></div>
<form class="search-panel" id="search-form"><span class="id-icon" aria-hidden="true">▣</span><div class="search-fields"><label for="cedula">Ingresa tu número de cédula</label><div class="input-wrap"><input id="cedula" name="cedula" type="text" inputmode="numeric" autocomplete="off" pattern="[0-9]{1,20}" maxlength="20" placeholder="Tu número de cédula" required aria-describedby="search-status"><button id="clear-search" type="button" aria-label="Limpiar consulta">×</button></div><button class="primary" type="submit" id="search-button"><svg><use href="#i-search"/></svg><span>Consultar progreso</span></button></div></form>
<p id="search-status" class="status-line" role="status" aria-live="polite">Tu próxima aventura comienza con lo que aprendes.</p>
<section id="cursos" class="courses-section"><div class="section-heading"><h2><svg><use href="#i-book"/></svg>Cursos realizados</h2><span id="course-count" class="small-caption"></span></div><div class="course-grid" id="course-grid"><div class="empty-card"><svg><use href="#i-book"/></svg><h3>Cada aprendizaje cuenta</h3><p>Consulta tu cédula para descubrir los cursos que has completado.</p></div></div><button class="text-button" id="more-courses" hidden type="button">Ver más cursos →</button></section>
<footer class="page-footer"><span>CONOCIMIENTO · SEGURIDAD · PERSONAS</span><span>01</span></footer>
</section>
<div class="spine" aria-hidden="true"></div>
<section class="page right-page" aria-label="Mi pasaporte de aprendizaje">
<div class="page-kicker right-kicker"><span class="my-passport"><svg><use href="#i-user"/></svg>Mi Pasaporte</span><span>ID DE APRENDIZAJE: <b id="header-id">—</b><i class="barcode" aria-hidden="true"></i></span></div>
<div class="profile-card" id="perfil"><img class="avatar" src="assets/avatar.svg" alt="Avatar ilustrado de aprendiz"><div class="profile-info"><p class="eyebrow">BIENVENIDO A TU AVENTURA</p><h2 id="person-name">Tu historia está por descubrir</h2><p id="person-id">Consulta tu número de cédula</p><span class="player-badge">✦ <span id="player-level">Jugador Arcade</span></span><blockquote>“El conocimiento nos mueve.”</blockquote></div><div class="round-stamp" aria-hidden="true"><span>MUNDO ARCADE</span><svg><use href="#i-globe"/></svg><small>CONOCIMIENTO<br>QUE NOS MUEVE</small></div></div>
<section id="progreso"><div class="section-heading"><h2><svg class="teal"><use href="#i-chart"/></svg>Mi progreso</h2><span class="small-caption">PEQUEÑOS PASOS, GRANDES LOGROS ↗</span></div>
<div class="metrics"><article class="metric mint"><h3>◆ &nbsp; Cursos<br>completados</h3><strong id="completed-count">—</strong><p id="catalog-count">Tu aprendizaje</p></article><article class="metric lilac"><h3>✦ &nbsp; Insignias<br>obtenidas</h3><strong id="badge-count">—</strong><p id="badge-total">Tus reconocimientos</p></article><article class="metric blue"><h3>▥ &nbsp; Nivel</h3><strong class="level-text" id="level-name">Explorador</strong><p id="level-number">Un nuevo comienzo</p></article><article class="metric aqua"><h3>Avance en<br>el catálogo</h3><div class="progress-ring" id="progress-ring" role="progressbar" aria-label="Cursos completados del catálogo" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"><span id="progress-number">—</span></div></article></div><p class="metric-note" id="metric-note">El avance se calcula sobre los cursos del archivo importado.</p></section>
<section id="insignias"><div class="section-heading"><h2><svg><use href="#i-medal"/></svg>Insignias obtenidas</h2><span class="small-caption">TU ESFUERZO TAMBIÉN DEJA HUELLA ★</span></div><div class="badge-grid" id="badge-grid"><div class="empty-badges"><img src="assets/medal.svg" alt=""><p>Aquí brillarán tus logros.<br><span>Cada curso abre un nuevo horizonte.</span></p></div></div><button class="text-button" id="more-badges" hidden type="button">Ver más insignias →</button></section>
<footer class="page-footer"><span id="updated-at">APRENDE. AVANZA. DEJA HUELLA.</span><span>02</span></footer>
</section></div></div>
<p class="site-note">Mismas personas. Más horizontes. <span>✦</span> Pasaporte Mundo Arcade <a href="?demo=1">Ver demostración</a></p>
</main>
<dialog id="help-dialog"><button class="dialog-close" type="button" aria-label="Cerrar">×</button><h2>Tu pasaporte, paso a paso</h2><ol><li>Ingresa tu cédula sin puntos ni espacios.</li><li>Consulta tus cursos aprobados al 100 %.</li><li>Descubre las insignias asociadas a esos cursos.</li></ol><p>El nivel depende de los cursos únicos completados. El avance compara tus cursos con el catálogo importado; no representa cursos obligatorios ni evaluaciones pendientes.</p><p>La consulta es pública por cédula: quien conozca ese número podrá ver el nombre, los cursos y las insignias asociados.</p><p>Si falta información, contacta al equipo de formación.</p><a href="admin/">Administrar la plataforma →</a></dialog>
<dialog id="course-dialog"><button class="dialog-close" type="button" aria-label="Cerrar">×</button><div id="course-details"></div></dialog>
<script type="module" src="js/app.js"></script>
</body></html>

```

## js/firebase.js

```javascript
import {firebaseConfig} from '../firebase-config.js';
let promise;
export function connect() {
  if (Object.values(firebaseConfig).some(v=>String(v).includes('REEMPLAZAR'))) throw new Error('Falta configurar Firebase. Revisa firebase-config.js y la guía de instalación.');
  if (!promise) promise = Promise.all([
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
  ]).then(([core,auth,store])=>{
    const app=core.initializeApp(firebaseConfig);
    return {auth:auth.getAuth(app), db:store.getFirestore(app), authApi:auth, storeApi:store};
  }).catch(error=>{promise=null;throw error;});
  return promise;
}

```

## js/app.js

```javascript
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

```

## admin/index.html

```html
<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Administración · Mundo Arcade</title><link rel="icon" href="../assets/medal.svg"><link rel="stylesheet" href="../styles.css"><link rel="stylesheet" href="admin.css"></head><body class="admin-body">
<header class="admin-header"><a class="brand" href="../"><span>✦</span><span>PASAPORTE<strong>MUNDO ARCADE</strong></span></a><a class="back-link" href="../">← Volver al pasaporte</a></header>
<main class="admin-main"><section id="login-view" class="admin-card login-card"><span class="admin-label">CENTRO DE CONTROL</span><h1>Administrar el aprendizaje</h1><p>Ingresa con tu cuenta autorizada para actualizar los pasaportes.</p><form id="login-form"><label for="email">Correo electrónico</label><input id="email" type="email" autocomplete="username" required><label for="password">Contraseña</label><input id="password" type="password" autocomplete="current-password" required><button class="primary" id="login-submit" type="submit">Iniciar sesión</button><button class="text-button" type="button" id="reset-password">Restablecer contraseña</button></form></section>
<section id="dashboard" hidden><div class="dashboard-heading"><div><span class="admin-label">CENTRO DE CONTROL</span><h1>El aprendizaje, al día.</h1><p id="admin-email"></p></div><button id="logout" type="button" class="secondary">Cerrar sesión</button></div>
<div class="admin-stats"><article><span>Personas publicadas</span><strong id="published-people">—</strong></article><article><span>Cursos en catálogo</span><strong id="published-courses">—</strong></article><article><span>Última publicación</span><strong class="small" id="published-date">Sin publicaciones</strong></article></div>
<div class="admin-columns"><section class="admin-card"><span class="step-label">01 / CARGAR</span><h2>Actualizar desde Excel</h2><p>Selecciona el archivo con las pestañas <b>Archivo Plano</b> e <b>Insignias</b>. Revisarás el resumen antes de publicar.</p><label class="file-drop" for="excel"><span>↥</span><strong>Seleccionar archivo Excel</strong><small>.xlsx · máximo 25 MB</small><input type="file" id="excel" accept=".xlsx"></label><p id="file-name" class="muted"></p><div id="preview" hidden><div id="import-summary" class="import-summary"></div><details><summary>Validación de datos</summary><div id="validation-report"></div></details><p class="replace-note">Cada importación reemplaza el conjunto publicado completo. Usa siempre el archivo completo, no un fragmento. Los datos actuales siguen visibles hasta terminar.</p><button id="import-button" type="button" class="primary">Importar y publicar</button></div></section>
<section class="admin-card"><span class="step-label">02 / SINCRONIZAR</span><h2>Actualizar desde Drive</h2><p>Lee el archivo configurado en Google Apps Script. Admite Excel o una hoja de Google Sheets con las mismas pestañas.</p><div class="drive-illustration" aria-hidden="true">△ <span>DRIVE → FIREBASE</span></div><button id="drive-button" class="secondary" type="button">Sincronizar archivo de Drive</button><p class="muted">La tarea continúa en segundo plano. El activador de Apps Script debe estar instalado.</p><hr><h3>Estado de la importación</h3><p id="job-state">Todavía no hay importaciones.</p><progress id="job-progress" max="100" value="0" aria-label="Avance de importación"></progress><div class="inline-actions"><button id="refresh-status" class="text-button" type="button">Actualizar estado</button><button id="cancel-job" class="text-button danger" type="button" hidden>Cancelar importación pendiente</button></div></section></div>
<section class="admin-card help-card"><h2>Cómo se interpreta el archivo</h2><ul><li>Solo se incluyen filas con <b>percAprob = 100</b>.</li><li>Una cédula + un ID de capacitación = un curso único. Se conserva la fecha de finalización más reciente.</li><li>La insignia usa la URL de la fila; si está vacía, se busca por ID en la pestaña Insignias. Las imágenes repetidas cuentan una sola vez por persona.</li><li>El avance compara los cursos únicos completados con los cursos únicos válidos de Archivo Plano. No se inventan cursos pendientes ni fotografías.</li></ul></section></section>
<p id="admin-status" role="status" aria-live="polite" class="admin-status">Conectando con Firebase…</p>
</main><script type="module" src="../js/admin.js"></script></body></html>

```

## js/admin.js

```javascript
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

```

## js/excel-worker.js

```javascript
/* La lectura de las 95.812 filas se hace fuera del hilo de la interfaz. */
importScripts('../assets/vendor/xlsx.full.min.js', './normalizer.js');
self.onmessage = function (event) {
  try {
    const book = XLSX.read(event.data, {type:'array',cellDates:true});
    for (const name of ['Archivo Plano','Insignias']) if (!book.Sheets[name]) throw new Error('Falta la pestaña "' + name + '".');
    const rows = name => XLSX.utils.sheet_to_json(book.Sheets[name], {header:1,defval:'',raw:true});
    self.postMessage({ok:true, data:ArcadeNormalizer.build(rows('Archivo Plano'),rows('Insignias'))});
  } catch (error) { self.postMessage({ok:false,error:error.message}); }
};

```

## js/normalizer.js

```javascript
/* Compartido SIN modificaciones entre navegador, pruebas y Apps Script (Normalizer.gs). */
(function (root) {
  'use strict';
  const key = v => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  function id(v) {
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v) || v < 0) return '';
      return String(v);
    }
    const s = String(v == null ? '' : v).trim();
    if (/^\d+\.0+$/.test(s)) return s.split('.')[0];
    return /^\d+$/.test(s) ? s : '';
  }
  function url(v) {
    const s = String(v || '').trim();
    return /^https:\/\/[^\s]+$/i.test(s) && s.length < 2048 ? s : '';
  }
  function date(v) {
    if (!v) return '';
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
    if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
    const s = String(v).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[0];
    const local = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    return local ? local[3] + '-' + local[2].padStart(2, '0') + '-' + local[1].padStart(2, '0') : '';
  }
  function headers(rows, required, sheet) {
    if (!rows.length) throw new Error('La pestaña ' + sheet + ' está vacía.');
    const cols = rows[0].map(key);
    const out = {};
    required.forEach(name => {
      const index = cols.indexOf(key(name));
      if (index < 0) throw new Error('Falta la columna "' + name + '" en ' + sheet + '.');
      out[name] = index;
    });
    return out;
  }
  function build(flat, badges) {
    const h = headers(flat, ['fechaInicio','ultimaAccion','fechaFinal','percAprob','capCapacitacionId','Capacitación','capUsuarioId','Nombre','Cedula','Insignia'], 'Archivo Plano');
    const b = headers(badges, ['Id','Nombre','Insignia'], 'Insignias');
    const catalog = new Map(), people = new Map(), courseIds = new Set(), catalogBadgeUrls = new Set();
    const report = { rows: 0, approved: 0, duplicates: 0, invalid: 0, notApproved: 0, missingBadge: 0, warnings: [] };
    badges.slice(1).forEach(row => {
      const courseId = id(row[b.Id]);
      if (courseId) catalog.set(courseId, {name: String(row[b.Nombre] || '').trim(), image: url(row[b.Insignia])});
    });
    flat.slice(1).forEach((row, index) => {
      if (!row.some(v => v !== '' && v != null)) return;
      report.rows++;
      const cedula = id(row[h.Cedula]), courseId = id(row[h.capCapacitacionId]);
      const name = String(row[h.Nombre] || '').trim(), title = String(row[h['Capacitación']] || '').trim();
      if (!cedula || !courseId || !name || !title || cedula.length > 20) {
        report.invalid++;
        if (report.warnings.length < 15) report.warnings.push('Fila ' + (index + 2) + ': cédula, ID, nombre o capacitación inválidos.');
        return;
      }
      courseIds.add(courseId);
      const badge = catalog.get(courseId);
      const image = url(row[h.Insignia]) || (badge ? badge.image : '');
      if (image) catalogBadgeUrls.add(image);
      const percentage = Number(String(row[h.percAprob] == null ? '' : row[h.percAprob]).trim().replace('%','').replace(',','.'));
      if (percentage !== 100) { report.notApproved++; return; }
      report.approved++;
      if (!people.has(cedula)) people.set(cedula, {cedula, name, nameDate: '', courses: new Map()});
      const person = people.get(cedula);
      const updated = date(row[h.ultimaAccion]) || date(row[h.fechaFinal]) || date(row[h.fechaInicio]);
      if (updated >= person.nameDate) { person.name = name; person.nameDate = updated; }
      const course = {id: courseId, title, date: date(row[h.fechaFinal]) || updated, image, badgeName: badge && badge.name ? badge.name : title, approval:100};
      const previous = person.courses.get(courseId);
      if (previous) {
        report.duplicates++;
        if (course.date >= previous.date) person.courses.set(courseId, {...course, image: course.image || previous.image});
        else if (!previous.image && course.image) previous.image = course.image;
      } else person.courses.set(courseId, course);
    });
    const profiles = Array.from(people.values()).map(p => {
      const courses = Array.from(p.courses.values()).sort((a,b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
      const earned = new Map();
      courses.forEach(c => {
        if (!c.image) report.missingBadge++;
        else if (!earned.has(c.image)) earned.set(c.image, {image:c.image, name:c.badgeName, date:c.date});
      });
      return {cedula:p.cedula, name:p.name, courses, badges:Array.from(earned.values())};
    }).sort((a,b) => a.cedula.localeCompare(b.cedula));
    return {profiles, report, summary:{people:profiles.length, courseCount:courseIds.size, badgeCount:catalogBadgeUrls.size, rows:report.rows, completed:profiles.reduce((n,p)=>n+p.courses.length,0)}};
  }
  root.ArcadeNormalizer = {build,id,url,date};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ArcadeNormalizer;
})(typeof globalThis !== 'undefined' ? globalThis : this);

```

## styles.css

```css
@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800;900&display=swap');
:root{--night:#071b34;--navy:#071d41;--blue:#086bcc;--cyan:#3fd5fc;--paper:#f4f1e9;--ink:#061638;--muted:#506888;--teal:#009f88;--purple:#702cda;--line:#bec6cf;--shadow:0 3px 8px #17335712;--font:'Barlow','Inter',Arial,sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:20px}body{margin:0;background:var(--night);color:var(--ink);font-family:var(--font);font-size:16px;min-height:100vh;background-image:linear-gradient(0deg,#020d1d80,transparent 70%),url('assets/arcade-world.svg');background-size:cover;background-position:center top;background-attachment:fixed}button,input{font:inherit}button,a,input{-webkit-tap-highlight-color:transparent}button{cursor:pointer}a{color:#065caa;text-decoration:none}button:disabled{cursor:wait;opacity:.6}svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}[hidden]{display:none!important}.svg-defs{position:absolute;width:0;height:0;overflow:hidden}:focus-visible{outline:3px solid #078ccf;outline-offset:4px}h1,h2,h3,p{margin-top:0}button{border:0}button,a{touch-action:manipulation}
.topbar{height:112px;background:linear-gradient(110deg,#03172eea,#031b35f5);display:flex;align-items:center;padding:0 3.2%;gap:34px;border-bottom:1px solid #3184b153;box-shadow:0 6px 24px #0010234f}.brand{color:#fff;display:flex;align-items:center;gap:17px;font-family:'Inter',sans-serif;font-weight:800;line-height:1.08;font-size:clamp(17px,1.7vw,29px);white-space:nowrap}.brand strong{display:block;color:var(--cyan);font-size:.88em}.planet{width:78px;height:78px;position:relative;display:block;color:var(--cyan);transform:rotate(-20deg)}.planet>svg{width:72px;height:72px;stroke-width:1}.orbit{position:absolute;inset:22px -10px;border:4px solid var(--cyan);border-radius:50%;transform:rotate(-21deg)}.planet>b{position:absolute;right:8px;bottom:0;font-size:28px;background:#06203d;border-radius:50%}.topbar nav{border-left:1px solid #38739070;display:flex;align-self:stretch;gap:30px;align-items:center;padding-left:34px;flex:1}.topbar nav a{position:relative;display:flex;align-items:center;gap:10px;color:#f2f7ff;white-space:nowrap;font-size:14px;font-weight:600;height:100%}.topbar nav a svg{color:#a8bdcf;width:21px}.topbar nav a:hover,.topbar nav a.active{color:var(--cyan)}.topbar nav a.active:after{content:'';height:3px;background:var(--cyan);position:absolute;bottom:25px;left:0;right:0;border-radius:3px}.nav-actions{display:flex;align-items:center;gap:15px}.login-link,.help-button{display:flex;align-items:center;justify-content:center;gap:10px;border-radius:7px;white-space:nowrap;padding:13px 20px;font-size:14px;font-weight:700}.login-link{background:linear-gradient(120deg,#f6fbff,#a2e2fd);color:#032a66;box-shadow:inset 0 1px #fff}.help-button{color:#c8eefe;background:#06213a;border:1px solid #20c8ff}.stage{padding:9px 24px 16px;perspective:2200px}.book-wrap{max-width:1370px;margin:auto;padding:10px 13px 16px;border-radius:37px 37px 26px 28px;border:1px solid #238cbd77;background:repeating-linear-gradient(40deg,#103353 0,#103353 2px,#103958 2px,#103958 4px);box-shadow:0 22px 35px #000b,0 4px 0 #031626,0 0 0 4px #072540,0 0 0 6px #3687a349,inset 0 0 0 5px #173d5a;position:relative}.book-wrap:after{content:'';position:absolute;inset:5px;border:1px dashed #5892af75;border-radius:32px;pointer-events:none}.book{position:relative;display:grid;grid-template-columns:1fr 1fr;isolation:isolate;transform-origin:center;animation:bookOpen 1s cubic-bezier(.18,.7,.26,1) both;min-height:790px;border-radius:30px 28px 22px 23px;box-shadow:0 3px 0 #c1bdb6,0 6px 0 #d3d0c9,0 9px 0 #938f86,0 14px 14px #0007}.page{position:relative;padding:29px 35px 24px;background-color:var(--paper);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.74' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23837255' opacity='.075' filter='url(%23n)' d='M0 0h180v180H0z'/%3E%3C/svg%3E");display:flex;flex-direction:column;min-width:0}.left-page{border-radius:28px 49% 0 21px / 28px 14px 0 21px;box-shadow:inset 1px 0 8px #86765525,inset -22px 0 27px -14px #5a493a6b}.right-page{border-radius:48% 28px 20px 0 / 14px 28px 20px 0;box-shadow:inset 24px 0 25px -15px #62503a66,inset -2px 0 7px #574b3420}.spine{width:12px;position:absolute;z-index:5;top:16px;bottom:0;left:50%;transform:translateX(-50%);pointer-events:none;background:linear-gradient(90deg,transparent,#5c493745 40%,#b2a184 49%,#5b493dc9 51%,#ddcdb077 60%,transparent)}.spine:after{content:'';position:absolute;inset:10px 4px;background:radial-gradient(ellipse at center,#786549 20%,#30271a 30%,transparent 44%) center top / 5px 29px repeat-y}.page-kicker{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:10px;letter-spacing:.65px;font-weight:600;color:#7b94b2;border-bottom:1px solid #a9b4c15c;padding-bottom:14px;margin-bottom:17px;min-height:40px}.page-kicker>span{display:flex;align-items:center;gap:9px}.page-kicker svg{width:27px;height:27px;stroke-width:1.1}.intro{position:relative}.intro h1{position:relative;font-family:'Inter',sans-serif;font-size:clamp(35px,3.15vw,53px);font-weight:800;line-height:1.01;letter-spacing:-1.9px;margin:0 0 14px;z-index:1}.intro h1 span{color:#0576a6}.intro p{font-size:15px;line-height:1.4;color:#3a527a;margin:0 0 17px;max-width:96%}.passport-stamp{position:absolute;right:-9px;top:13px;display:flex;gap:9px;align-items:center;border:4px double #86adca;border-radius:12px;padding:11px 9px;transform:rotate(-13deg);color:#7099b8;opacity:.46;font-size:11px;line-height:1.23;font-weight:700}.passport-stamp svg{width:38px;height:44px}.search-panel{display:flex;align-items:flex-start;gap:18px;background:linear-gradient(140deg,#fff,#f1f4f7cf);border:1px solid #fff;border-radius:23px;padding:16px 17px 17px 22px;box-shadow:0 4px 8px #6d777e25,0 0 0 1px #cdd3d050}.id-icon{display:flex;align-items:center;justify-content:center;width:62px;height:62px;flex-shrink:0;background:linear-gradient(135deg,#d4efff,#9ed4fc);color:#0065c8;font-size:49px;border-radius:10px;line-height:1}.search-fields{flex:1;min-width:0}.search-fields label{font-weight:600;display:block;font-size:15px;margin-bottom:9px}.input-wrap{position:relative}.input-wrap input{width:100%;height:43px;border-radius:8px;border:1px solid #abc1d6;padding:9px 36px 9px 13px;background:#ffffffee;color:var(--ink);font-weight:500;box-shadow:inset 0 1px 3px #56768c18}.input-wrap button{position:absolute;right:9px;top:10px;border-radius:50%;width:22px;height:22px;line-height:18px;font-size:19px;padding:0;color:#fff;background:#9babbe}.primary{background:linear-gradient(#0c70d7,#064a98);border:1px solid #0754a3;border-radius:8px;box-shadow:0 3px 0 #073d72,0 6px 7px #0c5e9e26;color:#fff;font-weight:600;min-height:47px;display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 16px;transition:filter .2s,transform .2s}.primary:hover{filter:brightness(1.1)}.primary:active{transform:translateY(2px)}.search-fields .primary{width:100%;margin-top:8px}.primary svg{width:22px;height:22px}.status-line{font-size:12px;color:#58718b;min-height:17px;margin:9px 5px 10px}.status-line.error{color:#b2233a}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 13px}.section-heading h2{font-size:20px;letter-spacing:-.45px;display:flex;align-items:center;gap:10px;margin:0;font-weight:700}.section-heading h2 svg{width:25px;height:25px;stroke-width:2}.small-caption{font-size:9px;letter-spacing:.65px;font-weight:600;color:#7992b1;text-align:right}.course-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.course-card{grid-column:span 2;display:flex;gap:12px;text-align:left;padding:13px 11px 12px;background:linear-gradient(130deg,#fff,#f8fafbea);border:1px solid #e1e5e8;border-radius:12px;box-shadow:var(--shadow);min-height:126px;color:var(--ink);transition:transform .22s,box-shadow .22s}.course-card:nth-child(5n + 4),.course-card:nth-child(5n + 5){grid-column:span 3}.course-card:hover{transform:translateY(-5px);box-shadow:0 9px 17px #17335725}.course-icon{width:47px;height:54px;display:grid;place-items:center;font-size:32px;flex-shrink:0;background:#fff0d5;border-radius:9px}.course-card:nth-child(3n+2) .course-icon{background:#d8f0ff}.course-card:nth-child(3n) .course-icon{background:#ffe1e5}.course-body{display:flex;flex-direction:column;align-items:flex-start;flex:1;min-width:0}.course-body h3{font-size:13px;line-height:1.23;margin-bottom:7px;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.complete{font-size:10px;color:#007f6b;background:#c9f3e7;border-radius:5px;padding:5px 7px;font-weight:600;white-space:nowrap;display:inline-block}.course-date{display:flex;align-items:center;justify-content:space-between;gap:5px;font-size:10px;color:#517398;margin-top:auto;padding-top:12px;width:100%}.course-date b{font-size:23px;line-height:10px;color:#052358;font-weight:400}.text-button{color:#0566b5;padding:9px 0 0;background:transparent;font-weight:600;font-size:13px;display:block;margin-left:auto}.page-footer{display:flex;justify-content:space-between;padding-top:21px;margin-top:auto;font-size:9px;letter-spacing:1px;color:#94a1b1}.right-kicker{margin-bottom:13px}.right-kicker .my-passport{color:var(--ink);font-size:15px;letter-spacing:0;font-weight:700}.right-kicker .my-passport svg{width:23px;height:23px;fill:var(--ink);stroke-width:0}.right-kicker>span:nth-child(2){font-size:9px;gap:3px}.barcode{display:inline-block;width:69px;height:18px;margin-left:15px;background:repeating-linear-gradient(90deg,#6980a4 0,#6980a4 1px,transparent 1px,transparent 3px,#6980a4 3px,#6980a4 5px,transparent 5px,transparent 7px);opacity:.65}.profile-card{display:flex;align-items:center;position:relative;padding:17px 18px;gap:20px;border:1px solid #d9dce1;border-radius:18px;background:linear-gradient(130deg,#fff5,#f1f4f559);min-height:181px;margin-bottom:17px;overflow:hidden}.profile-card:after{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-radial-gradient(ellipse at 90% 50%,transparent 0,transparent 9px,#729cc90b 10px,transparent 11px);mask-image:linear-gradient(90deg,transparent 30%,black)}.avatar{width:112px;height:132px;object-fit:cover;border-radius:8px;flex-shrink:0}.profile-info{flex:1;min-width:0;z-index:1}.profile-info h2{font-size:21px;letter-spacing:-.4px;line-height:1.14;margin:0 0 5px;font-weight:700}.profile-info>p:not(.eyebrow){font-size:14px;color:#46608b;margin:0 0 10px}.eyebrow{font-size:8px;letter-spacing:1px;color:#859db7;margin:0 0 7px}.player-badge{color:#fff;background:linear-gradient(145deg,#9e49f1,#5721bc);border-radius:7px;padding:9px 12px;font-size:12px;font-weight:600;display:inline-flex;gap:8px;box-shadow:inset 0 1px #c29ff3}blockquote{margin:13px 0 0;font-size:12px;color:#617899;font-style:italic;line-height:1.3}.round-stamp{border:3px double #7892b2;flex-shrink:0;border-radius:50%;width:121px;height:121px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#7290b4;opacity:.8;transform:rotate(15deg);z-index:1;box-shadow:0 0 0 6px #87a6c213}.round-stamp>span{font-size:12px;font-weight:700;letter-spacing:1px}.round-stamp svg{width:54px;height:54px;stroke-width:1.2}.round-stamp small{font-size:7px;line-height:1.2;text-align:center;font-weight:700}.teal{color:#067578}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metric{border:1px solid #ffffffd9;border-radius:11px;padding:15px 10px 12px;min-height:151px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center}.mint{background:linear-gradient(135deg,#def4edee,#d2f2e9c9);--metric-color:#009f88}.lilac{background:linear-gradient(135deg,#eee5ff,#e9dffbcc);--metric-color:#7629cc}.blue{background:linear-gradient(135deg,#e4f3ff,#cceaf9);--metric-color:#0764cf}.aqua{background:linear-gradient(135deg,#def5ef,#d9eff1);--metric-color:#008e86}.metric h3{font-size:12px;line-height:1.2;font-weight:600;margin-bottom:7px;min-height:28px}.metric>strong{font-size:40px;line-height:1.15;color:var(--metric-color);font-weight:700}.metric>strong.level-text{font-size:20px;overflow-wrap:anywhere}.metric p{font-size:11px;margin:5px 0 0;color:var(--metric-color)}.progress-ring{--progress:0;background:conic-gradient(#00aa95 calc(var(--progress)*1%),#b8d8d6 0);border-radius:50%;width:86px;height:86px;display:grid;place-items:center;position:relative;box-shadow:inset 1px 0 2px #007c78}.progress-ring:before{content:'';position:absolute;inset:9px;background:#e3f4ef;border-radius:50%;box-shadow:0 0 0 2px #fff}.progress-ring span{position:relative;font-size:21px;font-weight:700;color:#005561}.metric-note{font-size:10px;color:#7c8c9e;margin:7px 1px 13px}.badge-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.badge-card{border:1px solid #e2e5e9;background:linear-gradient(#fffffffa,#f5f8f9d9);border-radius:12px;text-align:center;padding:8px 7px 12px;display:flex;flex-direction:column;align-items:center;min-height:190px;animation:badgePop .6s cubic-bezier(.2,1.5,.4,1) both;animation-delay:calc(var(--i,0)*60ms);overflow:hidden}.badge-image{position:relative;width:78px;height:85px;display:grid;place-items:center;overflow:hidden;border-radius:10px;margin-bottom:3px}.badge-image img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 3px 1px #0002)}.badge-image:after{content:'';position:absolute;inset:-50% -60%;background:linear-gradient(100deg,transparent 35%,#ffffffa8 49%,transparent 60%);transform:translateX(-100%) rotate(15deg);animation:shine 5.5s ease-in-out infinite;animation-delay:calc(var(--i,0)*.4s);pointer-events:none}.badge-card h3{font-size:12px;line-height:1.2;margin:4px 0 8px;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.badge-card p{font-size:11px;line-height:1.25;color:#476385;margin-bottom:8px}.badge-card time{font-size:9px;color:#6484a9;margin-top:auto}.empty-card{grid-column:1/-1;min-height:216px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;border:1px dashed #a7b9c9;border-radius:14px;color:#657e96;padding:25px;background:#fff5}.empty-card svg{width:38px;height:38px;color:#5499b9;margin:0 0 12px}.empty-card h3{font-size:17px;color:#294867;margin-bottom:8px}.empty-card p{font-size:13px;max-width:310px;margin:0;line-height:1.4}.empty-badges{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:22px;min-height:193px;border:1px dashed #bdc5cc;border-radius:14px;color:#395a77;background:#ffffff30}.empty-badges img{width:84px;opacity:.68;filter:saturate(.6)}.empty-badges p{margin:0;font-size:16px;line-height:1.6}.empty-badges span{font-size:12px;color:#74879d}.site-note{display:flex;align-items:center;justify-content:center;gap:20px;text-align:center;color:#b4d1e4;font-size:11px;letter-spacing:.7px;margin:21px 0 0}.site-note span{color:var(--cyan)}.site-note a{color:#a4e7fc;letter-spacing:0;text-decoration:underline}.demo-notice{max-width:900px;margin:0 auto 12px;padding:8px 18px;text-align:center;color:#d4f4ff;background:#064977;border:1px solid #1d82a6;border-radius:6px;font-size:11px;letter-spacing:1px}.demo-notice a{color:#fff;margin-left:15px;text-decoration:underline}.book.turning .right-page{animation:pageTurn .6s ease both;transform-origin:left center;backface-visibility:hidden}.book.loading{filter:saturate(.7)}dialog{border:1px solid #a9c5d5;border-radius:20px;max-width:530px;width:calc(100% - 36px);padding:35px;background:#faf8f1;color:var(--ink);box-shadow:0 30px 100px #0008}dialog::backdrop{background:#001126b8;backdrop-filter:blur(6px)}dialog h2{padding-right:20px;font-size:25px}dialog p,dialog li{line-height:1.5;font-size:15px;color:#4c627a}dialog li{margin-bottom:8px}.dialog-close{position:absolute;right:14px;top:12px;background:#e2e9ec;border-radius:50%;width:30px;height:30px;color:#30516b;font-size:24px}.detail-image{width:100px;height:100px;object-fit:contain;display:block;margin:0 auto 20px}
@keyframes bookOpen{0%{opacity:0;transform:rotateX(13deg) rotateY(-12deg) scale(.94)}100%{opacity:1;transform:rotateX(0) rotateY(0) scale(1)}}@keyframes pageTurn{0%{transform:rotateY(0);filter:brightness(1)}45%{transform:rotateY(-18deg);filter:brightness(.9)}100%{transform:rotateY(0);filter:brightness(1)}}@keyframes badgePop{0%{opacity:0;transform:scale(.65) translateY(10px)}100%{opacity:1;transform:scale(1) translateY(0)}}@keyframes shine{0%,64%{transform:translateX(-110%) rotate(15deg)}85%,100%{transform:translateX(110%) rotate(15deg)}}
@media(min-width:1650px){.stage{padding-top:14px}.book-wrap{max-width:1450px}.book{min-height:810px}.page{padding:30px 35px 24px}.intro h1{font-size:55px}.profile-card{min-height:192px}.course-card{min-height:138px}.badge-card{min-height:209px}}
@media(max-width:1450px){.topbar{gap:24px;padding:0 2%;height:99px}.topbar nav{gap:22px;padding-left:23px}.topbar nav a{font-size:12px;gap:7px}.planet{width:63px;height:66px}.planet>svg{width:60px;height:60px}.login-link,.help-button{padding:11px 14px;font-size:12px}.book-wrap{max-width:1240px}.page{padding:25px 27px 21px}.passport-stamp{right:-6px;transform:rotate(-13deg) scale(.8);transform-origin:top right}.intro p{font-size:14px}.course-card{gap:8px;padding:11px 9px}.course-icon{width:38px;height:46px;font-size:27px}.course-body h3{font-size:12px}.round-stamp{width:99px;height:99px}.round-stamp>span{font-size:9px}.round-stamp svg{width:41px;height:41px}.profile-card{gap:14px;padding:15px 14px}.avatar{width:96px;height:120px}.profile-info h2{font-size:19px}.badge-image{width:67px;height:76px}.small-caption{font-size:8px}.right-kicker>span:nth-child(2){font-size:8px}.barcode{width:42px;margin-left:8px}.book{min-height:760px}}
@media(max-width:1180px){.topbar nav a{font-size:0;gap:0}.topbar nav a svg{width:24px;height:24px}.topbar nav{justify-content:space-around;gap:20px}.page{padding:25px 20px 20px}.round-stamp{display:none}.intro h1{font-size:38px}.passport-stamp{display:none}.profile-card{min-height:182px}.profile-info h2{font-size:21px}.course-grid{grid-template-columns:1fr 1fr}.course-card,.course-card:nth-child(5n+4),.course-card:nth-child(5n+5){grid-column:span 1}.course-card:last-child:nth-child(odd){grid-column:span 2}.course-body h3{font-size:13px}.badge-grid{grid-template-columns:repeat(3,1fr)}.badge-card{min-height:182px}.metric{padding:13px 6px}.metric h3{font-size:11px}.progress-ring{width:72px;height:72px}.metric>strong.level-text{font-size:16px}.page-kicker>span:nth-child(2){display:none}.section-heading .small-caption{display:none}}
@media(max-width:850px){.topbar{height:85px;gap:14px;padding:0 20px}.brand{font-size:20px}.topbar nav{display:none}.nav-actions{margin-left:auto}.help-button span{display:none}.help-button{font-size:22px;padding:8px 12px}.stage{padding:15px 16px 24px}.book{grid-template-columns:1fr;min-height:0}.book-wrap{max-width:680px;padding:8px 8px 13px;border-radius:27px}.book-wrap:after{border-radius:23px}.page{padding:26px 28px}.left-page{border-radius:21px 21px 0 0;box-shadow:inset -3px 0 10px #76674920}.right-page{border-radius:0 0 19px 19px;box-shadow:inset -3px 0 10px #76674920;border-top:2px dashed #b4a996}.spine{display:none}.intro h1{font-size:48px}.intro p{font-size:15px}.passport-stamp{display:flex}.page-kicker>span:nth-child(2){display:flex}.profile-card{min-height:171px}.round-stamp{display:flex;width:110px;height:110px}.badge-grid{grid-template-columns:repeat(5,1fr)}.badge-card{min-height:185px}.course-grid{grid-template-columns:repeat(6,1fr)}.course-card{grid-column:span 2}.course-card:nth-child(5n+4),.course-card:nth-child(5n+5){grid-column:span 3}.course-card:last-child:nth-child(odd){grid-column:span 3}.metric>strong.level-text{font-size:20px}.progress-ring{width:82px;height:82px}.metrics{gap:10px}.book.turning .right-page{animation:none}.site-note{flex-wrap:wrap;gap:9px}.site-note a{flex-basis:100%}}
@media(max-width:520px){.topbar{height:76px;padding:0 13px;gap:10px}.brand{gap:10px;font-size:17px}.planet{width:45px;height:47px}.planet>svg{width:44px;height:44px}.orbit{border-width:2px;inset:14px -5px}.planet>b{font-size:20px;right:0}.login-link{padding:10px;font-size:0;gap:0}.login-link svg{width:21px;height:21px}.nav-actions{gap:8px}.help-button{padding:6px 9px}.stage{padding:11px 9px 23px}.book-wrap{padding:6px 5px 12px;border-radius:24px}.page{padding:23px 17px 19px}.intro h1{font-size:39px;letter-spacing:-1.7px;line-height:1.07}.intro p{font-size:13px;line-height:1.4}.passport-stamp{display:none}.page-kicker{font-size:9px;margin-bottom:19px}.page-kicker>span:nth-child(2){display:none}.search-panel{padding:14px;gap:10px;border-radius:16px}.id-icon{width:39px;height:43px;font-size:32px}.search-fields label{font-size:13px}.input-wrap input{font-size:16px}.primary{font-size:13px}.course-grid{grid-template-columns:1fr 1fr}.course-card,.course-card:nth-child(5n+4),.course-card:nth-child(5n+5),.course-card:last-child:nth-child(odd){grid-column:span 1;gap:7px;padding:10px 8px;min-height:145px;flex-direction:column}.course-card:last-child:nth-child(odd){grid-column:span 2;flex-direction:row;min-height:103px}.course-icon{width:40px;height:41px;font-size:26px}.course-body{width:100%}.course-body h3{font-size:12px}.course-date{font-size:10px}.section-heading h2{font-size:19px}.profile-card{padding:13px 10px;gap:13px;min-height:160px}.avatar{width:80px;height:112px}.profile-info h2{font-size:19px}.profile-info>p:not(.eyebrow){font-size:12px}.player-badge{font-size:11px;padding:7px 10px}.round-stamp{display:none}blockquote{font-size:11px}.metrics{gap:7px;grid-template-columns:repeat(2,1fr)}.metric{min-height:143px;padding:12px}.metric h3{font-size:12px}.badge-grid{grid-template-columns:repeat(3,1fr);gap:6px}.badge-card{padding:8px 5px;min-height:186px}.badge-image{width:70px;height:80px}.badge-card h3{font-size:11px}.badge-card p{font-size:10px}.page-footer{font-size:8px}.empty-badges{padding:15px;gap:14px;min-height:155px}.empty-badges img{width:65px}.empty-badges p{font-size:14px}.empty-badges span{font-size:11px}.status-line{font-size:11px}.wide-only{display:none}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}

```

## admin/admin.css

```css
.admin-body{background:#071b34;background-image:radial-gradient(ellipse at 10% 0,#123f62,transparent 70%);min-height:100vh}.admin-header{height:96px;display:flex;justify-content:space-between;align-items:center;max-width:1150px;margin:auto;padding:0 25px;border-bottom:1px solid #ffffff25}.admin-header .brand{font-size:22px;gap:15px}.admin-header .brand>span:first-child{font-size:45px;color:#39d4ff}.back-link{color:#bae5fb;font-size:14px}.admin-main{max-width:1100px;margin:45px auto;padding:0 22px 50px}.admin-card{background:#f7f8f8;border-radius:17px;padding:30px;color:#132b48;box-shadow:0 10px 28px #0002;min-width:0}.login-card{max-width:470px;margin:65px auto}.admin-label,.step-label{display:block;color:#128eae;font-size:11px;letter-spacing:2px;font-weight:700;margin-bottom:15px}.admin-card h1{font-size:32px;letter-spacing:-1px;line-height:1.1;margin-bottom:16px}.admin-card p{font-size:14px;line-height:1.5;color:#5c6c7d}.admin-card label:not(.file-drop){display:block;font-size:14px;font-weight:600;margin-bottom:8px}.admin-card input:not([type=file]){width:100%;border:1px solid #b4c7d8;border-radius:7px;padding:11px;background:#fff;font-size:16px;margin-bottom:19px}.login-card .primary{width:100%;margin-top:10px}.login-card .text-button{margin:15px auto 0}.admin-status{max-width:1000px;margin:22px auto;background:#123551;color:#d8edf7;padding:16px 20px;border-radius:9px;font-size:14px;overflow-wrap:anywhere;line-height:1.5}.admin-status.error{background:#4d2238;color:#ffccd2}.dashboard-heading{display:flex;justify-content:space-between;align-items:center;gap:15px;color:#f0f6fb;margin-bottom:25px}.dashboard-heading h1{font-size:35px;margin-bottom:7px;letter-spacing:-.8px}.dashboard-heading p{color:#96b3cd;font-size:14px;margin:0}.dashboard-heading .admin-label{color:#43c9e7;margin-bottom:10px}.secondary{padding:11px 18px;border:1px solid #b1c7d8;background:#e9f4fc;color:#155581;border-radius:8px;font-weight:600;font-size:14px;min-height:44px}.secondary:hover{background:#d6efff}.admin-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:17px;margin:25px 0}.admin-stats article{padding:20px 25px;background:#11324d;border:1px solid #29506a;border-radius:12px}.admin-stats span{display:block;color:#a2bacf;font-size:12px;margin-bottom:10px}.admin-stats strong{font-size:32px;color:#fff}.admin-stats strong.small{font-size:17px}.admin-columns{display:grid;grid-template-columns:1.1fr 1fr;gap:22px}.admin-card h2{font-size:24px;letter-spacing:-.5px;margin-bottom:13px}.admin-card h3{font-size:17px;margin-bottom:10px}.file-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border:2px dashed #a5c3d5;background:#edf6fa;border-radius:12px;padding:20px;cursor:pointer;text-align:center}.file-drop>span{font-size:36px;color:#268cb6}.file-drop strong{font-size:16px}.file-drop small{font-size:12px;color:#67869d}.file-drop input{max-width:100%;font-size:12px;margin-top:10px}.muted{font-size:12px!important;color:#718597!important;margin-top:13px}.import-summary{padding:15px;background:#e4f5ee;border:1px solid #a0d3c2;border-radius:9px;font-size:14px;line-height:1.7;margin-bottom:13px}.import-summary b{color:#087960}details{font-size:13px;line-height:1.7}summary{cursor:pointer;color:#17648c}#validation-report{padding:10px 0;font-size:12px}.replace-note{font-size:12px!important;background:#fff2d4;border-left:3px solid #d0a747;padding:12px;margin:15px 0}.drive-illustration{display:flex;align-items:center;justify-content:center;font-size:60px;color:#0a957c;gap:18px;background:#e8f2ed;border-radius:12px;margin:20px 0;padding:15px}.drive-illustration span{font-size:11px;color:#466f65;letter-spacing:1px}.admin-card hr{border:0;border-top:1px solid #d4dfe6;margin:27px 0}.inline-actions{display:flex;align-items:center;justify-content:space-between;gap:15px}.inline-actions .text-button{margin:8px 0}.danger{color:#aa2648}progress{width:100%;height:12px;accent-color:#079d90}.help-card{margin-top:22px}.help-card ul{padding-left:20px;font-size:14px;line-height:1.65;color:#536b80}.help-card li{margin-bottom:6px}@media(max-width:700px){.admin-columns{grid-template-columns:1fr}.admin-stats{grid-template-columns:1fr 1fr}.admin-stats article:last-child{grid-column:1/-1}.admin-main{margin-top:26px;padding:0 15px 30px}.admin-card{padding:23px}.dashboard-heading h1{font-size:27px}.dashboard-heading{align-items:flex-start;flex-direction:column}.admin-header{padding:0 17px;height:85px}.admin-header .brand{font-size:17px}.back-link{font-size:11px}.login-card{margin:30px auto}.admin-header .brand>span:first-child{display:none}}

```

## assets/arcade-world.svg

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1100" viewBox="0 0 1920 1100">
<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#0a2d51"/><stop offset=".55" stop-color="#4389b7"/><stop offset="1" stop-color="#06162c"/></linearGradient><linearGradient id="mount" x2="1" y2="1"><stop stop-color="#81b6cc"/><stop offset="1" stop-color="#123e68"/></linearGradient><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#b3ecff" stroke-opacity=".06"/></pattern></defs>
<path fill="url(#sky)" d="M0 0h1920v1100H0z"/><path fill="url(#grid)" d="M0 0h1920v1100H0z"/>
<g fill="#bce5ee" opacity=".65"><path d="M0 360h20v-16h18v16h17v16h28v18h50v18H0zM0 460h28v-14h35v-22h28v22h48v18h75v21H0z"/><path d="M1750 330h42v-20h22v-15h25v20h45v22h36v18h-170z"/></g>
<path fill="url(#mount)" d="M0 417l80 111 65-55 162 225 108-136 125 190 130-188 144 229H0z"/><path fill="#416e8b" d="M0 440l80 88 63-55-32 142 76 113H0z"/><path fill="#b9c9c6" opacity=".7" d="M143 473l38 75-35-16-35 83z"/>
<g fill="#234b69"><path d="M0 688h30V568h23v-26h42v26h21v125h43v-73h48v120H0zM1650 635l72-40 32 30 66-118 100 131v190h-270z"/></g>
<g fill="#ddb992" opacity=".8"><path d="M29 588h14v18H29zm29 0h12v18H58zm-29 38h14v18H29zm29 0h12v18H58zm30 56h12v18H88zm-30-18h12v18H58z"/></g>
<path fill="#122c42" d="M0 830l164-84 86 20 150-42 164 95 178-14 143 84 171-66 225 12 191-95 152 25 296-92v427H0z"/><path fill="#081a2c" d="M0 974l174-118 278 95 186-17 189 82 243-96 239 37 155-34 238-92 218 31v238H0z"/>
<g transform="translate(57 621) scale(3.1)" shape-rendering="crispEdges"><path fill="#1c2130" d="M16 0h19v4h7v18h-5v8H19v-4h-5V8h2z"/><path fill="#edb17e" d="M23 15h13v4h6v11h-7v7H23z"/><path fill="#35283a" d="M18 5h19v13H26v7h-9z"/><path fill="#193f59" d="M19 36h17v31H16z"/><path fill="#387b9c" d="M13 35h10v27H12z"/><path fill="#e6b785" d="M34 41h5l5 19-7 3-5-13z"/><path fill="#08283f" d="M8 37h11v6h4v20H6V43h2z"/><path fill="#157baf" d="M8 44h12v15H8z"/><path fill="#d8ac4d" d="M7 46h4v3H7z"/><path fill="#233047" d="M17 65h11v16l-8 15-7-4 7-19zm12 0h8l3 16 12 5-5 8-16-9z"/><path fill="#112332" d="M12 89l9 4-3 6H6v-5zm29-3 11 0 5 10H46z"/></g>
<g transform="translate(1803 402)" stroke="#071e35" fill="none" opacity=".7"><circle r="100" stroke-width="5"/><circle r="85" stroke-width="2"/><path d="M0-110V110M-110 0H110M-70-70L70 70M70-70L-70 70"/><path d="M0-75 17-17 75 0 17 17 0 75-17 17-75 0-17-17Z" stroke-width="3"/><path fill="#11385b" d="M0-75 17-17 0 0-17 17zM75 0 17 17 0 0-17-17z"/></g>
<g fill="#dbf3ff" font-family="Arial,sans-serif" font-size="17" letter-spacing="5" opacity=".68"><text x="46" y="200">APRENDER</text><text x="46" y="235">TAMBIÉN</text><text x="46" y="270">TE LLEVA</text><text x="46" y="305">MUY LEJOS</text></g>
</svg>

```

## assets/avatar.svg

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="280" viewBox="0 0 240 280"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="#b6e7fc"/><stop offset="1" stop-color="#70b8e4"/></linearGradient><linearGradient id="s" x2=".8" y2="1"><stop stop-color="#ffcf9a"/><stop offset="1" stop-color="#d68d5f"/></linearGradient><linearGradient id="j" x2="1" y2="1"><stop stop-color="#1e5b87"/><stop offset="1" stop-color="#082a4c"/></linearGradient></defs><rect width="240" height="280" rx="18" fill="url(#b)"/><ellipse cx="121" cy="280" rx="98" ry="82" fill="url(#j)"/><path d="M94 181v32l28 22 29-22v-37" fill="url(#s)"/><path d="M94 205l27 30-29 13-15-34zm57 0-30 30 29 13 14-35z" fill="#397493"/><path d="M123 235v45" stroke="#96acc0"/><circle cx="132" cy="252" r="2" fill="#b6e7fc"/><ellipse cx="66" cy="133" rx="14" ry="23" fill="#dc976c"/><ellipse cx="178" cy="133" rx="14" ry="23" fill="#dc976c"/><path d="M68 89q0-48 54-48t55 48v69q-6 47-54 47-45-2-55-48z" fill="url(#s)"/><path d="M67 126Q40 45 94 42q33-39 52-15 25-12 32 18 15 31 0 72l-13-37q-21 12-46-2-18 12-37 9l-9 40z" fill="#282832"/><path d="M85 54q23-9 33-22 21 18 39 5" fill="none" stroke="#454049" stroke-width="9" stroke-linecap="round"/><path d="M82 112q12-8 23-1m34 0q12-8 24 0" stroke="#42332d" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="96" cy="131" rx="8" ry="11" fill="#fff"/><ellipse cx="150" cy="131" rx="8" ry="11" fill="#fff"/><ellipse cx="98" cy="133" rx="5" ry="8" fill="#30333c"/><ellipse cx="148" cy="133" rx="5" ry="8" fill="#30333c"/><path d="M120 136l-6 18h15" fill="none" stroke="#c1835d" stroke-width="3" stroke-linecap="round"/><path d="M100 171q24 24 47-3" fill="#fff" stroke="#a76550" stroke-width="3" stroke-linejoin="round"/><path d="M45 256v24m150-25v25" stroke="#0c2945" stroke-width="3"/></svg>

```

## assets/medal.svg

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="130" viewBox="0 0 120 130"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#fff0a0"/><stop offset=".5" stop-color="#e3a32c"/><stop offset="1" stop-color="#87510d"/></linearGradient><linearGradient id="b" x2="1" y2="1"><stop stop-color="#1889b4"/><stop offset="1" stop-color="#073055"/></linearGradient></defs><path d="M60 6 108 32v58l-48 29L12 90V32Z" fill="url(#g)" stroke="#3b5365" stroke-width="3"/><path d="M60 15 99 37v48l-39 23-39-23V37Z" fill="url(#b)" stroke="#fff1a5" stroke-width="2"/><path d="m60 30 9 22 24 2-18 16 6 23-21-12-21 12 6-23-18-16 24-2z" fill="url(#g)" stroke="#703e0b" stroke-width="2"/></svg>

```

## .gitignore

```text
node_modules/
*.xlsx
*.xls
*.csv
*service-account*.json
.env*
.local/

```

## package.json

```json
{"name":"pasaporte-mundo-arcade","version":"1.0.0","private":true,"scripts":{"test":"node --test tests/*.test.cjs","check":"node tests/check-syntax.cjs","serve":"python3 -m http.server 8080"}}

```
