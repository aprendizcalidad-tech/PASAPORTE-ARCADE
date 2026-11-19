/* Mismo modelo en navegador y Apps Script. El catálogo nunca concede aprobaciones. */
(function(root){
  function mergePassport(base,managed,catalog){
    if(managed?.active===false)return null;
    if(!base&&!managed)return null;
    const courses=new Map((base?.courses||[]).map(c=>[c.id,{...c}]));
    (managed?.courses||[]).forEach(c=>{
      const previous=courses.get(c.id);
      if(!previous||c.date>=previous.date)courses.set(c.id,{...previous,...c});
    });
    const badges=new Map();
    const result=Array.from(courses.values()).map(c=>{
      const override=(catalog?.courses||[]).find(x=>x.id===c.id);
      const course=override?{...c,title:override.title,image:override.image,badgeName:override.badgeName||override.title}:c;
      if(course.image){
        const old=badges.get(course.image);
        if(!old||course.date>old.date)badges.set(course.image,{image:course.image,name:course.badgeName||course.title,date:course.date});
      }
      return course;
    }).sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title));
    return {cedula:managed?.cedula||base.cedula,name:managed?.name||base.name,courses:result,badges:Array.from(badges.values())};
  }
  root.PassportCatalog={mergePassport};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.PassportCatalog;
})(typeof globalThis!=='undefined'?globalThis:this);
