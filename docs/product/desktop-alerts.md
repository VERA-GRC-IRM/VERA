# Avisos opcionales del navegador

En **Pendientes**, cada persona puede activar o desactivar los avisos de escritorio de este navegador. VERA pide permiso mediante el diálogo nativo solo después de pulsar «Activar avisos». La preferencia se guarda por cuenta y dispositivo; no cambia los avisos persistentes ni las preferencias de otras personas.

Mientras VERA permanece abierta y conectada, consulta nuevos pendientes cada 60 segundos y al recuperar conexión o enfoque. La primera consulta establece el punto de partida y no muestra alertas antiguas. Un aviso nuevo solo dice que hay actividades para revisar: no muestra nombres, riesgos ni detalles sensibles en la pantalla bloqueada. Al abrirlo lleva a Pendientes, donde el backend vuelve a comprobar permisos.

Estos son avisos de escritorio con la aplicación abierta. No son notificaciones push cuando VERA está cerrada y pueden retrasarse si el navegador limita pestañas en segundo plano. El push real necesita suscripciones por cuenta, claves de aplicación, entrega desde el servidor y una tabla nueva en Supabase; queda pendiente junto con la migración aplazada.
