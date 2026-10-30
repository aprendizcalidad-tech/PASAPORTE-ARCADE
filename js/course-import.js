/* Solo catálogo: no crea personas ni aprobaciones. */
(function(root){
  'use strict';
  const key=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  function state(v){
    const s=key(v),parts=s.split('|').map(x=>x.trim());
    if(parts.length>1){
      if(parts[0]==='1'&&parts[1]==='activo')return true;
      if(parts[0]==='2'&&parts[1]==='inactivo')return false;
    }else{
      if(['1','activo'].includes(s))return true;
      if(['2','inactivo'].includes(s))return false;
    }
    throw new Error('Estado desconocido. Usa Activo o Inactivo.');
  }
  function hasHeaders(rows){return !!rows.length&&['id','nombre','estadoid'].every(h=>rows[0].map(key).includes(h));}
  function parse(rows){
    if(!hasHeaders(rows))throw new Error('El catálogo debe tener las columnas id, nombre y estadoId.');
    const header=rows[0].map(key),indices=['id','nombre','estadoid'].map(k=>{
      if(header.filter(h=>h===k).length!==1)throw new Error('Columna duplicada: '+k);
      return header.indexOf(k);
    }),courses=[],ids=new Set();
    rows.slice(1).forEach((r,i)=>{
      if(!r.some(v=>v!==''&&v!=null))return;
      try{
        const raw=r[indices[0]],id=String(raw??'').trim(),title=String(r[indices[1]]??'').trim();
        if((typeof raw==='number'&&!Number.isSafeInteger(raw))||!/^\d{1,20}$/.test(id))throw new Error('ID inválido. Usa un número entero de hasta 20 dígitos.');
        if(ids.has(id))throw new Error('ID duplicado: '+id);
        if(!title||title.length>1000)throw new Error('Nombre de curso vacío o demasiado largo.');
        const active=state(r[indices[2]]);ids.add(id);courses.push({id,title,active});
      }catch(e){throw new Error('Fila '+(i+2)+': '+e.message);}
    });
    if(!courses.length||courses.length>5000)throw new Error('Carga entre 1 y 5.000 cursos.');
    return courses;
  }
  function preview(courses,existing){
    const byId=new Map((existing||[]).map(c=>[c.id,c]));
    const counts={total:courses.length,active:0,inactive:0,added:0,renamed:0,archived:0,activated:0,unchanged:0};
    const rows=courses.map(c=>{
      const old=byId.get(c.id),changes=[];counts[c.active?'active':'inactive']++;
      if(!old){counts.added++;changes.push(c.active?'Nuevo':'Nuevo · archivado');}
      else{
        if(c.title!==old.title){counts.renamed++;changes.push('Actualizar nombre');}
        if(c.active!==old.active){counts[c.active?'activated':'archived']++;changes.push(c.active?'Activar':'Archivar');}
        if(!changes.length){counts.unchanged++;changes.push('Sin cambios');}
      }
      return {...c,previousTitle:old?.title||'',changes:changes.join(' · ')};
    });
    return {counts,rows};
  }
  root.PassportCourseImport={state,hasHeaders,parse,preview};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.PassportCourseImport;
})(typeof globalThis!=='undefined'?globalThis:this);
