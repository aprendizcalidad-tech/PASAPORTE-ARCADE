# Validación de la entrega

## Ejecutado

- Lectura del Excel adjunto real mediante openpyxl y, de manera independiente, SheetJS 0.20.3.
- Procesamiento del archivo real con `js/normalizer.js`, el mismo código de Apps Script.
- Resultado: 95.812 filas, 1.951 perfiles, 288 cursos, 68.093 cursos únicos por persona, sumados; 27.719 duplicados consolidados; cero filas inválidas.
- 117 URLs diferentes de insignias en el catálogo representado por Archivo Plano. Después del cruce, 46.076 cursos únicos por persona no tienen URL de insignia.
- El perfil más grande del archivo tiene 142 cursos y ocupa 48.892 bytes de JSON, por debajo del límite preventivo de 850.000 bytes del backend.
- Se requieren 40 lotes de hasta 50 personas. Los perfiles normalizados completos ocupan aproximadamente 17,3 MB sin compresión; no se incluyen como datos públicos en el paquete.
- 7 pruebas automatizadas aprobadas: deduplicación/cruce/fecha, filtro 100, validación de entrada, prioridad de URL, conversiones Excel, publicación por versiones con reintentos y autorización/secuencia de importación.
- Sintaxis del código JavaScript y Apps Script, JSON válidos e igualdad de los dos normalizadores.
- Rutas locales de HTML y ausencia de IDs duplicados.

## Pendiente después de configurar las cuentas

- Login real con Firebase y correo de recuperación.
- Evaluación de reglas contra Firestore real o emulador; los tests del backend usan almacenamiento simulado.
- Permisos IAM y OAuth del propietario de Apps Script.
- Comunicación HTTP entre GitHub Pages y la implementación real de Apps Script.
- Conversión real de Drive, duración de la consolidación y ejecución de activadores.
- Revisión visual en navegador de escritorio y celular. No se ejecutó una prueba visual de navegador en este entorno.
- Accesibilidad y disponibilidad de cada URL externa de insignia.
- Prueba de concurrencia/carga de la instalación final; no se certifica un número de usuarios simultáneos.

La ilustración del fondo, el avatar y la medalla de fallback son recreaciones SVG propias. No se afirma equivalencia visual píxel a píxel con la referencia.
