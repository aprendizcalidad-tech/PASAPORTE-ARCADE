/* Finnova Group · shared 720 × 405 certificate composition. */
const UC_CERTIFICATE_VERSION='finnova-6';
const UC_CERTIFICATE={
 layout(c){
  const fit=(value,max,width,lines=1,height=999)=>{const text=String(value||'');let size=max;while(size>7){const capacity=width/(size*.57);let count=1,used=0;for(const word of text.split(/\s+/)){if(word.length>capacity){count+=Math.ceil(word.length/capacity)-1;used=word.length%capacity;}else if(used+word.length+1>capacity){count++;used=word.length;}else used+=word.length+1;}if(count<=lines&&count*size*1.18<=height-6)break;size-=.5;}return size;};
  const box=(id,text,x,y,w,h,size,font='Arial',color='#181e48',bold=false)=>({id,text:String(text||''),x,y,w,h,size,font,color,bold});
  const issuer=c.company||'Finnova Group',name=c.name||'Nombre del participante',title=c.title||'Nombre del curso';
  return [
   box('brand','UNIVERSIDAD CORPORATIVA',200,74,320,16,10,'Arial','#070a70',true),
   box('company',issuer,205,90,310,18,fit(issuer,9,300,1,18),'Arial','#656b7e'),
   box('eyebrow','CERTIFICADO DE',170,112,380,18,12,'Georgia','#f49119',true),
   box('heading','APROBACIÓN',110,130,500,43,32,'Georgia','#070a70',true),
   box('intro','Se otorga a',170,169,380,18,10,'Arial','#656b7e'),
   box('name',name,110,188,500,43,fit(name,27,475,2,43),'Georgia','#f28c18'),
   box('body','Por completar y aprobar satisfactoriamente '+(c.routeId?'la ruta de aprendizaje':'el curso'),100,230,520,18,9.5,'Arial','#656b7e'),
   box('title',title,110,249,500,39,fit(title,17,470,2,39),'Georgia','#181e48',true),
   box('details',String(c.hours)+' horas  ·  Fecha de aprobación: '+String(c.date||'').slice(0,10),150,290,420,18,8.5,'Arial','#656b7e'),
   box('signature-caption','FIRMA INSTITUCIONAL',120,374,205,11,7,'Arial','#656b7e',true),
   box('verification','VERIFICACIÓN DIGITAL',388,326,173,14,8,'Arial','#f28c18',true),
   box('code',c.code||'VISTA PREVIA',383,343,178,13,7,'Arial','#181e48'),
   {...box('link','Verificar autenticidad',383,361,163,13,7.5,'Arial','#656b7e'),link:/^https:\/\//.test(c.portalUrl||'')?c.portalUrl.replace(/#.*$/,'')+'#verificar/'+encodeURIComponent(c.code||''):''}
  ];
 }
};
