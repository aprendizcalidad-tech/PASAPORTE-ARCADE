/* La lectura de las 95.812 filas se hace fuera del hilo de la interfaz. */
importScripts('../assets/vendor/xlsx.full.min.js', './normalizer.js');
self.onmessage = function (event) {
  try {
    const book = XLSX.read(event.data, {type:'array',cellDates:true});
    for (const name of ['Archivo Plano','Insignias']) if (!book.Sheets[name]) throw new Error('Falta la pestaña "' + name + '".');
    const rows = name => XLSX.utils.sheet_to_json(book.Sheets[name], {header:1,defval:'',raw:true});
    self.postMessage({ok:true, data:ArcadeNormalizer.build(rows('Archivo Plano'),rows('Insignias'))});
  } catch (error) { self.postMessage({ok:false,error:error.message}); }
};
