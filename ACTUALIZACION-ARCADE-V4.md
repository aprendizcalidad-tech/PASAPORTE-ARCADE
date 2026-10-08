# Corrección V4: personaje que recorre las islas

## Instalar sobre la versión V3
1. Extrae el ZIP y copia a las mismas rutas:

```
index.html
styles.css
js/app.js
js/progress.js
assets/ruta-arcade-mundo-v4.png
assets/ruta-arcade-personaje.png
```

2. Conserva tu `firebase-config.js` y los demás archivos. No hay cambios en Firebase, Apps Script o el Excel.
3. Sube los archivos a GitHub y espera la publicación de Pages. Recarga con Ctrl + F5.
4. Consulta tu cédula y abre Progreso. El personaje recorrerá las islas ya alcanzadas y se detendrá en la última. Usa «Recorrer mi ruta» para repetir.

Con VS Code:

```bash
git add index.html styles.css js/app.js js/progress.js assets/ruta-arcade-mundo-v4.png assets/ruta-arcade-personaje.png
git commit -m "Anima el personaje de Ruta Arcade según los cursos completados"
git push
```

## Ubicación según los datos reales

| Cursos completados únicos | Isla del personaje |
|---|---|
| 1–4 | Portal de inicio |
| 5–14 | Isla Explorador |
| 15–29 | Ciudad Arcade |
| 30–74 | Fortaleza del conocimiento |
| 75–599 | Torre Maestra |
| Desde 600 | Templo Leyenda |

Con 40 cursos, como en tu captura, el personaje termina en Fortaleza del conocimiento. Se ilumina el rótulo de la isla actual. Sin consulta o con cero cursos, el personaje se oculta.

El personaje es ahora una imagen transparente independiente: se retiró del fondo. Al entrar a Progreso o repetir el recorrido, se desplaza entre las plataformas con una animación de pasos; al detenerse conserva un movimiento suave. Cambiar de cédula o salir cancela el recorrido anterior. Si el dispositivo solicita movimiento reducido, se coloca directamente en su isla.

Comprobaciones realizadas: sintaxis, transparencia de la imagen, IDs/rutas y simulación del DOM para los umbrales, 40→Fortaleza, 600→Templo, recorrido, repetición, cambio rápido de persona, salida de pestaña y movimiento reducido. La apariencia y el movimiento todavía requieren revisión en navegador real.

Imágenes creadas con la herramienta integrada: `assets/ruta-arcade-mundo-v4.png` (el mismo paisaje sin personaje) y `assets/ruta-arcade-personaje.png` (personaje separado sobre transparencia). Prompts: retirar únicamente el aventurero del paisaje conservando las islas y reconstruir el camino; extraer/recrear el personaje de mochila azul con corona, entero, en postura de caminar y fondo transparente.
