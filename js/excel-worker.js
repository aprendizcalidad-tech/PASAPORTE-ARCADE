/* La lectura de las 95.812 filas se hace fuera del hilo de la interfaz. */
importScripts('../assets/vendor/xlsx.full.min.js', './normalizer.js', './course-import.js?v=1');
self.onmessage = function (event) {
  try {
    if(event.data?.mode==='courses'){
      const book=XLSX.read(event.data.buffer,{type:'array',cellDates:false});
      const sheets=book.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:true})})).filter(s=>PassportCourseImport.hasHeaders(s.rows));
      if(sheets.length!==1)throw new Error('El archivo debe contener una sola hoja con id, nombre y estadoId.');
      self.postMessage({ok:true,courses:PassportCourseImport.parse(sheets[0].rows)});return;
    }
    const book = XLSX.read(event.data, {type:'array',cellDates:true});
    for (const name of ['Archivo Plano','Insignias']) if (!book.Sheets[name]) throw new Error('Falta la pestaña "' + name + '".');
    const rows = name => XLSX.utils.sheet_to_json(book.Sheets[name], {header:1,defval:'',raw:true});
    self.postMessage({ok:true, data:ArcadeNormalizer.build(rows('Archivo Plano'),rows('Insignias'))});
  } catch (error) { self.postMessage({ok:false,error:error.message}); }
};
