/* Autorización por curso; las asignaciones nunca se entregan a otros alumnos. */
function canStudy_(u,c){return !!(u&&c&&!c.deleted&&c.published&&(u.role==='admin'||(c.assignedUserIds||[]).includes(u.id)));}
function assignedCatalog_(token){
 const u=token?user_(token):null;
 const selected=u?rows_('Courses').filter(c=>canStudy_(u,c)):[];
 const ids=new Set(selected.map(c=>c.id));
 return {settings:settings_(),schools:schools_().filter(s=>selected.some(c=>c.schoolId===s.id||!c.schoolId&&c.school===s.name)),courses:selected.map(c=>{const v=publicCourse_(c);delete v.assignedUserIds;delete v.assignmentRevision;return v;}),routes:u?rows_('Routes').filter(r=>r.published&&r.courseIds.length&&r.courseIds.every(id=>ids.has(id))):[]};
}
function assignCourse_(p){
 const c=get_('Courses',p.courseId);need_(c&&!c.deleted,'Curso no disponible.');
 need_((p.revision||'')===(c.assignmentRevision||''),'Otro administrador cambió las asignaciones. Recarga antes de guardar.');
 need_(Array.isArray(p.userIds)&&p.userIds.length<=500,'Selecciona hasta 500 usuarios por curso.');
 const ids=[...new Set(p.userIds)];const users=rows_('Users');
 need_(ids.every(id=>typeof id==='string'&&users.some(u=>u.id===id&&(u.active!==false||(c.assignedUserIds||[]).includes(id)))),'Hay usuarios inexistentes o inactivos sin asignación previa.');
 const updated={...c,assignedUserIds:ids,assignmentRevision:uid_(),updated:now_()};put_('Courses',updated);return {courseId:c.id,count:ids.length};
}
function deleteCourse_(p){
 const c=get_('Courses',p.id);need_(c&&!c.deleted,'El curso ya no está disponible.');
 need_((p.updated||'')===(c.updated||''),'El curso cambió. Recarga antes de eliminar.');
 need_(!rows_('Routes').some(r=>(r.courseIds||[]).includes(c.id)),'El curso pertenece a una ruta. Retíralo de la ruta o despublícalo si necesitas conservarla.');
 put_('Courses',{...c,deleted:true,published:false,deletedAt:now_(),updated:now_()});
 return true;
}
function actualizarFinnovaV7(){
 actualizarCampusV3();
 const lock=LockService.getScriptLock();need_(lock.tryLock(5000),'Hay otra operación en curso. Reintenta.');
 try{resetRequest_();
  // Preserva el acceso de quienes ya estaban inscritos. Nuevos cursos empiezan sin usuarios.
  const enrolled=rows_('Enrollments');
  rows_('Courses').forEach(c=>{if(!Array.isArray(c.assignedUserIds))put_('Courses',{...c,assignedUserIds:[...new Set(enrolled.filter(e=>e.courseId===c.id).map(e=>e.userId))],assignmentRevision:uid_()});});
  invalidateCatalog_();console.log('Finnova V7 lista. Revisa Administración > Asignaciones. Solo se conservó el acceso previo de alumnos inscritos; los demás requieren asignación.');
 }finally{lock.releaseLock();}
}
