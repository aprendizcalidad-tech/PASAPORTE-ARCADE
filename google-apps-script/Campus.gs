/* Escuelas y caché pública. Ninguna sesión ni respuesta correcta se guarda en esta caché. */
function defaultSchools_(){return ['Liderazgo','Calidad','SST','Servicio','Procesos','Cultura organizacional'].map((name,i)=>({id:'school-'+i,name,icon:['◎','◇','✚','♡','▤','◈'][i],description:'',image:'',order:i,deleted:false}));}
function schools_(){return rows_('Schools').filter(s=>!s.deleted).sort((a,b)=>(a.order||0)-(b.order||0)||a.name.localeCompare(b.name));}
function courseSchool_(c){const s=schools_().find(s=>c.schoolId?s.id===c.schoolId:s.name===c.school);return {...c,schoolId:s?s.id:c.schoolId||'',school:s?s.name:c.school};}
function imageValue_(value){const image=String(value||'').trim();need_(image.length<=18000,'La imagen es demasiado grande. Usa la opción de cargar portada para optimizarla.');need_(!image||/^https:\/\/[a-z0-9.-]+(?::443)?(?:[/?#][^\s<>"']*)?$/i.test(image)||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image),'Usa una imagen JPG, PNG, WebP o una dirección HTTPS pública.');return image;}
function saveSchool_(p){const all=schools_(),name=txt_(p.name,80),old=p.id?get_('Schools',p.id):null;need_(name,'Indica el nombre de la escuela.');need_(!p.id||old&&!old.deleted,'La escuela ya no existe.');need_(!all.some(s=>s.id!==p.id&&s.name.toLowerCase()===name.toLowerCase()),'Ya existe una escuela con ese nombre.');if(old)need_(p.updated===old.updated,'Otra persona actualizó esta escuela. Recarga antes de editar.');need_(Number.isFinite(+p.order)&&+p.order>=0&&+p.order<=999,'El orden debe estar entre 0 y 999.');return put_('Schools',{id:old?old.id:uid_(),name,description:txt_(p.description,1000),icon:txt_(p.icon,4)||'◇',image:imageValue_(p.image),order:+p.order,updated:now_(),deleted:false});}
function deleteSchool_(p){const s=get_('Schools',p.id);need_(s&&!s.deleted,'Escuela inexistente.');need_(p.updated===s.updated,'La escuela cambió. Recarga antes de eliminar.');need_(!rows_('Courses').some(c=>!c.deleted&&(c.schoolId===s.id||!c.schoolId&&c.school===s.name)),'Esta escuela tiene cursos, incluidos borradores. Cambia primero la escuela de esos cursos para poder eliminarla.');put_('Schools',{...s,deleted:true,updated:now_()});return true;}
function invalidateCatalog_(){PropertiesService.getScriptProperties().setProperty('CATALOG_REVISION',uid_());}
function publicCatalog_(){return {settings:settings_(),schools:schools_(),courses:rows_('Courses').filter(c=>c.published).map(publicCourse_),routes:rows_('Routes').filter(x=>x.published)};}
function cachedCatalog_(){
 const rev=prop_('CATALOG_REVISION')||'v3',key='public-catalog-v3:'+rev;let cache=null;
 try{cache=CacheService.getScriptCache();const manifest=JSON.parse(cache.get(key)||'null');if(manifest){const keys=Array.from({length:manifest.count},(_,i)=>manifest.prefix+i),parts=cache.getAll(keys);if(keys.every(k=>typeof parts[k]==='string'))return JSON.parse(keys.map(k=>parts[k]).join(''));}}catch(ignore){}
 const value=publicCatalog_();
 try{if(cache){const json=JSON.stringify(value),count=Math.ceil(json.length/24000);if(count<=60){const prefix=key+':'+uid_()+':',parts={};for(let i=0;i<count;i++)parts[prefix+i]=json.slice(i*24000,(i+1)*24000);cache.putAll(parts,120);cache.put(key,JSON.stringify({prefix,count}),90);}}}catch(ignore){}
 return value;
}
// Ejecutar UNA vez al actualizar. Idempotente: conserva datos, cursos y certificados.
function actualizarCampusV3(){const lock=LockService.getScriptLock();need_(lock.tryLock(5000),'Hay un guardado en curso. Vuelve a ejecutar la actualización.');try{resetRequest_();const db=db_();if(!db.getSheetByName('Schools'))db.insertSheet('Schools').appendRow(['id','data_json']).setFrozenRows(1);delete requestTables_.Schools;
 if(!prop_('SCHOOLS_MIGRATED_V3')){
  if(!rows_('Schools').length)defaultSchools_().forEach(s=>put_('Schools',{...s,updated:now_()}));
  for(const c of rows_('Courses')){let s=schools_().find(s=>c.schoolId?s.id===c.schoolId:s.name.toLowerCase()===String(c.school||'Sin clasificar').toLowerCase());if(!s)s=put_('Schools',{id:uid_(),name:c.school||'Sin clasificar',icon:'◇',description:'',image:'',order:schools_().length,updated:now_(),deleted:false});if(c.schoolId!==s.id)put_('Courses',{...c,schoolId:s.id});}
  PropertiesService.getScriptProperties().setProperty('SCHOOLS_MIGRATED_V3','1');
 }
 invalidateCatalog_();console.log('Campus V3 listo: '+db.getUrl()+'. Escuelas: '+schools_().length);
 }finally{lock.releaseLock();}}
