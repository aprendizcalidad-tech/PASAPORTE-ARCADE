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
