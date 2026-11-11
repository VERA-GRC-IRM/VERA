# VERA sin conexión

El objetivo es permitir trabajo útil después de una sesión inicial en línea, sin confundir un borrador local con un cambio confirmado por Supabase. La base de datos y los permisos del servidor siguen siendo la fuente de verdad.

## Etapa 1: aplicación disponible

La interfaz se puede instalar como aplicación web. Después de abrirla una vez con conexión, el navegador conserva HTML, JavaScript, CSS e imágenes de VERA y permite volver a abrir la interfaz sin red. Un aviso accesible indica la desconexión. El servicio de caché **no guarda respuestas de `/api`, tokens, archivos privados ni llamadas a Supabase o Azure**. En esta etapa, iniciar sesión, consultar datos y guardar cambios todavía requieren conexión.

La presencia de `navigator.onLine` es una señal del dispositivo, no una prueba de que Supabase, Vercel o Azure estén disponibles. Las operaciones deben manejar los fallos HTTP y de red por separado.

La comprobación focalizada se ejecuta con `npm run build --prefix frontend` y `npx playwright test --config playwright.offline.config.js` dentro de `frontend/`. Usa el build de producción y desconecta Chromium después de instalar el service worker; también comprueba que `/api` no se sirva desde la caché. No sustituye una matriz completa de navegadores.

## Contrato para las siguientes etapas

1. **Consulta local:** solo registros que la cuenta haya recibido legítimamente y elegido conservar. Separar por ID de usuario y de entorno; mostrar el momento de la última sincronización. No conservar un registro al cerrar sesión ni después de cambiar de cuenta. Las copias caducan y no prueban permisos actuales cuando falta red.
2. **Borradores:** cada cambio local se identifica como `Pendiente de sincronizar`; no se presenta como aprobado, enviado o registrado en Supabase. Guardar la versión del expediente usada al editar.
3. **Sincronización:** al recuperar conexión, exigir una sesión vigente. El servidor vuelve a aplicar permisos y reglas de negocio. Los conflictos de versión y los rechazos se muestran para revisión humana; no se sobrescriben silenciosamente. Las repeticiones de red no deben duplicar operaciones.
4. **Evidencias:** archivos preparados localmente tienen límites de tamaño y caducidad; no quedan publicados ni vinculados hasta que el servidor confirme la carga.
5. **Decisiones y IA:** aprobaciones, rechazos y cambios de rol necesitan confirmación del servidor. La IA de Azure requiere red; un futuro modelo local tendría otro contrato, evaluación y requisitos de dispositivo.

## Aceptación

Probar apertura sin red tras una visita, recarga de rutas internas, cierre de sesión y cambio de cuenta, pérdida de red durante una operación, reconexión, conflictos, expiración de sesión, cuota de almacenamiento y privacidad de datos. Registrar por separado Chrome, Edge, Firefox y dispositivos móviles que se ejecuten realmente. La instalación y caché estática no acreditan por sí solas el modo de datos sin conexión.
