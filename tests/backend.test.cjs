const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function environment(){
 const db=new Map();let fail=false;
 const c={console,Date,Number,JSON,Utilities:{newBlob:s=>({getBytes:()=>Buffer.from(s)})},ArcadeNormalizer:require('../js/normalizer.js')};
 vm.createContext(c);vm.runInContext(fs.readFileSync('google-apps-script/Code.gs','utf8'),c);
 c.fsGet_=p=>db.has(p)?structuredClone(db.get(p)):null;
 c.write_=(path,data,createOnly)=>({path,data:structuredClone(data),createOnly});
 c.fsCommit_=writes=>{if(fail){fail=false;throw Error('simulated failure');}writes.forEach(w=>{if(w.createOnly&&db.has(w.path))throw Error('already exists');});writes.forEach(w=>db.set(w.path,structuredClone(w.data)));};
 return {c,db,failNext:()=>{fail=true;}};
}
const summary={people:2,courseCount:1,badgeCount:0,rows:2,completed:2};
const profile=id=>({cedula:id,name:'Test',courses:[{id:'1',title:'Curso',date:'2026-01-01',image:'',approval:100}]});
test('Publicación atómica, reintento y eliminación lógica de personas ausentes',()=>{
 const {c,db,failNext}=environment();c.begin_({importId:'web-test-001',summary},'admin');assert.throws(()=>c.publish_('web-test-001','admin'),/completa/);assert.equal(db.has('public/config'),false);
 const batch={importId:'web-test-001',index:0,profiles:[profile('1'),profile('2')]};failNext();assert.throws(()=>c.chunk_(batch,'admin'),/failure/);assert.equal(db.get('releases/web-test-001').next,0);
 c.chunk_(batch,'admin');c.chunk_(batch,'admin');assert.equal(db.get('releases/web-test-001').written,2);c.publish_('web-test-001','admin');assert.equal(db.get('public/config').activeRelease,'web-test-001');
 c.begin_({importId:'web-test-002',summary:{...summary,people:1}},'admin');assert.equal(db.get('public/config').activeRelease,'web-test-001');c.chunk_({importId:'web-test-002',index:0,profiles:[profile('1')]},'admin');c.publish_('web-test-002','admin');assert.equal(db.get('public/config').activeRelease,'web-test-002');assert.equal(db.has('releases/web-test-002/people/2'),false);
});
test('Exclusión mutua, propietario, secuencia y aprobación en servidor',()=>{
 const {c}=environment();c.begin_({importId:'web-test-003',summary},'admin');assert.throws(()=>c.begin_({importId:'web-test-004',summary},'admin'),/pendiente/);assert.throws(()=>c.chunk_({importId:'web-test-003'},'intruder'),/permiso/);assert.throws(()=>c.chunk_({importId:'web-test-003',index:1,profiles:[]},'admin'),/secuencia/);assert.throws(()=>c.profile_({...profile('1'),courses:[{...profile('1').courses[0],approval:99}]}),/inválido/);c.cancel_('web-test-003');assert.equal(c.begin_({importId:'web-test-004',summary},'admin').status,'uploading');
});
