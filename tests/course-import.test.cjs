const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const model=require('../js/course-import.js');
test('Lee el catálogo original y conserva cursos homónimos por ID con sus estados',()=>{
 const courses=model.parse([['id','nombre','estadoId'],[550,'Desconexión','1 | Activo | general | 1 | '],[686,'Desconexión','2 | Inactivo | inactivo general | 1 | ']]);
 assert.equal(courses.length,2);assert.equal(courses[0].id,'550');assert.equal(courses[1].active,false);
 assert.throws(()=>model.parse([['id','nombre','estadoId'],[1,'A','Activo'],[1,'B','Activo']]),/duplicado/);
 assert.throws(()=>model.parse([['id','nombre','estadoId'],[1,'A','2 | Activo']]),/Estado/);
 assert.throws(()=>model.parse([['id','nombre','estadoId'],[1,'A','']]),/Estado/);
});
test('La vista previa distingue nuevos, cambios de nombre y archivo por ID',()=>{
 const result=model.preview([{id:'1',title:'Nuevo nombre',active:false},{id:'2',title:'Mismo nombre',active:true},{id:'3',title:'Nuevo',active:false}],[{id:'1',title:'Viejo',active:true},{id:'2',title:'Mismo nombre',active:true}]);
 assert.equal(result.counts.added,1);assert.equal(result.counts.renamed,1);assert.equal(result.counts.archived,1);assert.equal(result.counts.unchanged,1);
});
function environment(){
 const db=new Map(),ctx={Date,Number,JSON,Utilities:{newBlob:s=>({getBytes:()=>Buffer.from(s)})}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('google-apps-script/Catalog.gs','utf8'),ctx);
 ctx.fsGet_=p=>db.has(p)?structuredClone(db.get(p)):null;ctx.write_=(path,data)=>({path,data:structuredClone(data)});ctx.fsCommit_=ws=>ws.forEach(w=>db.set(w.path,w.data));return {db,ctx};
}
test('Importar solo cursos conserva diseños, otros ID y todo el historial del personal',()=>{
 const {db,ctx}=environment();db.set('public/catalog',{revision:3,courses:[{id:'1',title:'Anterior',image:'https://example.com/a.webp',badgeName:'Diseño personalizado',active:true},{id:'99',title:'Otro',active:false,image:'',badgeName:'Otro'}]});
 db.set('public/config',{activeRelease:'real'});db.set('managedPeople/123',{name:'Persona',courses:[{id:'1',date:'2026-01-01'}]});
 const result=ctx.importCourses_({revision:3,courses:[{id:'1',title:'Actual',active:false},{id:'2',title:'Nuevo',active:true}]},'admin');
 assert.equal(result.revision,4);assert.equal(result.courses.length,3);const first=result.courses.find(c=>c.id==='1');assert.equal(first.title,'Actual');assert.equal(first.active,false);assert.equal(first.image,'https://example.com/a.webp');assert.equal(first.badgeName,'Diseño personalizado');
 assert.equal(db.get('public/config').activeRelease,'real');assert.equal(db.get('managedPeople/123').courses.length,1);assert.equal(db.size,4);
 assert.throws(()=>ctx.importCourses_({revision:3,courses:[{id:'1',title:'X',active:true}]},'admin'),/cambiaron/);
});
test('Un catálogo inválido o demasiado grande no realiza ninguna escritura',()=>{
 const {db,ctx}=environment();
 for(const courses of [[{id:'1',title:'A',active:true},{id:'1',title:'B',active:false}],[{id:'1',title:'A',active:'false'}],[{id:'1',title:'',active:true}],[]])assert.throws(()=>ctx.importCourses_({revision:0,courses},'admin'));
 assert.equal(db.size,0);
 const huge=Array.from({length:5000},(_,i)=>({id:String(i),title:'x'.repeat(1000),active:true}));assert.throws(()=>ctx.importCourses_({revision:0,courses:huge},'admin'),/tamaño/);assert.equal(db.size,0);
 const code=fs.readFileSync('google-apps-script/Code.gs','utf8');assert(code.indexOf('user=admin_')<code.indexOf("case 'importCourses'"));assert(code.indexOf('lock.tryLock')<code.indexOf("case 'importCourses'"));
});
