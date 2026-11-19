const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {mergePassport}=require('../js/catalog-model.js');
const c={id:'12',title:'Anterior',image:'https://example.com/old.png',badgeName:'Vieja',date:'2026-01-01',approval:100};
const base={cedula:'123',name:'Anterior',courses:[c]};
const catalog={courses:[{id:'12',title:'Actual',image:'https://example.com/new.png',badgeName:'Nueva',active:false},{id:'13',title:'Otro',image:'',active:true}]};
test('Rediseño por ID actualiza historia sin conceder cursos ni borrar archivados',()=>{
 const p=mergePassport(base,null,catalog);assert.equal(p.courses.length,1);assert.equal(p.courses[0].title,'Actual');assert.equal(p.badges[0].image,'https://example.com/new.png');
 assert.equal(base.courses[0].title,'Anterior');assert.equal(mergePassport(base,null,{courses:[{...catalog.courses[0],image:''}]}).badges.length,0);
});
test('Aprobaciones manuales sobreviven al cambio de Excel y se deduplican por ID y fecha',()=>{
 const managed={cedula:'123',name:'Corregido',active:true,courses:[{...c,date:'2026-02-01'},{...c,id:'13',date:'2026-03-01',image:''}]};
 const p=mergePassport(base,managed,catalog);assert.equal(p.name,'Corregido');assert.equal(p.courses.length,2);assert.equal(p.courses.find(c=>c.id==='12').date,'2026-02-01');
 assert.equal(mergePassport(null,managed,catalog).courses.length,2);assert.equal(mergePassport(base,{...managed,active:false},catalog),null);
 assert.equal(mergePassport(null,null,catalog),null);assert.equal(mergePassport(null,{cedula:'2',name:'Nuevo',active:true,courses:[]},catalog).courses.length,0);
});
function environment(){
 const db=new Map(),ctx={Date,Number,JSON,Utilities:{newBlob:s=>({getBytes:()=>Buffer.from(s)})},ArcadeNormalizer:require('../js/normalizer.js')};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('google-apps-script/Catalog.gs','utf8'),ctx);
 ctx.fsGet_=p=>db.has(p)?structuredClone(db.get(p)):null;ctx.write_=(path,data)=>({path,data:structuredClone(data)});ctx.fsCommit_=ws=>ws.forEach(w=>db.set(w.path,w.data));return {ctx,db};
}
test('Gestión valida campos, bloquea revisiones obsoletas y no toca publicaciones',()=>{
 const {ctx,db}=environment();const course={...catalog.courses[0],active:true};
 ctx.saveCourse_({revision:0,course},'admin');assert.throws(()=>ctx.saveCourse_({revision:0,course},'admin'),/cambiaron/);
 assert.throws(()=>ctx.saveCourse_({revision:1,course:{...course,image:'javascript:alert(1)'}},'admin'),/HTTPS/);
 assert.throws(()=>ctx.savePerson_({revision:0,person:{cedula:'123',name:'Nuevo',active:true,courses:[{id:'99',date:'2026-01-01'}]}},'admin'),/ausente/);
 assert.throws(()=>ctx.validDate_('2026-02-30'),/Fecha/);
 const person={cedula:'123',name:'Nuevo',active:true,courses:[{id:'12',date:'2026-01-01'}]};
 ctx.savePerson_({revision:0,person},'admin');assert.throws(()=>ctx.savePerson_({revision:0,person},'admin'),/cambiaron/);
 assert.equal(db.get('managedPeople/123').courses[0].approval,100);assert.equal(db.has('public/config'),false);
 ctx.saveCourse_({revision:1,course:{...course,active:false}},'admin');
 ctx.savePerson_({revision:1,person},'admin');
 assert.throws(()=>ctx.savePerson_({revision:0,person:{...person,cedula:'456'}},'admin'),/inactivo/);
});
test('Carga de catálogo desde Excel es aditiva y preserva los diseños editados',()=>{
 const {ctx}=environment();ctx.saveCourse_({revision:0,course:{...catalog.courses[0],active:true}},'admin');
 const result=ctx.seedCatalog_({courses:[c,{...c,id:'13'}]},'admin');assert.equal(result.courses.length,2);assert.equal(result.courses[0].image,'https://example.com/new.png');
 assert.equal(ctx.seedCatalog_({courses:[c,{...c,id:'13'}]},'admin').courses.length,2);
});
test('Modelo compartido idéntico y nuevos endpoints después de autorización y bloqueo',()=>{
 assert.equal(fs.readFileSync('js/catalog-model.js','utf8'),fs.readFileSync('google-apps-script/CatalogModel.gs','utf8'));
 const code=fs.readFileSync('google-apps-script/Code.gs','utf8');assert(code.indexOf('user=admin_')<code.indexOf("case 'savePerson'"));
 const rules=fs.readFileSync('firestore.rules','utf8');assert(rules.includes('match /managedPeople/{cedula}'));assert(rules.includes('allow list, write: if false;'));
});
