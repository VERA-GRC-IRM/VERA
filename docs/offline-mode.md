# VERA sin conexión

El objetivo es permitir trabajo útil después de una sesión inicial en línea, sin confundir un borrador local con un cambio confirmado por Supabase. La base de datos y los permisos del servidor siguen siendo la fuente de verdad.

## Etapa 1: aplicación disponible

La interfaz se puede instalar como aplicación web. Después de abrirla una vez con conexión, el navegador conserva HTML, JavaScript, CSS e imágenes de VERA y permite volver a abrir la interfaz sin red. Un aviso accesible indica la desconexión. El servicio de caché **no guarda respuestas de `/api`, tokens, archivos privados ni llamadas a Supabase o Azure**. En esta etapa, iniciar sesión, consultar datos y guardar cambios todavía requieren conexión.

La presencia de `navigator.onLine` es una señal del dispositivo, no una prueba de que Supabase, Vercel o Azure estén disponibles. Las operaciones deben manejar los fallos HTTP y de red por separado.

La comprobación focalizada se ejecuta con `npm run build --prefix frontend` y `npx playwright test --config playwright.offline.config.js` dentro de `frontend/`. Usa el build de producción y desconecta Chromium después de instalar el service worker; también comprueba que `/api` no se sirva desde la caché. No sustituye una matriz completa de navegadores.

## Contrato para las siguientes etapas

1. **Consulta local:** solo registros que la cuenta haya recibido legítimamente y elegido conservar. Separar por ID de usuario y de entorno; mostrar el momento de la última sincronización. Bloquear al cerrar sesión o cambiar de cuenta; permitir borrar la copia del dispositivo. Las copias deben caducar y no prueban permisos actuales cuando falta red.
2. **Borradores:** cada cambio local se identifica como `Pendiente de sincronizar`; no se presenta como aprobado, enviado o registrado en Supabase. Guardar la versión del expediente usada al editar.
3. **Sincronización:** al recuperar conexión, exigir una sesión vigente. El servidor vuelve a aplicar permisos y reglas de negocio. Los conflictos de versión y los rechazos se muestran para revisión humana; no se sobrescriben silenciosamente. Las repeticiones de red no deben duplicar operaciones.
4. **Evidencias:** archivos preparados localmente tienen límites de tamaño y caducidad; no quedan publicados ni vinculados hasta que el servidor confirme la carga.
5. **Decisiones y IA:** aprobaciones, rechazos y cambios de rol necesitan confirmación del servidor. La IA de Azure requiere red; un futuro modelo local tendría otro contrato, evaluación y requisitos de dispositivo.

## Aceptación

Probar apertura sin red tras una visita, recarga de rutas internas, cierre de sesión y cambio de cuenta, pérdida de red durante una operación, reconexión, conflictos, expiración de sesión, cuota de almacenamiento y privacidad de datos. Registrar por separado Chrome, Edge, Firefox y dispositivos móviles que se ejecuten realmente. La instalación y caché estática no acreditan por sí solas el modo de datos sin conexión.

## Etapa 2: espacio local protegido

La pantalla **Sin conexión** permite habilitar una copia local individual después de comprobar una sesión vigente en línea. Cada cuenta crea una frase exclusiva para este dispositivo. El contenido se guarda en IndexedDB cifrado con AES-GCM; la clave se deriva de la frase con PBKDF2 y solo permanece en memoria mientras el espacio está desbloqueado. La frase no se envía al servidor. Cerrar sesión bloquea el espacio, pero la copia cifrada permanece hasta que la persona la borra explícitamente.

La protección depende también de la seguridad del dispositivo y de la fuerza de la frase. No sustituye los permisos del servidor ni permite iniciar una sesión nueva sin red. En esta etapa el espacio contiene únicamente una estructura vacía: **aún no guarda expedientes, borradores ni archivos**. Su prueba focalizada verifica cifrado en almacenamiento, frase incorrecta, bloqueo al recargar, separación por cuenta y borrado.

## Etapa 3: consulta de secciones autorizadas

Con la sesión vigente y el espacio desbloqueado, la persona elige secciones y pulsa **Actualizar secciones elegidas**. Cada respuesta la entrega el backend con sus permisos normales; solo las respuestas correctas se guardan en el espacio cifrado. Se admiten panel general, propuestas, auditorías activas, riesgos, responsables autorizados, controles, hallazgos, planes de acción, metadatos de evidencias y pendientes. No se guardan archivos descargados, enlaces de descarga ni credenciales. Una actualización parcial informa qué secciones se guardaron y cuáles fallaron.

Al fallar la red, las consultas iniciales de esas vistas pueden leer la copia elegida. Un aviso indica qué sección y cuándo se guardó. Una respuesta del servidor, incluso `401` o `403`, **nunca se sustituye por la copia**. Las consultas filtradas o de detalle que no se guardaron tampoco se sustituyen silenciosamente. Las copias caducan 24 horas después de su descarga y cada sección tiene límite de 2 MiB; el conjunto, 8 MiB. Cambios, decisiones, IA, reportes y archivos siguen necesitando conexión en esta etapa.

## Etapa 4: borradores locales

El espacio local permite escribir notas de trabajo y preparar comentarios o avances de planes de acción vinculados a un hallazgo. Estos últimos usan la copia vigente del plan para guardar su ID y versión. Cada borrador queda cifrado, separado por cuenta, limitado en tamaño y etiquetado **Pendiente de usar**. Crear o borrar un borrador funciona sin red; cerrar la pestaña lo bloquea hasta introducir la frase local de nuevo.

Los borradores **no se envían ni se aplican al servidor** en esta etapa. Las notas generales pueden servir de referencia para cualquier módulo, pero no se convierten automáticamente en registros. La sincronización posterior tendrá que revalidar sesión, permisos, versión y reglas de negocio antes de modificar un plan.

## Etapa 5: envío controlado de planes

Al recuperar la conexión, la persona puede enviar manualmente un comentario o avance de plan. VERA consulta la versión actual con una sesión vigente y solo intenta el cambio si coincide con la versión del borrador. El backend vuelve a validar permisos y reglas, y rechaza cambios simultáneos. Una respuesta `409` marca **Conflicto de versión**. Si la red se corta después de enviar la solicitud y no se conoce el resultado, el borrador pasa a **Confirmación pendiente** y no se vuelve a enviar automáticamente; debe revisarse el historial del plan para evitar duplicados. Una respuesta confirmada muestra **Enviado al servidor**.

Las notas generales siguen siendo personales y no tienen envío automático. Tampoco se habilitan aprobaciones, cambios de rol ni cargas de archivos sin red.

## Etapa 6: archivos de evidencia preparados localmente

Con una copia vigente del riesgo, control o auditoría, los roles que pueden registrar evidencias preparan hasta tres archivos pendientes de 3 MiB cada uno. VERA valida extensión, tamaño, tipo, descripción y expediente; el archivo se guarda dentro del espacio local cifrado y aparece como **Pendiente de usar**. El archivo no está publicado ni relacionado con el expediente todavía. Al recuperar la conexión, la persona pulsa **Cargar evidencia**; el backend confirma permiso, entidad y archivo. Solo una respuesta con ID de evidencia cambia el estado a **Enviado al servidor** y retira el contenido binario de la copia local.

Si se pierde la respuesta tras el envío, VERA marca **Confirmación pendiente** y exige revisar Evidencias antes de decidir qué hacer. No reintenta la carga automáticamente, porque crear otra evidencia podría duplicar el registro. Los archivos permanecen en el dispositivo hasta que se envían o se borran; la persona debe proteger el dispositivo y evitar preparar información que no deba conservarse localmente.

## Etapa 7: informe local CSV y PDF

El espacio local puede guardar la respuesta JSON de `/api/planning/report` que el backend generó con los permisos del usuario. La vista **Informe del portafolio** permite filtrar esa copia por año, trimestre, unidad, estado y responsable; recalcula los conteos sobre las filas visibles. **Descargar CSV** crea un archivo UTF-8 con BOM, comillas escapadas y protección ante fórmulas de hoja de cálculo. **Imprimir o guardar PDF** abre el diálogo del navegador con una hoja de impresión paginada. Funciona sin red mientras la copia esté desbloqueada y dentro de su vigencia de 24 horas.

El informe local indica la hora de la copia y es preliminar: no demuestra el estado actual del servidor. El PDF lo genera el navegador del usuario desde la vista de impresión; el PDF oficial del backend, sus límites de páginas y el RNF de tiempo se siguen evaluando por separado en línea. No se afirma que la impresión de 100 páginas cumpla automáticamente el RNF.

## Uso y verificación del corte

La tarjeta **Estado de este dispositivo** resume secciones vigentes y caducadas, trabajos pendientes de envío y cambios que requieren revisión. Una nota personal no cuenta como envío pendiente. El indicador de red proviene del dispositivo y no asegura que el servidor esté disponible; la fecha de cada sección sigue siendo la referencia para decidir si usarla.

La misma tarjeta muestra el uso aproximado de almacenamiento del sitio que informa el navegador, incluyendo archivos de la aplicación. La persona puede **solicitar conservación** mediante la API de almacenamiento; el navegador puede concederla o rechazarla. Ni la estimación ni la concesión garantizan espacio ilimitado, recuperación tras borrar datos del sitio o permanencia ante fallas del dispositivo. Las pruebas de resistencia simulan limpieza de IndexedDB y dos pestañas que intentan guardar sobre la misma revisión cifrada: la segunda recibe un conflicto en vez de sobrescribir la primera.

1. Con conexión, inicia sesión y abre **Sin conexión**. Crea una frase local exclusiva para ese dispositivo y conserva la frase por tu cuenta.
2. Selecciona las secciones necesarias y pulsa **Actualizar secciones elegidas**. Las otras secciones guardadas permanecen; puedes quitarlas individualmente. Verifica los resultados y la hora de la copia antes de desconectar.
3. Sin red, desbloquea el espacio, consulta las vistas guardadas y prepara notas, avances o archivos. Una recarga vuelve a bloquear el espacio.
4. Al reconectar, revisa cada borrador y pulsa el envío solo cuando corresponda. Un conflicto o confirmación incierta exige consultar el registro actual; no se reintenta automáticamente.
5. Borra la copia en el dispositivo cuando deje de necesitarse. El borrado local no elimina datos de Supabase.

El [ensayo manual en GitHub Actions](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/offline-rehearsal.yml) ejecuta el build de producción y escenarios sintéticos de Chromium con API simulada. La matriz Chrome/Edge/Firefox/móvil sigue en el [workflow manual de navegadores](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/e2e.yml) y su [deuda documentada](testing/browser-e2e-debt.md); un resultado verde del ensayo offline no sustituye esas comprobaciones ni la aceptación con cuentas reales.

El [piloto real inicial](testing/offline-production-pilot.md) registra los pasos observados con una sesión de producción sin conservar datos privados en la bitácora. La [matriz manual específica del modo sin conexión](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/offline-browser-matrix.yml) separa Chromium, Firefox, Chrome, Edge y emulaciones móvil/tablet. Sus resultados no equivalen a pruebas en dispositivos físicos.

En el caso de reabrir un borrador, el modo `setOffline` de Playwright para Firefox rechazó incluso la navegación cacheada con `NS_ERROR_OFFLINE` en Windows. Ese escenario de Firefox corta las solicitudes de red ordinarias después de instalar el service worker y verifica que la API privada no responde; los demás escenarios mantienen la emulación de desconexión. Este ajuste de ensayo no acredita por sí solo una recarga con el Wi-Fi físico apagado.

## Preparación local de hallazgos

Los roles que pueden registrar hallazgos pueden preparar un borrador con título y descripción a partir de un control insuficiente y un riesgo asociado incluidos en copias locales vigentes de **Controles** y **Riesgos**. El borrador se cifra en el espacio de la cuenta y no crea todavía un registro. En el caso de Auditor, la lista local solo ofrece riesgos donde aparece como responsable; el backend sigue siendo quien decide los permisos definitivos.

Tras recuperar conexión, **Registrar hallazgo** consulta controles, riesgos y hallazgos actuales. Si cambió el número de evaluaciones del control, la relación o ya hay un hallazgo para esa evaluación, detiene el envío y pide revisión. Si la respuesta de creación es incierta, etiqueta el borrador **Confirmación pendiente** y evita reintentos automáticos. El backend recibe además la versión de evaluación observada al guardar el borrador y la verifica de nuevo justo al crear. La consulta previa no sustituye esa comprobación del servidor. No se modifican aprobaciones ni estados de hallazgos sin red.

Cada envío de un hallazgo local lleva como `Idempotency-Key` el ID aleatorio del borrador. El backend solo devuelve un hallazgo ya creado con esa clave a la misma cuenta y si coinciden control, riesgo, título, descripción y versión observada. Una clave reutilizada con otros datos se rechaza. Este contrato permite comprobar el resultado de una respuesta perdida sin crear otro hallazgo; la interfaz aún mantiene los casos inciertos en **Confirmación pendiente** hasta que la persona los revise. No se interpreta la mera solicitud HTTP como confirmación.

### Límites conocidos

- Se requiere la primera sesión en línea. Google, Microsoft, recuperación de contraseña, aprobación de cambios, IA de Azure y permisos actuales no funcionan sin red.
- Solo se leen secciones seleccionadas, dentro de su vigencia. Las consultas de detalle y filtros no guardados requieren conexión; el servidor siempre conserva prioridad al responder.
- El modo local no es una réplica de Supabase. Una copia puede perderse al limpiar datos del navegador o por falta de cuota. El navegador y la protección del dispositivo siguen siendo parte de la seguridad de datos.
- La actualización de la aplicación pide confirmación para evitar recargas imprevistas mientras se redacta. La persona debe terminar o guardar su trabajo antes de instalar la nueva versión.

## Trazabilidad de este corte

Estas son agrupaciones funcionales de la implementación sin conexión; no sustituyen las HU ni los estados de aceptación de Azure Boards.

| Capacidad | Entregas | Comprobación principal |
| --- | --- | --- |
| Interfaz disponible tras una visita | [#309](https://github.com/VERA-GRC-IRM/VERA/pull/309) | Apertura de ruta con Chromium desconectado; API privada fuera de la caché |
| Espacio local protegido | [#311](https://github.com/VERA-GRC-IRM/VERA/pull/311) | Cifrado, separación por cuenta, bloqueo y borrado |
| Consulta autorizada con caducidad | [#312](https://github.com/VERA-GRC-IRM/VERA/pull/312) | Captura explícita, lectura offline y rechazo servidor respetado |
| Borradores y envío controlado | [#313](https://github.com/VERA-GRC-IRM/VERA/pull/313), [#314](https://github.com/VERA-GRC-IRM/VERA/pull/314) | Persistencia local, versión concurrente y respuesta incierta sin reintento |
| Evidencias e informes | [#315](https://github.com/VERA-GRC-IRM/VERA/pull/315), [#316](https://github.com/VERA-GRC-IRM/VERA/pull/316) | Archivo local cifrado, carga expresa, CSV e impresión sin red |
| Ensayo y operación | [#317](https://github.com/VERA-GRC-IRM/VERA/pull/317) | Actualización con aviso y ejecución manual reproducible en Actions |
| Estado y resistencia del espacio | [#318](https://github.com/VERA-GRC-IRM/VERA/pull/318), [#319](https://github.com/VERA-GRC-IRM/VERA/pull/319) | Vigencia, trabajos pendientes, almacenamiento, borrado y concurrencia local |
| Matriz manual de navegadores | [#320](https://github.com/VERA-GRC-IRM/VERA/pull/320) | Seis perfiles automatizados, separados de pruebas físicas |
| Preparación de hallazgos | [#321](https://github.com/VERA-GRC-IRM/VERA/pull/321) | Borrador cifrado, nueva validación y bloqueo de respuestas inciertas |
