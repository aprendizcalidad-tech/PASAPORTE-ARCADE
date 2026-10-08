# Actualización visual · Pasaporte Mundo Arcade

## Cambios
- Mi progreso: cursos completados, insignias obtenidas y nivel. Sin totales del catálogo ni porcentaje de avance.
- Un único botón «Ver más cursos e insignias» abre las hojas del historial.
- Cursos en la hoja izquierda e insignias grandes en la derecha, seis registros por lado y pareja de hojas. Los cursos y las insignias tienen cantidades independientes.
- Giro de hoja en 3D, brillo de las insignias y botones Anterior, Siguiente y Volver a mi pasaporte. También se pueden usar las flechas del teclado; Escape vuelve al resumen.
- En el celular se conservan cursos a la izquierda e insignias a la derecha. Si el sistema solicita movimiento reducido, el cambio de hojas es inmediato.
- Sello JER «Une tus sueños» y avatar animal elegido al azar al cargar o consultar. Una nueva consulta evita repetir el animal inmediatamente anterior.

## Archivos que debes actualizar en tu repositorio

```
index.html
styles.css
js/app.js
assets/sello-jer.jpeg
assets/animales-avatar.jpeg
```

Conserva tu `firebase-config.js` actual: contiene los valores reales de Firebase y la URL de Apps Script. El archivo incluido en el proyecto completo es una plantilla; no lo copies encima de tu configuración.

No necesitas ejecutar otra importación ni cambiar Firestore, Apps Script, sus propiedades o sus activadores para aplicar esta actualización visual.

## Con Visual Studio Code
1. Extrae el ZIP.
2. Copia únicamente los cinco archivos anteriores a tu proyecto, en sus rutas correspondientes. Acepta reemplazar los archivos que ya existen.
3. Desde la carpeta del repositorio ejecuta:

```bash
git add index.html styles.css js/app.js assets/sello-jer.jpeg assets/animales-avatar.jpeg
git commit -m "Actualiza pasaporte con hojas animadas, sello JER y avatares"
git push
```

4. Espera a que la publicación de GitHub Pages termine y abre la página con Ctrl + F5.
5. Consulta una cédula existente y pulsa «Ver más cursos e insignias». Prueba Siguiente, Anterior y Volver a mi pasaporte.

## Desde GitHub
1. Extrae el ZIP y localiza los cinco archivos indicados.
2. En `PASAPORTE-ARCADE`, usa Add file → Upload files. Arrastra `index.html`, `styles.css` y las carpetas `js` y `assets` del paquete de actualización, que contienen únicamente los archivos cambiados.
3. Conserva las rutas: `js/app.js`, `assets/sello-jer.jpeg` y `assets/animales-avatar.jpeg`. No subas el ZIP como un archivo al repositorio.
4. Guarda con Commit changes. Espera a que GitHub Pages termine de publicar y recarga con Ctrl + F5.

## Verificación realizada
Sintaxis de JavaScript correcta. Lógica de interfaz comprobada en una simulación del DOM con 45 cursos y 13 insignias: paginación completa, últimas hojas, regreso al resumen, giros en ambas direcciones, movimiento reducido, ausencia de insignias, cambios de avatar y limpieza de consulta. Comprobadas rutas locales e IDs HTML únicos.

La animación y la apariencia todavía deben comprobarse en un navegador real. Firebase y el backend no se modificaron ni se volvieron a probar contra tu cuenta.

Las dos imágenes proporcionadas se conservan sin modificar. Los animales se muestran mediante posiciones de fondo CSS sobre la lámina original.
