# Instalación completa — Pasaporte Mundo Arcade

Sigue este orden. El código no requiere compilación. Todos los archivos necesarios están en el ZIP.

## Paso 1. Firebase y Google Apps Script

### 1.1 Crear Firebase

1. Abre https://console.firebase.google.com/ con la cuenta Google que administrará el proyecto.
2. Pulsa **Crear un proyecto / Agregar proyecto**. Nombre sugerido: `Pasaporte Mundo Arcade`.
3. Google Analytics es opcional y no lo necesita este proyecto. Puedes desactivarlo y continuar.
4. Al terminar, abre **Configuración del proyecto** con el engranaje junto a Descripción general.
5. En **General**, anota el **ID del proyecto** (texto) y el **número del proyecto** (solo dígitos). Son dos valores diferentes.
6. En **Tus apps**, pulsa el icono web **</>**. Nombre: `Pasaporte Web`. No marques Firebase Hosting porque usarás GitHub Pages.
7. Pulsa **Registrar app** y copia el objeto `firebaseConfig`.
8. Abre el archivo `firebase-config.js` del proyecto descargado y reemplaza sus campos `REEMPLAZAR...` por los valores exactos que copiaste. Mantén `export const firebaseConfig = ...` y `export const appConfig = ...`.

La configuración web es pública. No pegues una contraseña, una clave privada ni un JSON de cuenta de servicio en este archivo.

### 1.2 Crear Firestore

1. En Firebase, entra en **Compilación / Build → Firestore Database**.
2. Pulsa **Crear base de datos**.
3. Si aparece selección de edición, elige **Standard**. Usa la base **(default)**.
4. Selecciona una ubicación acorde con tu organización y confirma. La ubicación no se cambia fácilmente después.
5. Elige **modo producción**.
6. En la pestaña **Reglas**, reemplaza el contenido completo con el archivo `firestore.rules` incluido y pulsa **Publicar**.
7. No cambies las reglas a `allow read, write: if true`.

Las reglas permiten obtener un pasaporte por cédula solamente en la versión vigente; prohíben listar todas las personas y prohíben escribir desde el navegador. Apps Script escribe con el OAuth del propietario y los permisos IAM; por eso también valida el administrador dentro de su código.

**Modelo de acceso solicitado:** conocer la cédula permite ver nombre, cursos e insignias. La cédula no acredita identidad. La pantalla Ayuda lo explica; este proyecto no presenta esa consulta como un login privado.

### 1.3 Excluir los perfiles de los índices

Cada persona ocupa un documento con un campo `payload` que contiene su información serializada. Este campo no se consulta mediante filtros y no debe indexarse.

1. Firestore → **Índices → Campo único / Single field**.
2. Pulsa **Agregar exención / Add exemption**.
3. ID de colección/grupo: `people`.
4. Ruta del campo: `payload`.
5. Deshabilita todos los índices para ese campo (Ascendente, Descendente y Matrices/Arrays, cuando aparezcan). Guarda.

También puedes desplegar reglas e índices con la CLI, como se explica al final del Paso 4. El archivo `firestore.indexes.json` ya está configurado.

### 1.4 Habilitar login y crear al administrador

1. Firebase → **Compilación / Build → Authentication → Comenzar**.
2. Abre **Método de acceso / Sign-in method**.
3. Selecciona **Correo electrónico/contraseña** y habilita la primera opción. No hace falta enlace de correo sin contraseña.
4. Guarda.
5. Abre **Usuarios → Agregar usuario**. Escribe tu correo y una contraseña fuerte; guarda.
6. Copia el **UID** de ese usuario.
7. Ve a **Firestore → Datos → Iniciar colección**.
8. Colección: `admins`.
9. ID del documento: pega el **UID exacto**, no el correo.
10. Añade el campo `enabled`, tipo **boolean**, valor **true**. Guarda.

Para otro administrador, repite la creación del usuario y de su documento `admins/UID`. Para quitar el acceso, cambia `enabled` a `false`. No hay registro público de administradores ni se concede acceso por el solo hecho de tener una cuenta Firebase.

### 1.5 Preparar Google Cloud del mismo proyecto

1. Abre https://console.cloud.google.com/ y selecciona el proyecto cuyo ID coincide con el de Firebase.
2. En **APIs y servicios → Biblioteca**, busca y habilita:
   - **Cloud Firestore API**.
   - **Identity Toolkit API** (normalmente ya se habilitó con Authentication).
   - **Google Drive API**.
   - **Google Sheets API**.
3. En **IAM y administración → IAM**, comprueba que la cuenta Google que va a crear/desplegar Apps Script tenga permiso para escribir en Firestore. Si es la propietaria del proyecto ya lo tiene; para una cuenta con permisos limitados, añade el rol **Cloud Datastore User** (`roles/datastore.user`).
4. En **Google Auth Platform** o **APIs y servicios → Pantalla de consentimiento OAuth**, configura el nombre de la app y correo de soporte si se solicita. Si tu organización permite audiencia **Interna**, puedes elegirla. Con cuenta personal, usa **Externa**, autoriza inicialmente tu cuenta como usuario de prueba y, para activadores duraderos, pasa a **En producción** cuando completes la configuración. Un consentimiento externo en estado de prueba puede caducar y exigir nueva autorización.
5. No necesitas descargar cuentas de servicio ni crear una clave privada.

### 1.6 Crear el proyecto Apps Script y copiar todos los archivos

1. Abre https://script.google.com/ y pulsa **Nuevo proyecto**.
2. Ponle nombre: `Backend Pasaporte Mundo Arcade`.
3. Abre **Configuración del proyecto** (engranaje).
4. Activa **Mostrar el archivo de manifiesto appsscript.json en el editor**.
5. En **Proyecto de Google Cloud Platform → Cambiar proyecto**, pega el **número numérico** del proyecto Firebase. No pegues el ID de texto. Pulsa **Establecer proyecto**.
6. Regresa al **Editor**.
7. Reemplaza el contenido de `Code.gs` con `google-apps-script/Code.gs` del ZIP.
8. En **+ → Secuencia de comandos**, crea los archivos siguientes y pega su contenido completo:
   - `Firestore.gs`
   - `Normalizer.gs`
   - `DriveSync.gs`
   - `Maintenance.gs`
9. Abre `appsscript.json` en el editor y reemplázalo con `google-apps-script/appsscript.json` del ZIP.
10. Guarda. El manifiesto ya declara el servicio avanzado Drive v3. Si no aparece en **Servicios**, pulsa **+**, elige **Drive API**, versión **v3**, identificador **Drive**. No dupliques el servicio si ya aparece.

`Normalizer.gs` es exactamente el mismo normalizador que usa el navegador. Si lo modificas en el futuro, actualiza también `js/normalizer.js` para conservar ambos caminos equivalentes.

### 1.7 Propiedades del script

En **Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad**, crea:

| Propiedad exacta | Valor |
|---|---|
| `FIREBASE_PROJECT_ID` | El ID textual de Firebase, por ejemplo `pasaporte-arcade-12345`. |
| `FIREBASE_WEB_API_KEY` | El `apiKey` del mismo proyecto Firebase. |
| `DRIVE_SOURCE_ID` | ID del Excel o Google Sheets que usarás en Drive. Puedes dejarlo sin crear hasta configurar Drive. |

No crees propiedades con los textos `REEMPLAZAR` ni copies las claves de ejemplo.

Si posteriormente restringes la API key del frontend por referentes HTTP, esa clave puede dejar de funcionar desde Apps Script. En ese caso crea en el mismo proyecto una clave adicional para el servidor, restringida a **Identity Toolkit API** y sin restricción de referente de navegador; guarda esa clave solo en `FIREBASE_WEB_API_KEY`. La autorización del backend sigue dependiendo del token Firebase y del documento `admins/UID`.

### 1.8 Autorizar y comprobar la conexión

1. En el editor Apps Script, selecciona `verificarConexion` en el desplegable superior y pulsa **Ejecutar**.
2. Autoriza con la cuenta propietaria que tiene acceso al proyecto Firebase y al archivo Drive. Revisa que el proyecto al que das permiso sea el que acabas de crear.
3. Si aparece la advertencia de app propia no verificada, revisa la configuración OAuth y las políticas de tu organización; no uses cuentas ajenas.
4. En el registro de ejecución debe aparecer **Conexión correcta a ...**. Antes de importar es normal que diga **todavía sin importar**.
5. Si aparece HTTP 403, revisa el proyecto estándar asociado, IAM y Cloud Firestore API. Las reglas de Firestore no solucionan un error IAM del script.

### 1.9 Desplegar la aplicación web de Apps Script

1. Pulsa **Implementar → Nueva implementación**.
2. En el icono de engranaje, selecciona **Aplicación web**.
3. Descripción: `Pasaporte Mundo Arcade v1`.
4. **Ejecutar como:** **Yo** (la cuenta propietaria).
5. **Quién tiene acceso:** **Cualquier persona**. El endpoint debe poder recibir solicitudes desde GitHub Pages; las operaciones internas siguen exigiendo token y rol Firebase.
6. Pulsa **Implementar**, autoriza si lo solicita y copia la URL que termina en `/exec`.
7. En el archivo local `firebase-config.js`, pega esa URL en `appConfig.gasUrl`.
8. Abre esa URL en otra pestaña: debes ver JSON con `ok: true` y el nombre del servicio. Este GET no devuelve datos personales ni permite administrar.

Después de modificar un archivo `.gs`: **Implementar → Administrar implementaciones → Editar (lápiz) → Versión: Nueva versión → Implementar**. Guardar el código sin actualizar la implementación no actualiza la Web App.

Si una política de Workspace no permite el acceso **Cualquier persona**, el flujo web desde Pages necesita que el administrador de Workspace habilite esa posibilidad o que se cambie de backend. No existe un ajuste JavaScript que elimine esa política.

### 1.10 Configurar el origen en Drive

Tienes dos opciones:

**A. Mantener el Excel como Excel (sin convertirlo manualmente).**

1. En Drive, **Nuevo → Subir archivo**. Selecciona el Excel.
2. Obtén el ID del enlace: en `https://drive.google.com/file/d/ID/view`, el ID es lo que está entre `/d/` y `/view`.
3. Guarda ese ID en `DRIVE_SOURCE_ID`.
4. Para actualizar, sobre el mismo archivo: clic derecho → **Información del archivo → Administrar versiones → Subir nueva versión** (los rótulos pueden aparecer directamente como Administrar versiones). Usa esta opción para conservar el ID.
5. Si subes un archivo distinto con otro ID, actualiza la propiedad `DRIVE_SOURCE_ID`.

**B. Usar Google Sheets.**

1. Abre el Excel con Google Sheets y usa **Archivo → Guardar como Hojas de cálculo de Google** si todavía es un `.xlsx`.
2. Conserva exactamente las pestañas `Archivo Plano` e `Insignias` y sus encabezados.
3. Copia el ID de `https://docs.google.com/spreadsheets/d/ID/edit`.
4. Guarda el ID en `DRIVE_SOURCE_ID`. La cuenta que ejecuta Apps Script debe poder leerlo.

No publiques el Excel ni hagas público su enlace. El script puede leerlo con los permisos de su propietario.

### 1.11 Instalar activadores

1. En Apps Script, ejecuta una sola vez `instalarAutomatizacion` y autoriza.
2. En el icono **Activadores** (reloj), verifica:
   - `continuarDrive`: cada minuto.
   - `detectarCambiosDrive`: cada hora.
3. Para la primera sincronización, ejecuta `iniciarSincronizacionDrive` o usa **Sincronizar archivo de Drive** en el panel web.
4. `continuarDrive` crea una copia temporal privada, convierte el Excel si hace falta, consolida los datos y escribe lotes. Puede tardar varios minutos; el activador no se ejecuta necesariamente en el segundo exacto.
5. Al terminar se activa la nueva publicación y se envían a la papelera las copias temporales. El archivo fuente no se modifica.
6. Las siguientes actualizaciones del archivo se detectan por su fecha de modificación cada hora. El botón del panel permite solicitar una revisión sin esperar esa hora.

No hay activador `onEdit` sobre el Excel: la detección es periódica. La actualización del panel usa lotes desde el navegador; mantén la pestaña abierta hasta terminar. La actualización de Drive sí continúa con el navegador cerrado.

## Paso 2. Frontend, consulta y administrador

### 2.1 Comprobar los archivos

Mantén las carpetas originales. `index.html` debe quedar en la raíz del repositorio, junto a `styles.css` y `firebase-config.js`. Las rutas son relativas para funcionar en `https://USUARIO.github.io/REPOSITORIO/`.

No necesitas cambiar imports del SDK ni instalar dependencias. SheetJS está incluido en `assets/vendor/`, con su licencia; Firebase se carga desde su CDN oficial y las fuentes tienen fallback a Arial.

### 2.2 Probar el diseño sin configurar servicios

En VS Code abre la carpeta `pasaporte-mundo-arcade` y usa **Open with Live Server**, o en una terminal dentro de esa carpeta:

```bash
python -m http.server 8080
```

Visita:

```text
http://localhost:8080/?demo=1
```

Cédula de demostración: `1234567890`. Son datos ficticios y no se conectan a Firebase. Sin `?demo=1`, la consulta usa la configuración real.

### 2.3 Cómo se consulta

1. El usuario escribe la cédula sin puntos ni espacios.
2. El frontend lee `public/config` para saber la publicación vigente.
3. Obtiene exactamente `releases/{activeRelease}/people/{cedula}`.
4. Presenta los cursos e insignias. No descarga el Excel, no consulta toda la colección y no llama a Apps Script.

Al importar, se conservan cédulas como texto; si Excel ya perdió ceros iniciales al guardarlas como números, el programa no puede reconstruir esos ceros. Formatea la columna como texto cuando necesites conservarlos.

### 2.4 Importar desde `/admin/`

1. Abre `https://USUARIO.github.io/REPOSITORIO/admin/`.
2. Inicia sesión con el usuario creado en Firebase.
3. Pulsa **Seleccionar archivo Excel** y elige el archivo completo adjunto a esta conversación.
4. Espera a que aparezca el resumen. Para ese archivo deben aparecer 1.951 personas, 288 cursos y 68.093 cursos aprobados únicos por persona, sumados.
5. Si aparecen filas inválidas, corrige el archivo antes de publicar; la interfaz bloquea la importación.
6. Pulsa **Importar y publicar**. El proyecto original genera **40 lotes**.
7. Mantén la pestaña abierta. No subas a la vez otro archivo desde otra cuenta.
8. Cuando diga **Publicación completa**, abre el pasaporte y consulta una cédula que esté en tu Excel.
9. Si se interrumpe, inicia sesión de nuevo si hace falta, selecciona **el mismo archivo** y vuelve a pulsar **Importar y publicar** desde el mismo navegador. La huella SHA-256 y el cursor del servidor permiten continuar. El navegador guarda únicamente ID de tarea, UID y huella, no toda la base de personas.
10. Si perdiste el estado local, usa **Cancelar importación pendiente** y vuelve a importar el archivo completo. La versión pública anterior sigue disponible.

Una URL `/admin/` de GitHub Pages sirve un documento estático visible para cualquiera. La protección real se aplica al inicio de sesión, a los datos, al rol y a cada operación del backend. Ocultar HTML no constituye seguridad.

### 2.5 Reglas de consolidación

- Encabezados obligatorios: los diez de `Archivo Plano` y los tres de `Insignias` indicados en tu solicitud. Se toleran mayúsculas, acentos y espacios alrededor.
- Solo `percAprob` numérico 100 o texto `100`/`100%` cuenta como aprobado. El número 1 no se interpreta automáticamente como 100 % porque sería ambiguo; tu archivo usa 100.
- Se agrupa por cédula y se deduplica por `capCapacitacionId`.
- Se conserva la fecha final más reciente; si está vacía, se usa última acción y después inicio.
- La URL de insignia de la fila tiene prioridad. Si falta, se busca `capCapacitacionId = Id` en Insignias.
- No se inventa una insignia para un curso sin URL. Las imágenes repetidas se cuentan una sola vez por persona.
- Si una imagen remota falla, se ve una medalla neutra; el registro de la insignia se conserva. Algunas URLs de tu Excel pertenecen a servicios externos y pueden caducar o impedir el acceso.
- El catálogo del progreso son los cursos válidos presentes en Archivo Plano, no todos los registros de Insignias que quizá no correspondan a formación asignada.
- Cada nueva publicación reemplaza todo el conjunto público. Usa siempre el Excel completo; los registros excluidos desaparecen de la versión activa.

## Paso 3. CSS y fidelidad visual

El archivo `styles.css` está completo: colores, textura de papel, sombras del pliegue, bordes del libro, estados, cuadrículas, adaptación móvil y animaciones.

| Parte | Implementación |
|---|---|
| Fondo azul arcade | `body` + `assets/arcade-world.svg` |
| Cubierta, páginas y pliegue | `.book-wrap`, `.book`, `.page`, `.spine` |
| Búsqueda por cédula | `.search-panel`, `.search-fields`, `.primary` |
| Tarjetas de cursos | `.course-grid`, `.course-card` |
| Perfil y sello | `.profile-card`, `.round-stamp` |
| Cuatro indicadores | `.metrics`, `.metric`, `.progress-ring` |
| Insignias | `.badge-grid`, `.badge-card`, `.badge-image` |
| Apertura y giro | `@keyframes bookOpen`, `@keyframes pageTurn` |
| Aparición y brillo | `@keyframes badgePop`, `@keyframes shine` |
| Accesibilidad de movimiento | `prefers-reduced-motion` |

La composición sigue tu referencia. El avatar, paisaje y medalla de fallback son SVG propios: son recreaciones visuales, no los assets originales extraídos de la imagen. La interfaz real sigue mostrando datos del Excel aunque los títulos o cantidades no coincidan con los ejemplos de la imagen.

Puedes cambiar umbrales y nombres de niveles en `firebase-config.js`. Mantén ambos arrays con el mismo número de elementos y los umbrales en orden ascendente. Los umbrales predeterminados son 1, 5, 15, 30 y 50 cursos.

## Paso 4. Subir y activar GitHub Pages

### 4.1 Crear repositorio y subir desde VS Code

1. En https://github.com/new crea un repositorio llamado `PASAPORTE-MUNDO-ARCADE`.
2. Para Pages gratuito con la configuración más simple, elige **Public**. No incluyas datos personales, Excel, CSV ni claves privadas en el repositorio.
3. No marques README, gitignore ni licencia al crearlo si vas a subir esta carpeta con los comandos siguientes.
4. Descomprime el proyecto y abre **esa carpeta** en VS Code.
5. Confirma que ya editaste `firebase-config.js`.
6. En **Terminal → Nueva terminal**, ejecuta los siguientes comandos, cambiando `TU_USUARIO`:

```bash
git init
git add .
git commit -m "Crear Pasaporte Mundo Arcade"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/PASAPORTE-MUNDO-ARCADE.git
git push -u origin main
```

Si Git pide iniciar sesión, usa el flujo normal de autenticación de GitHub en VS Code. El `.gitignore` incluido excluye Excel y CSV; aun así, no copies la base de datos a la carpeta del sitio.

### 4.2 Activar Pages

1. En el repositorio GitHub, abre **Settings / Configuración**.
2. Menú izquierdo → **Pages**.
3. En **Build and deployment → Source**, elige **Deploy from a branch**.
4. Rama: **main**. Carpeta: **/(root)**.
5. Pulsa **Save** y espera a que termine el despliegue. Puedes verlo en **Actions**.
6. Abre la URL que muestra GitHub, normalmente:

```text
https://TU_USUARIO.github.io/PASAPORTE-MUNDO-ARCADE/
```

Panel:

```text
https://TU_USUARIO.github.io/PASAPORTE-MUNDO-ARCADE/admin/
```

Conserva la barra final. Es una carpeta real con `index.html`, por lo que no necesita router de React ni un 404 personalizado. El archivo `.nojekyll` evita procesamiento innecesario de Jekyll.

### 4.3 Autorizar el dominio en Firebase

1. Firebase → **Authentication → Configuración → Dominios autorizados**.
2. Pulsa **Agregar dominio**.
3. Añade `TU_USUARIO.github.io`, sin `https://` ni ruta del repositorio.
4. Si pruebas con Live Server, añade también `localhost` y, si lo usas, `127.0.0.1`.
5. Si más adelante conectas un dominio personalizado, añade ese dominio también.

### 4.4 Probar el flujo real

1. Abre el sitio sin `?demo=1`.
2. Entra a `/admin/`, inicia sesión e importa el Excel.
3. Confirma que se publica el total esperado.
4. Consulta una cédula del archivo y compara varios cursos y fechas con Excel.
5. Consulta una cédula inexistente: debe aparecer el mensaje sin resultados y no conservarse el perfil anterior.
6. Cierra sesión: el panel deja de permitir administrar.
7. En Firebase **Reglas → Simulador / Rules playground**, prueba lectura de `public/config` sin autenticación: debe permitirse. Prueba listar una colección o escribir una persona desde cliente: debe denegarse.
8. Actualiza el archivo Drive, pulsa sincronizar y revisa los activadores. Compara el resultado con la importación desde el panel.
9. Prueba el sitio desde celular y con navegación de teclado.

### 4.5 Actualizaciones posteriores

Desde VS Code, después de guardar cambios:

```bash
git add .
git commit -m "Actualizar Pasaporte Mundo Arcade"
git push
```

Si cambiaste `.gs`, también debes copiarlo a Apps Script y publicar una **Nueva versión** de su implementación. El repositorio GitHub no actualiza el script automáticamente.

### 4.6 Alternativa: desplegar reglas e índices por CLI

No es obligatoria si ya usaste la consola. Con Node.js instalado:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes --project TU_ID_REAL_DE_FIREBASE
```

Ejecuta dentro de la carpeta que contiene `firebase.json`. Sustituye el ID. No ejecutes `firebase init hosting`: el sitio se hospeda en GitHub Pages.

## Operación, límites y mantenimiento

La importación del archivo actual escribe aproximadamente 1.951 perfiles más los documentos de control. Es mucho menor que una escritura por cada una de las 95.812 filas. Cada consulta pública lee configuración y perfil, además de las lecturas que requieran las reglas. No hay listeners permanentes ni una llamada GAS por visitante.

El nivel gratuito publicado de Firestore incluye 50.000 lecturas, 20.000 escrituras y 20.000 eliminaciones al día, con 1 GiB de almacenamiento; verifica la consola antes de aumentar la frecuencia. No significa usuarios ilimitados ni es una prueba de concurrencia. No se necesita una función Cloud Functions ni una clave privada para este diseño.

GAS tiene un límite de ejecución por invocación. Se separan conversión, consolidación y escritura; los commits se reanudan por cursor. La fase de consolidación de Drive lee el archivo completo y tiene un máximo configurado de 120.000 filas. Su tiempo real depende de Google y no se ha medido en tu cuenta. Si esa fase excede el límite, usa la importación del panel, que procesa Excel en tu navegador. No se promete un número de usuarios simultáneos sin una prueba real.

Se conservan versiones para evitar publicar datos parciales. Después de varias importaciones, ejecuta `limpiarVersionesAntiguas` desde el editor de Apps Script: conserva la versión activa, la anterior y la última tarea; borra versiones publicadas antiguas o canceladas y sus temporales. Si indica limpieza parcial, ejecútala de nuevo. Las eliminaciones también consumen cuota.

Si Drive quedó con estado `error`, revisa primero **Ejecuciones** y corrige la causa. Luego ejecuta `reanudarDrive` para continuar desde el cursor guardado. Si quieres empezar con un archivo corregido completamente, cancela la importación desde el panel y solicita una nueva. Si una ejecución fue cortada por tiempo sin llegar al manejador de errores, el siguiente activador retoma la fase guardada; puedes cancelarla si vuelve a superar el límite.

## Solución de errores

| Síntoma | Revisión concreta |
|---|---|
| `Falta configurar Firebase` | Reemplaza TODOS los campos indicados en `firebase-config.js` y vuelve a subirlo. |
| `auth/invalid-api-key` | Copia la configuración de la app Web del mismo proyecto. |
| Login no permite ingresar | Habilita Email/Password, verifica usuario y dominios autorizados. |
| Cuenta no autorizada | Documento `admins/UID` exacto con `enabled` booleano `true`. |
| Firestore HTTP 403 desde GAS | IAM de la cuenta propietaria, proyecto Cloud estándar y API de Firestore. |
| Sesión rechazada desde GAS | API key del mismo proyecto; revisa restricciones de clave y token/usuario. |
| `Failed to fetch` o respuesta HTML | URL `/exec`, acceso Cualquier persona, Ejecutar como Yo, nueva versión desplegada, políticas Workspace. No uses `/dev` ni `mode: no-cors`. |
| Carga interrumpida | Reelige el mismo Excel en el mismo navegador para reanudar; el cursor evita duplicados. |
| Hay importación pendiente | Reanuda esa importación o cancélala antes de iniciar otra. |
| Drive no avanza | Ejecuta `instalarAutomatizacion`, revisa reloj/activadores y Ejecuciones; comprueba DRIVE_SOURCE_ID. |
| No aparece un curso | Verifica aprobación 100, ID y cédula válidos; duplicados se consolidan. |
| Falta la imagen de insignia | Confirma URL HTTPS accesible y vigencia; los enlaces privados o temporales pueden fallar. |
| Error de cuotas | Revisa Uso en Firebase y ejecuciones GAS. Evita reimportaciones innecesarias. La última publicación completa permanece activa. |
| Pages da 404 | `index.html` en raíz, main + /(root), Actions completado y URL con nombre del repositorio. |
| Cambié .gs y sigue igual | Implementar → Administrar implementaciones → Editar → Nueva versión. |

## Documentación oficial consultada

- Firebase web: https://firebase.google.com/docs/web/setup
- Firebase Auth REST / validación de cuenta: https://firebase.google.com/docs/reference/rest/auth
- Condiciones de reglas: https://firebase.google.com/docs/firestore/security/rules-conditions
- Lecturas get/list: https://firebase.google.com/docs/firestore/security/rules-query
- Cuotas Firestore: https://firebase.google.com/docs/firestore/quotas
- Proyecto Google Cloud de Apps Script: https://developers.google.com/apps-script/guides/cloud-platform-projects
- ContentService y redirecciones: https://developers.google.com/apps-script/guides/content
- Drive e importación de Excel: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Cuotas Apps Script: https://developers.google.com/apps-script/guides/services/quotas
- SheetJS: https://docs.sheetjs.com/docs/getting-started/installation/standalone/
- GitHub Pages: https://docs.github.com/es/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
