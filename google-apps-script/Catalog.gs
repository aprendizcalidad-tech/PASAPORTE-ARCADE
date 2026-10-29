/* Actualizaciones editoriales separadas de las publicaciones completas de Excel. */
function catalog_(){return fsGet_('public/catalog')||{revision:0,courses:[]};}
function checkRevision_(previous,revision){
  if(!Number.isSafeInteger(revision)||revision!==(previous.revision||0))throw new Error('Los datos cambiaron en otra sesión. Vuelve a cargar antes de guardar.');
}
function numericId_(v){if(typeof v!=='string'||!/^\d{1,20}$/.test(v))throw new Error('Usa un ID numérico de hasta 20 dígitos.');return v;}
function textField_(v,max,label){if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error(label+' inválido.');return v.trim();}
function validDate_(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)throw new Error('Fecha de aprobación inválida.');
  return v;
}
function sized_(data){if(Utilities.newBlob(JSON.stringify(data)).getBytes().length>800000)throw new Error('El registro supera el tamaño permitido.');return data;}
function saveCourse_(b,user){
  var catalog=catalog_();checkRevision_(catalog,b.revision);
  var c=b.course||{},id=numericId_(c.id),image=String(c.image||'').trim();
  if(image&&!ArcadeNormalizer.url(image))throw new Error('La insignia debe tener una URL HTTPS válida y pública.');
  if(typeof c.active!=='boolean')throw new Error('Estado de curso inválido.');
  var course={id:id,title:textField_(c.title,1000,'Nombre de curso'),badgeName:textField_(c.badgeName||c.title,1000,'Nombre de insignia'),image:image,active:c.active};
  catalog.courses=catalog.courses.filter(function(x){return x.id!==id;});catalog.courses.push(course);
  catalog.revision++;catalog.updatedAt=new Date().toISOString();
  fsCommit_([write_('public/catalog',sized_(catalog)),write_('system/catalogAudit',{updatedBy:user,updatedAt:catalog.updatedAt})]);
  return catalog;
}
function getPerson_(cedula){
  cedula=numericId_(cedula);var pub=fsGet_('public/config');
  var record=pub&&pub.activeRelease?fsGet_('releases/'+pub.activeRelease+'/people/'+cedula):null;
  return {base:record?JSON.parse(record.payload):null,managed:fsGet_('managedPeople/'+cedula)};
}
function savePerson_(b,user){
  var input=b.person||{},id=numericId_(input.cedula),previous=fsGet_('managedPeople/'+id)||{revision:0};
  checkRevision_(previous,b.revision);
  if(typeof input.active!=='boolean'||!Array.isArray(input.courses)||input.courses.length>2000)throw new Error('Persona inválida.');
  var catalog=catalog_(),seen={};
  var courses=input.courses.map(function(c){
    var cid=numericId_(c.id),course=catalog.courses.find(function(x){return x.id===cid;});
    var old=(previous.courses||[]).find(function(x){return x.id===cid;});
    if(seen[cid]||(!course&&!old)||(!old&&course.active===false))throw new Error('Curso duplicado, inactivo o ausente del catálogo: '+cid);
    seen[cid]=true;
    return {id:cid,title:course?course.title:old.title,image:course?course.image:old.image,badgeName:course?course.badgeName:old.badgeName,date:validDate_(c.date),approval:100};
  });
  var person={cedula:id,name:textField_(input.name,300,'Nombre'),active:input.active,courses:courses,revision:(previous.revision||0)+1,updatedAt:new Date().toISOString()};
  fsCommit_([write_('managedPeople/'+id,sized_(person)),write_('system/personAudit',{updatedBy:user,updatedAt:person.updatedAt})]);
  return person;
}
function seedCatalog_(b,user){
  if(!Array.isArray(b.courses)||b.courses.length>5000)throw new Error('Catálogo inválido. Máximo 5.000 cursos por carga.');
  var catalog=catalog_(),ids={};catalog.courses.forEach(function(c){ids[c.id]=true;});
  b.courses.forEach(function(c){
    var id=numericId_(c.id);if(ids[id])return;
    var image=String(c.image||'').trim();if(image&&!ArcadeNormalizer.url(image))throw new Error('URL de insignia inválida.');
    catalog.courses.push({id:id,title:textField_(c.title,1000,'Nombre de curso'),badgeName:textField_(c.badgeName||c.title,1000,'Nombre de insignia'),image:image,active:true});ids[id]=true;
  });
  catalog.revision++;catalog.updatedAt=new Date().toISOString();
  fsCommit_([write_('public/catalog',sized_(catalog)),write_('system/catalogAudit',{updatedBy:user,updatedAt:catalog.updatedAt})]);return catalog;
}
