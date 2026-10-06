const {test}=require('node:test'),assert=require('node:assert/strict');
const n=require('../js/normalizer.js');
const header=['fechaInicio','ultimaAccion','fechaFinal','percAprob','capCapacitacionId','Capacitación','capUsuarioId','Nombre','Cedula','Insignia'];
const badgeHeader=['Id','Nombre','Insignia'];
const row=(over={})=>{const data={fechaInicio:'2026-01-01',ultimaAccion:'2026-02-01',fechaFinal:'2026-02-01',percAprob:100,capCapacitacionId:1,Capacitación:'Curso',capUsuarioId:3,Nombre:'Persona de prueba',Cedula:'001234',Insignia:'',...over};return header.map(k=>data[k]);};
test('Deduplicación, fecha más reciente y cruce por ID',()=>{
 const data=n.build([header,row(),row({fechaFinal:'2026-03-05'}),row({capCapacitacionId:2,Capacitación:'Otro',Insignia:'https://example.com/a.png'}),row({capCapacitacionId:3,percAprob:99})],[badgeHeader,[1,'Insignia','https://example.com/a.png']]);
 assert.equal(data.profiles.length,1);assert.equal(data.profiles[0].cedula,'001234');assert.equal(data.profiles[0].courses.length,2);assert.equal(data.profiles[0].courses[0].date,'2026-03-05');assert.equal(data.profiles[0].badges.length,1);assert.equal(data.report.duplicates,1);assert.equal(data.report.notApproved,1);assert.equal(data.summary.courseCount,3);
});
test('Solo aprobación 100, nunca 1 ni vacío',()=>{const d=n.build([header,...[100,'100%','',1,99].map((p,i)=>row({percAprob:p,Cedula:String(i+1)}))],[badgeHeader]);assert.equal(d.profiles.length,2);assert.equal(d.report.notApproved,3);});
test('Cédulas, encabezados y URLs inválidos',()=>{assert.throws(()=>n.build([['Nombre']],[badgeHeader]),/Falta la columna/);const d=n.build([header,row({Cedula:9007199254740992}),row({Cedula:'ABC'}),row({Insignia:'javascript:alert(1)'})],[badgeHeader]);assert.equal(d.report.invalid,2);assert.equal(d.profiles[0].badges.length,0);});
test('Prioridad de la URL de fila',()=>{const d=n.build([header,row({Insignia:'https://example.com/row.png'}),row({fechaFinal:'2026-01-01'})],[badgeHeader,[1,'Catálogo','https://example.com/catalog.png']]);assert.equal(d.profiles[0].courses[0].image,'https://example.com/row.png');});
test('Fechas e identificadores Excel',()=>{assert.equal(n.date(45292),'2024-01-01');assert.equal(n.date('5/2/2026'),'2026-02-05');assert.equal(n.id(1056000),'1056000');assert.equal(n.id('1056000.0'),'1056000');});
