# Navegación y actividad reciente

## Cambios de interfaz

- El selector de apariencia queda en la barra superior junto a la búsqueda.
- El Panel de Portafolio presenta Panorama, Mis compromisos, Estado y riesgo, y Por atender como pestañas accesibles por teclado.
- El panel ya no repite accesos rápidos ni el KPI de registros visibles.
- Planificación se presenta a Super Admin, Director, Gerente y Jefatura. Auditor conserva la consulta de las auditorías asignadas desde Auditorías activas.
- La entrada «Mi rol y solicitudes» deja de formar parte de la navegación; los enlaces antiguos regresan al Panel de Portafolio.

## Bitácora y conservación

La pantalla Bitácora y su endpoint de actividad reciente muestran únicamente eventos de los últimos siete días. Es un límite de consulta y presentación: no borra eventos, no purga registros de auditoría formales y no cambia su retención en almacenamiento. El registro administrativo completo conserva sus propios permisos y filtros.

La lista reciente permite filtrar por persona y tipo de evento. Los filtros no cambian el historial almacenado ni el alcance de datos que autoriza el servidor.

La cola de pendientes permite combinar el tipo de actividad con una búsqueda local por título, descripción, folio o fecha objetivo y un filtro de prioridad. La lista de acciones ofrece búsqueda local dentro de la vista activa. Ambos controles operan sobre los datos ya autorizados que recibió la pantalla; no amplían consultas ni permisos.

En el inicio del Asistente, las señales y prioridades del portafolio quedan bajo una sección desplegable para mantener la conversación como foco inicial. El contenido y sus enlaces permanecen disponibles; solo cambia su presentación.

## Interpretación de riesgo

La matriz del Panel de Portafolio resume los niveles de probabilidad e impacto registrados para auditorías activas. No se etiqueta como riesgo residual ni recalcula los valores. VERA todavía requiere una metodología aprobada antes de presentar un cálculo residual.

## Límite de carga de archivos

La configuración desplegada conserva el límite de 3 MiB por archivo. La vía opcional TUS de hasta 200 MiB está preparada en una rama, pero no se anuncia como disponible hasta verificar límites globales y del bucket, CORS, plan, permisos y aceptación de extremo a extremo en Supabase. Al activarse, los archivos mayores a 3 MiB quedan fuera del procesamiento de IA y del espacio sin conexión.
