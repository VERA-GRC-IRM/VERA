# Herramientas de trabajo en VERA

Esta guía reúne funciones de uso transversal. Cada enlace describe lo que está disponible y su límite operativo; una verificación de código no equivale por sí sola a aceptación con cuentas y datos del entorno desplegado.

| Función | Disponible ahora | Alcance y límite |
| --- | --- | --- |
| [Búsqueda de registros](universal-search.md) | Barra superior y resultados autorizados | Expedientes, evidencias, mapa del negocio, personas visibles, conversaciones propias y texto de evidencias ya indexadas; hasta 500 archivos visibles por consulta. |
| [Enlaces de trabajo](shareable-links.md) | Propuestas, auditorías activas, registros y vistas filtradas | El enlace no concede permisos; los filtros escritos quedan visibles en la URL. |
| [Tu espacio](personal-workspace.md) | Favoritos, vistas guardadas y secciones recientes | Solo en este navegador, separado por cuenta. |
| [Actualización de vistas](automatic-refresh.md) | Consulta periódica de seis vistas y aviso de cambios al editar riesgos o controles | Hasta 40 segundos en vistas y 15 segundos en formularios; no hay presencia ni edición simultánea. |
| [Carga de evidencias](evidence-upload.md) | Hasta 10 archivos de 3 MB, progreso y resultado individual; reintento solo tras rechazo confirmado | No reanuda cargas después de cerrar la pestaña ni resuelve automáticamente resultados inciertos. |
| [Avisos de escritorio](desktop-alerts.md) | Activación individual y mensaje genérico | Necesita VERA abierta; no es push con la aplicación cerrada. |
| [Estado de reportes](report-export-feedback.md) | Operación, tiempo transcurrido y cancelación de la petición | No crea un trabajo duradero ni detiene necesariamente el procesamiento del servidor. |

## Siguientes capacidades con dependencia técnica

- [Trabajos duraderos](https://github.com/VERA-GRC-IRM/VERA/issues/371): cola y estado persistente, reintentos, cancelación e idempotencia.
- [Push con VERA cerrada](https://github.com/VERA-GRC-IRM/VERA/issues/372): suscripciones privadas y entrega desde el servidor.
- [Espacio entre dispositivos y colaboración](https://github.com/VERA-GRC-IRM/VERA/issues/373): sincronización privada y manejo de conflictos.
- [Cargas reanudables](https://github.com/VERA-GRC-IRM/VERA/issues/374): protocolo por partes y limpieza de cargas abandonadas.

La ruta de persistencia en Supabase para las primeras tres capacidades quedó aplazada por decisión del proyecto; un servicio duradero alternativo también necesitaría diseño, permisos y pruebas propios. Los enlaces anteriores registran criterios de aceptación; no anuncian funciones ya desplegadas.
