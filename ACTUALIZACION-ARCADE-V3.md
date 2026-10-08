# Tu Ruta Arcade · actualización V3

## Instalar en tu sitio actual

1. Extrae `PASAPORTE-ARCADE-ACTUALIZACION-V3.zip`.
2. Copia estos archivos a las mismas rutas de tu proyecto:

```
index.html
styles.css
js/app.js
js/progress.js
assets/sello-jer.jpeg
assets/animales-avatar.jpeg
assets/ruta-arcade-mundo.png
assets/ruta-arcade-aventura.png
```

3. Conserva tu `firebase-config.js`: NO lo reemplaces. No necesitas cambiar Firebase, sus reglas, Apps Script, los activadores o volver a importar el Excel.
4. Publica los cambios en GitHub Pages. Con VS Code, desde la carpeta del repositorio:

```bash
git add index.html styles.css js/app.js js/progress.js assets/sello-jer.jpeg assets/animales-avatar.jpeg assets/ruta-arcade-mundo.png assets/ruta-arcade-aventura.png
git commit -m "Agrega Ruta Arcade con hitos y copa de 600 cursos"
git push
```

Si trabajas directamente en GitHub: Add file → Upload files, arrastra `index.html`, `styles.css` y las carpetas `js` y `assets` de este ZIP, que contienen solo los archivos actualizados. Conserva las rutas y pulsa Commit changes. No subas el ZIP al repositorio.

5. Espera a que GitHub Pages termine la publicación. Recarga con Ctrl + F5.
6. Consulta una cédula del Excel y pulsa «Progreso» en el menú, o «Explorar mi ruta» en Mi progreso. En celular, usa la pestaña «Mi progreso» bajo la cabecera.

## Qué funciona

- Vista independiente `#ruta`, con islas flotantes, perfil, sello JER y el mismo avatar animal del pasaporte.
- Nombre y cédula reales; conteos de cursos aprobados únicos e insignias asociadas tomados del perfil que ya consulta Firestore.
- Últimas aventuras: los tres cursos con fecha de finalización más reciente. Si falta una fecha, se indica «Sin fecha registrada».
- Clic en un curso abre su detalle real.
- Galería paginada de imágenes reales de insignias. Usa los puntos y las flechas. Si falla una URL se muestra la medalla de respaldo.
- «Ver todos mis cursos», «Ver todas mis insignias» y «Explorar mis cursos» regresan al libro y abren las hojas completas del historial, sin consultar nuevamente la base de datos.
- «Consultar otra cédula» regresa al formulario.
- Entrar a Progreso sin consultar muestra instrucciones, no datos inventados.
- No se incorpora catálogo obligatorio, cursos faltantes ni clasificación por áreas.

## Copa y hitos

La copa y Templo Leyenda tienen una meta fija de **600 cursos completados**. La barra mide `cursos únicos completados / 600`, limitada visualmente al 100 %. Al alcanzar o superar 600 aparece «Copa Leyenda alcanzada» y el nivel «Leyenda Arcade»; el número real de cursos permanece visible.

| Isla | Meta de cursos únicos aprobados |
|---|---:|
| Portal de inicio | 1 |
| Isla Explorador | 5 |
| Ciudad Arcade | 15 |
| Fortaleza del conocimiento | 30 |
| Torre Maestra | 75 |
| Templo Leyenda | 600 |

Estas son metas de gamificación. No son asignaciones, categorías ni requisitos extraídos del Excel. Las islas se iluminan cuando el conteo real alcanza la meta. Al pulsar cada isla se muestra su significado y el conteo real. Ninguna isla indica cursos obligatorios pendientes.

Los niveles existentes del pasaporte se conservan hasta 74 cursos; desde 75 se muestra Maestro Arcade, y desde 600, Leyenda Arcade. Los dos últimos niveles se definen en el frontend. No se escriben valores nuevos en Firestore.

## Diseño y comprobaciones

Se recreó la composición de la referencia: mapa a la izquierda, ficha de progreso a la derecha, aventuras y galería debajo, banner de exploración, azul noche/cian y superficies claras. Las ilustraciones se reconstruyeron a partir de la referencia; no se garantiza identidad píxel a píxel. Todos los rótulos y números de la interfaz son HTML dinámico.

Verificación: sintaxis JS; IDs HTML únicos y rutas locales; simulación del DOM de navegación, datos, copa antes y después de 600, hitos, fechas, 117 insignias con paginación acotada, regreso al libro, giro de página, vacíos y escape HTML. La apariencia, animaciones y distribución todavía deben verificarse en un navegador real. No se alteró ni se volvió a probar el backend contra tu cuenta.

## Ilustraciones

Assets guardados en `assets/ruta-arcade-mundo.png` y `assets/ruta-arcade-aventura.png`, generados con la herramienta integrada de imágenes a partir de tu referencia.

Prompts: reconstruir el paisaje de islas flotantes del lado izquierdo sin textos ni interfaz, con portal, bosque, ciudad cian, fortaleza, torre dorada, aventurero y templo de la copa; reconstruir el banner inferior derecho al atardecer, con aventurero de mochila azul y bandera arcade, sin textos ni botones. Los prompts completos se incluyen en `docs/PROMPTS-RUTA-ARCADE.md` del proyecto completo.
