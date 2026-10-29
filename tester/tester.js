import {connect} from '../js/firebase.js';
const $=id=>document.getElementById(id);
let entries=[];
const labels={pending:'Pendiente de comprobar',ok:'Imagen cargada',error:'No se pudo cargar',missing:'Sin URL de imagen'};
function update(){
  const counts={ok:0,error:0,missing:0,pending:0};let visible=0;
  const query=$('search').value.trim().toLocaleLowerCase('es');
  for(const e of entries){
    counts[e.state]++;
    e.card.hidden=!(e.text.includes(query)&&($('filter').value==='all'||$('filter').value===e.state));
    if(!e.card.hidden)visible++;
  }
  $('summary').textContent=`${entries.length} cursos · ${counts.ok} imágenes cargadas · ${counts.error} con error · ${counts.missing} sin URL · ${counts.pending} pendientes`;
  $('empty').hidden=!entries.length||visible>0;
}
function element(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;}
function card(course){
  const el=element('article'),preview=element('div');preview.className='preview';
  const image=element('img');image.alt=course.badgeName||course.title||'Insignia';image.referrerPolicy='no-referrer';preview.append(image);
  const result=element('p');result.className='result';
  const entry={card:el,image,result,url:typeof course.image==='string'?course.image.trim():'',state:'pending',text:`${course.id} ${course.title} ${course.badgeName||''}`.toLocaleLowerCase('es')};
  el.append(preview,element('h2',course.title||'Curso sin nombre'),element('p',`ID: ${course.id} · ${course.active===false?'Archivado':'Activo'}`),result);
  if(/^https:\/\/[^\s]+$/i.test(entry.url)){
    const link=element('a','Abrir imagen original ↗');link.href=entry.url;link.target='_blank';link.rel='noopener noreferrer';el.append(link);
  }
  function state(value){entry.state=value;result.dataset.state=value;result.textContent=labels[value];}
  entry.setState=state;state(entry.url?'pending':'missing');
  if(!entry.url){image.remove();preview.textContent='Sin imagen configurada';}
  return entry;
}
async function check(entry){
  if(!entry.url)return;
  if(!/^https:\/\/[^\s]+$/i.test(entry.url)){entry.setState('error');update();return;}
  await new Promise(resolve=>{
    let done=false;
    const finish=state=>{if(done)return;done=true;clearTimeout(timer);entry.image.onload=null;entry.image.onerror=null;entry.setState(state);update();resolve();};
    const timer=setTimeout(()=>finish('error'),20000);
    entry.image.onload=()=>finish(entry.image.naturalWidth?'ok':'error');entry.image.onerror=()=>finish('error');
    entry.image.src=entry.url;
  });
}
$('reload').addEventListener('click',async()=>{
  $('reload').disabled=true;$('status').textContent='Leyendo el catálogo publicado…';
  try{
    const {db,storeApi:f}=await connect();
    const snapshot=await f.getDocFromServer(f.doc(db,'public','catalog'));
    const courses=snapshot.exists()?snapshot.data().courses:[];
    if(courses!==undefined&&!Array.isArray(courses))throw new Error('El catálogo no tiene el formato esperado.');
    entries=(courses||[]).map(card);$('grid').replaceChildren(...entries.map(e=>e.card));update();
    $('status').textContent=entries.length?'Comprobando imágenes en grupos de seis…':'El catálogo está vacío. Agrega cursos desde Administración o añade los cursos del Excel al catálogo.';
    const queue=entries.slice();
    await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{while(queue.length)await check(queue.shift());}));
    if(entries.length)$('status').textContent='Comprobación terminada. Los errores incluyen imágenes que no respondieron en 20 segundos. Puedes volver a probar.';
  }catch(error){$('status').textContent='No se pudo consultar el catálogo. '+error.message;}
  finally{$('reload').disabled=false;}
});
$('search').addEventListener('input',update);$('filter').addEventListener('change',update);
