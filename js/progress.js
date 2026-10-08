// La ruta utiliza exclusivamente el perfil ya consultado en Firestore.
// Los hitos son metas de gamificación, no categorías ni cursos pendientes del Excel.
export const ROUTE_GOAL=600;
export const ROUTE_MILESTONES=[
  {name:'Portal de inicio',target:1,subtitle:'Tu aventura comenzó aquí',x:25,y:86},
  {name:'Isla Explorador',target:5,subtitle:'Primeros aprendizajes',x:36,y:60},
  {name:'Ciudad Arcade',target:15,subtitle:'Nuevos horizontes',x:57,y:75},
  {name:'Fortaleza del conocimiento',target:30,subtitle:'Grandes logros',x:87,y:70},
  {name:'Torre Maestra',target:75,subtitle:'Tu conocimiento te eleva',x:68,y:28},
  {name:'Templo Leyenda',target:ROUTE_GOAL,subtitle:'600 aprendizajes',x:92,y:29}
];
// Posiciones de los pies sobre las plataformas, en porcentaje del mapa.
export const ROUTE_TRAVEL_POINTS=[{x:20,y:77},{x:29,y:58},{x:51,y:69},{x:84,y:65},{x:61,y:43},{x:89,y:25}];
export function routeIslandForCount(value){
  const count=Number(value);
  if(!Number.isFinite(count)||count<1)return -1;
  let island=-1;
  ROUTE_MILESTONES.forEach((m,i)=>{if(count>=m.target)island=i;});
  return island;
}
const $=id=>document.getElementById(id);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate=s=>{if(!s)return 'Sin fecha registrada';const d=new Date(s+'T12:00:00Z');return Number.isNaN(d.getTime())?'Sin fecha registrada':new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(d);};
const imageSrc=s=>/^https:\/\/[^\s]+$/i.test(String(s))||s==='assets/medal.svg'?s:'assets/medal.svg';
export function createRoute({getPerson,getLevel,getAvatar,openHistory}){
  let galleryPage=0,travelAnimation=null,travelVersion=0;
  function stopTravel(){
    travelVersion++;travelAnimation?.cancel();travelAnimation=null;
    $('route-traveler').classList.remove('walking');
  }
  function placeTraveler(point){
    $('route-traveler').style.left=point.x+'%';$('route-traveler').style.top=point.y+'%';
  }
  function travelerState(){
    const p=getPerson(),index=p?routeIslandForCount(p.courses.length):-1;
    const visible=index>=0;
    $('route-traveler').hidden=!visible;$('route-replay').hidden=!visible;
    if(visible){placeTraveler(ROUTE_TRAVEL_POINTS[index]);$('route-traveler').setAttribute('aria-label','Tu personaje en '+ROUTE_MILESTONES[index].name);}
    return index;
  }
  async function travelRoute(){
    stopTravel();const index=travelerState(),version=travelVersion;
    if(index<0||$('route-view').hidden)return;
    const character=$('route-traveler'),finalPoint=ROUTE_TRAVEL_POINTS[index];
    if(matchMedia('(prefers-reduced-motion: reduce)').matches||!character.animate){placeTraveler(finalPoint);return;}
    placeTraveler(ROUTE_TRAVEL_POINTS[0]);character.classList.add('walking');
    for(let i=0;i<=index;i++){
      if(version!==travelVersion)return;
      const start=ROUTE_TRAVEL_POINTS[Math.max(0,i-1)],end=ROUTE_TRAVEL_POINTS[i];
      character.classList.toggle('facing-left',end.x<start.x);
      travelAnimation=character.animate([
        {left:start.x+'%',top:start.y+'%',opacity:i===0?0:1},
        {left:(start.x+end.x)/2+'%',top:((start.y+end.y)/2-2)+'%',opacity:1,offset:.5},
        {left:end.x+'%',top:end.y+'%',opacity:1}
      ],{duration:i===0?350:750,easing:'ease-in-out'});
      try{await travelAnimation.finished;}catch{return;}
      if(version!==travelVersion)return;
      placeTraveler(end);travelAnimation=null;
    }
    character.classList.remove('walking');character.classList.remove('facing-left');
  }
  function showPassport(hash='#perfil'){
    stopTravel();travelerState();$('route-view').hidden=true;$('inicio').hidden=false;document.body.classList.remove('route-mode');
    if(location.hash!==hash)location.hash=hash;syncNavigation(false);
  }
  function syncNavigation(open){
    document.querySelectorAll('.topbar nav a, .route-mobile-tabs a').forEach(link=>{
      const active=open?link.getAttribute('href')==='#ruta':link.getAttribute('href')===(location.hash||'#inicio');
      link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
  }
  function syncView(){
    const open=location.hash==='#ruta';$('route-view').hidden=!open;$('inicio').hidden=open;document.body.classList.toggle('route-mode',open);syncNavigation(open);
    if(open){$('route-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});travelRoute();}else{stopTravel();travelerState();}
  }
  function history(){if(!getPerson()){lookup();return;}showPassport('#cursos');openHistory();}
  function lookup(){showPassport('#inicio');$('cedula').focus();$('search-form').scrollIntoView({behavior:'smooth',block:'center'});}
  function renderGallery(){
    const badges=getPerson()?.badges??[],pages=Math.ceil(badges.length/4);
    galleryPage=Math.max(0,Math.min(galleryPage,Math.max(0,pages-1)));
    $('route-gallery').innerHTML=badges.length?badges.slice(galleryPage*4,galleryPage*4+4).map((b,i)=>`<article class="badge-card" style="--i:${i}"><div class="badge-image"><img src="${escapeHtml(imageSrc(b.image))}" alt="${escapeHtml(b.name)}" loading="lazy" referrerpolicy="no-referrer"></div><h3>${escapeHtml(b.name)}</h3><time datetime="${escapeHtml(b.date)}">▣ ${escapeHtml(formatDate(b.date))}</time></article>`).join(''):`<p class="route-empty">${getPerson()?'Todavía no hay insignias asociadas a tus cursos en el archivo.':'Consulta tu cédula para descubrir tus insignias.'}</p>`;
    $('route-gallery').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.src='assets/medal.svg';},{once:true}));
    // Ventana de puntos acotada para historiales grandes; nunca desborda el panel.
    const from=Math.max(0,Math.min(galleryPage-2,pages-5)),to=Math.min(pages,from+5);
    $('route-gallery-controls').innerHTML=pages>1?`<button type="button" data-gallery-step="-1" aria-label="Insignias anteriores" ${galleryPage===0?'disabled':''}>‹</button>${Array.from({length:to-from},(_,i)=>i+from).map(i=>`<button type="button" class="gallery-dot ${i===galleryPage?'active':''}" data-gallery-page="${i}" aria-label="Página ${i+1} de ${pages}" ${i===galleryPage?'aria-current="true"':''}></button>`).join('')}<button type="button" data-gallery-step="1" aria-label="Insignias siguientes" ${galleryPage>=pages-1?'disabled':''}>›</button><span class="visually-hidden" role="status">Página ${galleryPage+1} de ${pages}</span>`:'';
  }
  function refresh(){
    stopTravel();galleryPage=0;const p=getPerson(),count=p?.courses.length??0;const currentIsland=travelerState();
    $('route-name').textContent=p?.name??'Tu aventura te espera';$('route-cedula').textContent=p?'Cédula: '+p.cedula:'Consulta tu cédula para comenzar';$('route-id').textContent=p?.cedula??'—';
    $('route-completed').textContent=p?count:'—';$('route-badges-count').textContent=p?p.badges.length:'—';$('route-level').textContent=p?getLevel():'Explorador';
    const avatar=getAvatar();$('route-avatar').style.backgroundPosition=avatar.style.backgroundPosition;$('route-avatar').setAttribute('aria-label',avatar.getAttribute('aria-label')??'Avatar animal');
    const earned=count>=ROUTE_GOAL;$('route-goal-heading').textContent=earned?'¡Copa Leyenda alcanzada!':'Próximo hito en tu ruta';
    $('route-goal-copy').textContent=!p?'Consulta tu pasaporte para descubrir tu ruta.':earned?'Tu historia de aprendizaje sigue creciendo.':'Cada curso completado suma a esta meta.';
    $('route-goal-numbers').textContent=p?`${count} / ${ROUTE_GOAL}`:`— / ${ROUTE_GOAL}`;
    $('route-goal-fill').style.width=Math.min(100,count/ROUTE_GOAL*100)+'%';$('route-goal-meter').setAttribute('aria-valuenow',String(Math.min(count,ROUTE_GOAL)));$('route-goal-meter').setAttribute('aria-valuetext',`${count} cursos completados; meta de ${ROUTE_GOAL}`);
    $('route-view').classList.toggle('legend-earned',earned);
    $('route-nodes').innerHTML=ROUTE_MILESTONES.map((m,i)=>{const done=!!p&&count>=m.target;return `<button type="button" class="route-node ${done?'earned':'future'} ${i===currentIsland?'current-island':''}" data-milestone="${i}" style="--node-x:${m.x}%;--node-y:${m.y}%" aria-label="${escapeHtml(m.name)}: ${done?'hito alcanzado':p?'meta de aventura':'consulta tu cédula'}, ${m.target} cursos"><span class="node-state" aria-hidden="true">${done?'✓':p?'♙':'✦'}</span><span><strong>${escapeHtml(m.name)}</strong><small>${escapeHtml(done&&i===4?count+' aprendizajes':m.subtitle)}</small></span></button>`;}).join('');
    $('route-map-note').textContent=currentIsland>=0?'Tu isla actual: '+ROUTE_MILESTONES[currentIsland].name:p?'Tu ruta comienza con tu primer curso completado.':'Consulta tu cédula para activar tu ruta.';
    const courses=p?.courses??[];
    // Ordenar una copia para conservar los índices usados por el detalle del pasaporte.
    const recent=courses.map((c,i)=>({c,i})).sort((a,b)=>String(b.c.date??'').localeCompare(String(a.c.date??''))).slice(0,3);
    $('route-recent-courses').innerHTML=recent.length?recent.map(({c,i})=>`<button type="button" class="route-course" data-course="${i}" aria-label="Ver detalle de ${escapeHtml(c.title)}"><span class="route-course-icon" aria-hidden="true">📘</span><strong>${escapeHtml(c.title)}</strong><span class="complete">✓ Completado</span><time datetime="${escapeHtml(c.date)}">▣ ${escapeHtml(formatDate(c.date))}</time><span class="course-chevron" aria-hidden="true">›</span></button>`).join(''):`<p class="route-empty">${p?'Aún no hay cursos completados para mostrar.':'Tu historia aparecerá aquí al consultar tu cédula.'}</p>`;
    $('route-lookup').textContent=p?'Consultar otra cédula →':'Consultar mi cédula →';renderGallery();if(!$('route-view').hidden)travelRoute();
  }
  $('route-replay').addEventListener('click',travelRoute);
  $('route-all-courses').addEventListener('click',history);$('route-all-badges').addEventListener('click',history);$('route-explore').addEventListener('click',history);$('route-lookup').addEventListener('click',lookup);
  $('route-gallery-controls').addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;if(button.dataset.galleryPage!==undefined)galleryPage=Number(button.dataset.galleryPage);else if(button.dataset.galleryStep)galleryPage+=Number(button.dataset.galleryStep);renderGallery();});
  $('route-nodes').addEventListener('click',e=>{
    const button=e.target.closest('[data-milestone]');if(!button)return;const m=ROUTE_MILESTONES[Number(button.dataset.milestone)],p=getPerson(),count=p?.courses.length??0;
    $('route-milestone-details').innerHTML=`<p class="milestone-dialog-icon" aria-hidden="true">${count>=m.target?'✦':'◇'}</p><h2>${escapeHtml(m.name)}</h2><p>${p?(count>=m.target?'¡Hito alcanzado! Tu historia ya llegó a esta isla.':'Esta isla celebra una meta de tu aventura de aprendizaje.'):'Consulta tu cédula para descubrir tus hitos.'}</p><p><strong>Meta: ${m.target} cursos completados.</strong>${p?'<br>Tu historia: '+count+' cursos completados.':''}</p><p>Cada curso aprobado cuenta una vez. Esta meta celebra tu trayectoria; no indica cursos obligatorios ni pendientes.</p>`;$('route-milestone-dialog').showModal();
  });
  window.addEventListener('hashchange',syncView);syncView();
  return {refresh,showPassport};
}
