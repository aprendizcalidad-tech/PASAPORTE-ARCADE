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
