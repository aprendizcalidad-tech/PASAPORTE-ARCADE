# Pasaporte Mundo Arcade

Proyecto HTML, CSS y JavaScript sin compilación para GitHub Pages, Firebase Auth/Firestore y Google Apps Script.

**Empieza por `docs/GUIA-PASO-A-PASO.md`.** Allí están los botones, campos, valores y comprobaciones en orden. El código está completo en archivos separados; `docs/CODIGO-COMPLETO.md` contiene además bloques modulares para copiar y pegar, incluido TODO el CSS propio.

## Qué viene listo

- Libro abierto con textura de papel, cubierta azul, pliegue central, entorno arcade, navegación y adaptación a celular.
- Consulta pública por cédula, cursos aprobados, fechas, insignias, progreso y detalle de cada curso.
- Animación de apertura/página, tarjetas con elevación, insignias con aparición y brillo; respeta movimiento reducido.
- `/admin/`: acceso con Firebase Auth, autorización por UID, restablecimiento de contraseña, lectura del Excel en Web Worker, validación, previsualización, importación y reanudación.
- Apps Script valida el token y el rol de administrador; publica por lotes de 50 personas. Las consultas públicas usan Firestore directamente.
- Sincronización desde Excel o Google Sheets en Drive, activadores y estados persistentes.
- Publicación por versiones: un fallo conserva la versión completa anterior. Las personas ausentes del nuevo archivo dejan de aparecer cuando se publica.
- Reglas de Firestore, exclusión de índices de payload, limpieza manual de versiones, pruebas automatizadas y guía de solución de errores.

## Lo que debes configurar en tus cuentas

Las credenciales y proyectos reales no se pueden inventar: crea tu Firebase, copia la configuración web, habilita Authentication, autoriza el UID administrador, configura y despliega Apps Script, pega su URL `/exec` y activa GitHub Pages. No se ha desplegado ni probado contra tus cuentas.

No necesitas instalar React, hacer build, comprar un dominio ni mantener un computador encendido. Para abrir una vista local usa Live Server de VS Code o `python -m http.server 8080`. Visita `http://localhost:8080/?demo=1` para una demostración con la cédula ficticia `1234567890`. No abras `index.html` con doble clic: los módulos requieren HTTP.

## Validación de tu archivo

| Dato | Resultado |
|---|---:|
| Filas de Archivo Plano | 95.812 |
| Personas con cursos aprobados | 1.951 |
| Cursos diferentes en Archivo Plano | 288 |
| Cursos aprobados únicos por persona, sumados | 68.093 |
| Repeticiones consolidadas | 27.719 |
| Filas con aprobación distinta de 100 | 0 |
| Filas inválidas | 0 |
| URLs únicas de insignias asociadas al catálogo del archivo | 117 |
| Cursos aprobados sin imagen, después del cruce | 46.076 |
| Lotes de importación de 50 personas | 40 |

Se verificó el archivo real con SheetJS 0.20.3 y el mismo normalizador del proyecto. El Excel original no se incluye en el repositorio ni en el sitio: se carga desde el administrador o se mantiene privado en Drive.

## Diseño y significado de los datos

La interfaz recrea la composición y el estilo de la imagen adjunta con HTML/CSS y gráficos SVG propios. Los gráficos decorativos y el avatar son recreaciones, no los assets originales ni una garantía de identidad píxel a píxel. Las insignias reales se muestran usando las URLs del Excel. El archivo no contiene fotos; por eso se usa un avatar ilustrado y no una foto atribuida a una persona.

La referencia muestra cinco cursos ficticios de SST. El sitio real muestra los nombres y fechas de tu Excel. No se agregan pendientes o alertas rojas ficticias: todas las filas de tu archivo actual están aprobadas al 100 %. Las alertas aparecen cuando hay errores de consulta/importación.

El progreso es **cursos únicos completados / cursos únicos del Archivo Plano**; no es cumplimiento obligatorio ni tasa de aprobación. Los niveles son reglas de gamificación editables en `firebase-config.js`: 1, 5, 15, 30 y 50 cursos. No vienen del Excel. Las insignias se cuentan por URL distinta para no duplicar la misma imagen.

## Estructura

```text
pasaporte-mundo-arcade/
  index.html
  styles.css
  firebase-config.js
  firestore.rules
  firestore.indexes.json
  firebase.json
  .nojekyll
  .gitignore
  admin/
    index.html
    admin.css
  assets/
    arcade-world.svg
    avatar.svg
    medal.svg
    vendor/                  SheetJS y su licencia, incluidos
  js/
    app.js
    admin.js
    firebase.js
    normalizer.js
    excel-worker.js
  google-apps-script/
    Code.gs
    Firestore.gs
    Normalizer.gs
    DriveSync.gs
    Maintenance.gs
    appsscript.json
  docs/
    GUIA-PASO-A-PASO.md
    CODIGO-COMPLETO.md
    VALIDACION.md
    validacion-excel.json
  tests/
  package.json
```

## Pruebas

Con Node.js 18 o superior, desde la carpeta del proyecto:

```bash
npm run check
npm test
```

No hace falta `npm install`. Las pruebas verifican consolidación, cruce, fechas, entrada inválida, publicación atómica, reintentos, secuencia, permisos de propietario y exclusión de importaciones concurrentes. No sustituyen una prueba real de login, reglas, IAM, CORS y activadores con las cuentas configuradas.
