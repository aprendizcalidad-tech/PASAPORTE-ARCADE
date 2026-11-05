/* Insignias de presentación: la imagen genérica nunca se guarda en el catálogo. */
(function(root){
  const GENERIC_BADGE='assets/medal.svg';
  function withGenericBadges(person){
    if(!person)return person;
    const badges=(person.badges||[]).map(b=>({...b}));
    const seen=new Set();
    for(const course of person.courses||[]){
      if(String(course.image||'').trim()||seen.has(course.id))continue;
      seen.add(course.id);
      badges.push({courseId:course.id,image:GENERIC_BADGE,name:course.badgeName||course.title,date:course.date,generic:true});
    }
    return {...person,badges};
  }
  root.PassportBadgeDisplay={GENERIC_BADGE,withGenericBadges};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.PassportBadgeDisplay;
})(typeof globalThis!=='undefined'?globalThis:this);
