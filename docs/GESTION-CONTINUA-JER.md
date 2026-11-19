# Activar Pasaporte del Conocimiento JER

La actualización conserva Firebase y el historial por versiones de Excel. Añade un catálogo de cursos e insignias y actualizaciones manuales por persona.

## Activar en este orden

1. En el proyecto de Apps Script que sirve la URL actual `gasUrl`, actualiza `Code.gs` y `Normalizer.gs`, y agrega `Catalog.gs` y `CatalogModel.gs` desde `google-apps-script/`. Conserva los otros archivos y las propiedades del proyecto.
2. Abre **Implementar → Gestionar implementaciones → Editar → Versión nueva → Implementar**. Mantén el despliegue y la URL `/exec` existentes. Subir código a GitHub no actualiza Apps Script.
3. Publica `firestore.rules` en **Firebase → Firestore Database → Reglas**. Para reglas e índices con Firebase CLI ejecuta desde esta carpeta `firebase deploy --only firestore --project pasaporte-mundo-arcade`. El archivo `firestore.indexes.json` incluye las exclusiones de campos necesarias. Conserva el rol `admins/UID` con `enabled: true` para los administradores.
4. Después de activar Apps Script y las reglas, copia los archivos de este paquete a sus mismas rutas en el repositorio y súbelos a `main` para publicar el frontend por GitHub Pages. No publiques el nuevo frontend antes de las reglas: consulta documentos nuevos. Recarga la web y `/admin/`.
5. Inicia sesión con el administrador existente y verifica una cédula conocida, una nueva, el cambio de insignia y la inactivación. La lógica se ha probado localmente y la portada, el historial y la ruta se han revisado en navegador con datos ficticios. Falta comprobar el acceso administrativo y las escrituras con las cuentas reales.

## Uso diario

- Selecciona el Excel completo y revisa su validación. **Añadir cursos al catálogo sin publicar personas** incorpora los cursos válidos de Archivo Plano y de Insignias, incluidos los que aún no tienen aprobaciones, sin modificar los pasaportes ni sobrescribir diseños editados. También puedes crear cursos manualmente.
- Pulsa **Cargar catálogo actualizado**, busca un curso y cambia su nombre o URL de insignia. Usa el mismo ID de capacitación para actualizar el historial existente. Un ID nuevo representa un curso distinto.
- Para crear un curso usa **Nuevo curso** y guarda. Esto no concede aprobaciones. Archivar impide nuevas aprobaciones manuales y conserva el historial.
- En **Actualizar un pasaporte**, busca por cédula, corrige el nombre o registra a la persona. Selecciona cursos y fechas, pulsa **Añadir a la lista** y después **Guardar persona y aprobaciones**. También puedes registrar una persona sin cursos. Inactivar oculta su pasaporte público y conserva sus datos.
- El campo de insignia admite una URL HTTPS pública y directa a la imagen. Publica el diseño en el alojamiento de imágenes de la empresa o en los recursos públicos del repositorio. La vista previa ayuda a comprobarlo. Este panel no sube archivos a Firebase Storage. Un enlace privado de Drive o una página para compartir no equivale a una imagen pública.
- Dejar la imagen vacía retira la insignia del curso, sin eliminar su aprobación. Usa una URL nueva cuando reemplaces un diseño para evitar caché.

## Historial y límites

`releases/{versión}/people/{cédula}` conserva la publicación completa de Excel. `public/catalog` guarda el catálogo editorial, sin datos personales. `managedPeople/{cédula}` guarda nombre corregido, estado y aprobaciones manuales.

Las importaciones completas siguen reemplazando la publicación anterior: usa siempre un archivo con todo el historial que deba permanecer. Las actualizaciones manuales están separadas y sobreviven a las siguientes importaciones, incluso si la persona falta en el Excel. Para ocultarla, inactiva su pasaporte.

Una cédula + ID se cuenta una vez; se conserva la fecha de aprobación más reciente al combinar ambas fuentes. Retirar una aprobación manual no retira la que exista en Excel. Para corregir una aprobación del Excel, corrige y vuelve a publicar el archivo completo. Cambiar un nombre de curso o insignia en el catálogo afecta todas las aprobaciones de ese ID.

Las estadísticas superiores del administrador describen la última importación, sin contar altas manuales; el pasaporte y su ruta usan los cursos combinados. Las insignias se deduplican por URL de imagen, igual que antes.

Las escrituras pasan por Apps Script, que valida Firebase Auth y el rol administrador antes de despachar acciones. Las reglas rechazan escrituras directas y listados públicos de personal. Como antes, conocer una cédula permite consultar su pasaporte; la cédula no es autenticación. El catálogo y cada ficha manual tienen un límite de 800 KB; el servidor rechaza el exceso. Si el volumen supera ese límite, será necesario dividir las colecciones.

Las revisiones evitan sobrescribir ediciones de otra sesión: si se informa de un conflicto, vuelve a cargar antes de editar. Tras un corte de conexión, recarga para comprobar si el cambio quedó guardado antes de repetirlo.

## Verificación

`npm run check` y `npm test` verifican sintaxis, historial anterior, rediseño por ID, deduplicación, registro sin Excel, inactivación, fechas, conflictos de revisión y catálogo aditivo. La portada, el historial y la ruta se revisaron en navegador con datos ficticios. Hace falta validar login, reglas, Apps Script y gestión administrativa con las cuentas reales después del despliegue.
