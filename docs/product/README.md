# Herramientas de trabajo en VERA

Esta guía reúne funciones de uso transversal. Cada enlace describe lo que está disponible y su límite operativo; una verificación de código no equivale por sí sola a aceptación con cuentas y datos del entorno desplegado.

Para distinguir código integrado de funciones activas y seguir el orden de pruebas, consulta la [bitácora de activación de capacidades](technology-activation.md).

| Función | Disponible ahora | Alcance y límite |
| --- | --- | --- |
| [Búsqueda de registros](universal-search.md) | Barra superior y resultados autorizados | Expedientes, evidencias, mapa del negocio, personas visibles, conversaciones propias y texto de evidencias ya indexadas en lotes. |
| [Enlaces de trabajo](shareable-links.md) | Botón de la barra superior en todas las pantallas autenticadas; propuestas, auditorías activas, registros y vistas filtradas | El enlace no concede permisos; los filtros escritos quedan visibles en la URL. |
| [Tu espacio](personal-workspace.md) | Favoritos, vistas guardadas y secciones recientes; sincronización entre dispositivos preparada | La sincronización requiere migración y banderas aún no activadas en producción. |
| [Actualización de vistas](automatic-refresh.md) | Consulta periódica de seis vistas y aviso de cambios al editar riesgos o controles | Hasta 40 segundos en vistas y 15 segundos en formularios; señal en vivo y presencia preparadas, pendientes de activación. |
| [Carga de evidencias](evidence-upload.md) | Hasta 10 archivos de 3 MB, progreso y resultado individual; reintento solo tras rechazo confirmado | Reanudación y versiones preparadas, pendientes de migración y aceptación. |
| [Avisos de escritorio](desktop-alerts.md) | Activación individual y mensaje genérico | Necesita VERA abierta; no es push con la aplicación cerrada. |
| [Push con VERA cerrada](desktop-alerts.md) | Suscripción por cuenta y dispositivo, mensaje genérico y entrega deduplicada | Preparado en código; requiere migración, VAPID y aceptación real antes de activarse. |
| [Estado de reportes](report-export-feedback.md) | Operación, tiempo transcurrido y cancelación de la petición | La ruta inmediata no detiene necesariamente el procesamiento del servidor. |
| [Centro de trabajos](durable-jobs.md) | Cola privada e idempotente para reportes CSV/PDF | Preparado en código; requiere migración, procesador y aceptación real antes de activarse. |
| [Exportación a Excel](excel-export.md) | Libro `.xlsx` filtrado y autorizado para análisis externo | Disponible como descarga inmediata. |
| [Compartir en Teams](teams-share.md) | Abre el selector de destinatarios de Teams con un enlace de VERA | Envío manual; no concede permisos ni activa avisos automáticos. |

## Siguientes capacidades con dependencia técnica

- [Trabajos duraderos](https://github.com/VERA-GRC-IRM/VERA/issues/371): cola preparada; faltan activación y pruebas de extremo a extremo.
- [Push con VERA cerrada](https://github.com/VERA-GRC-IRM/VERA/issues/372): código y migración preparados; faltan activación y prueba real con la app cerrada.
- [Espacio entre dispositivos y colaboración](https://github.com/VERA-GRC-IRM/VERA/issues/373): código y migración preparados; falta activación y aceptación real.
- [Cargas reanudables](https://github.com/VERA-GRC-IRM/VERA/issues/374): protocolo por partes y limpieza de cargas abandonadas.

La ruta de persistencia en Supabase para las primeras tres capacidades quedó aplazada por decisión del proyecto; un servicio duradero alternativo también necesitaría diseño, permisos y pruebas propios. Los enlaces anteriores registran criterios de aceptación; no anuncian funciones ya desplegadas.
