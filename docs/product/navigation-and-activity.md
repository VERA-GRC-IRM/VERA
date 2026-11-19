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

## Interpretación de riesgo

La matriz del Panel de Portafolio resume los niveles de probabilidad e impacto registrados para auditorías activas. No se etiqueta como riesgo residual ni recalcula los valores. VERA todavía requiere una metodología aprobada antes de presentar un cálculo residual.

## Límite de carga de archivos

La carga desplegada admite actualmente archivos de hasta 3 MB por archivo. No se anuncia un límite de 200 MB: alcanzarlo requiere una ruta de carga directa y reanudable compatible con Storage, control de permisos, límites del proveedor y pruebas de extremo a extremo. Cambiar solo la validación visual o el límite HTTP no sería suficiente.
