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
