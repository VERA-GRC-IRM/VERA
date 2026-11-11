# HU-17 · Notificaciones y actividades pendientes

La bandeja `/notificaciones` muestra avisos creados a partir de propuestas, auditorías, acciones, solicitudes de validación, hallazgos y evidencias **reales**. El servidor determina los destinatarios y vuelve a comprobar que la cuenta siga activa, su rol y el alcance exacto del registro. Los tipos y enlaces son:

| Evento | Destinatario | Enlace |
|---|---|---|
| Propuesta abierta | Cuentas con permiso de decisión y alcance | Planificación |
| Aprobación o rechazo | Creador de la propuesta | Planificación |
| Auditoría en curso/asignada | Responsable | Auditorías activas |
| Acción asignada, próxima o vencida | Responsable | Acción en Pendientes |
| Plan al 100 % que pide validación | Cuentas con permiso de decisión y alcance del hallazgo | Acción en Pendientes |
| Hallazgo nuevo | Dueño del riesgo o control, si puede ver el hallazgo | Hallazgo en Controles |
| Evidencia nueva | Responsable de auditoría o dueño del riesgo/control, si puede ver el origen | Evidencia concreta |

Las escrituras de negocio entregan el aviso después de guardar el registro. Si el almacén de avisos falla, la escritura de negocio no se revierte ni se presenta falsamente como fallida: se registra `NOTIFICATION_DELIVERY_PENDING` en el servidor y la siguiente consulta de la bandeja reconcilia los eventos todavía vigentes. Los vencimientos se detectan en la consulta usando el día local del usuario; no se necesita un proceso programado para mostrar que una fecha pasó a «próxima» o «vencida».

Cada aviso se materializa por destinatario en el almacén privado `vera_notification_reads`, con `user_id`, ID estable, instante de almacenamiento y contenido del evento. La fila permanece al marcar leída o no leída. La misma tabla y migración existente protegen las filas con RLS y acceso exclusivo del servidor. La consulta **no** devuelve indiscriminadamente el historial almacenado: vuelve a construir la lista visible desde registros autorizados para que una cuenta cuyo acceso cambió no lea datos antiguos de otro ámbito. La bitácora registra los cambios de lectura por actor. En modo local el repositorio es memoria; en producción debe estar configurado `VERA_NOTIFICATION_STORE=supabase`.

`GET /api/notifications` exige sesión y devuelve avisos, `readAt`, generación y estado del almacén. `PUT /api/notifications/:id/read` y `DELETE /api/notifications/:id/read` solo aceptan un aviso que sigue visible para esa persona; un ID de otra cuenta devuelve 404. Si falla la fuente de acciones, la respuesta indica `actionAlertsAvailable: false` y la interfaz no presenta sus conteos como completos. La lectura no cierra tareas, planes ni hallazgos.

Las pruebas `notificationRead.integration.test.js`, `notificationService.test.js`, `notifications.integration.test.js` y `supabaseNotificationReads.test.js` cubren destinatarios, enlaces, rol, lectura aislada, emisión al guardar, reconciliación y persistencia simulada de Supabase. Su aprobación local no sustituye la aceptación con cuentas y datos sintéticos en el despliegue. No se envían correos ni notificaciones push.
