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
