# Revisión de acceso por rol

## Alcance y fuente

Esta matriz describe las reglas que están en el código del servidor y las restricciones de navegación visibles en la interfaz. No declara que sean una política aprobada por FEMSA ni sustituye el filtrado por ámbito, asignación, estado del registro o relaciones de negocio. Para cerrar una autorización, el servidor debe validar tanto el rol como el registro solicitado.

Fuentes principales: `backend/config/roles.js`, `backend/routes/*.js`, servicios de transición y alcance de registros, `frontend/src/constants/roles.js`, `frontend/src/App.jsx` y `frontend/src/components/Sidebar.jsx`.

## Capacidades del servidor

| Capacidad | SUPER_ADMIN | DIRECTOR | GERENTE | JEFATURA | AUDITOR |
| --- | --- | --- | --- | --- | --- |
| Consultar usuarios | Sí | Sí | No | No | No |
| Cambiar rol/estado de cuenta | Sí | No | No | No | No |
| Revisar solicitudes de cambio de rol | Sí | No | No | No | No |
| Crear/editar propuestas de auditoría | Sí | No | Sí | Sí | No |
| Aprobar, rechazar, iniciar, cerrar o editar auditoría activa | Sí | No | Sí | No | No |
| Eliminar propuesta abierta | Sí | No | Sí | No | No |
| Avanzar paso a paso el flujo de una auditoría | Sí | No | Sí | No | Sí, si está asignado como responsable |
| Crear, editar, evaluar o responder a riesgos | Sí | No | Sí | No | No |
| Crear o evaluar controles | Sí | No | Sí | No | Sí |
| Editar controles | Sí | No | Sí | No | No |
| Crear/cerrar hallazgos | Sí | No | Sí | No | Sí |
| Revisar cierre de hallazgos | Sí | No | Sí | No | No |
| Crear y actualizar acciones/seguimientos | Sí | No | Sí | Sí | Sí |
| Cambiar responsable de una acción | Sí | No | Sí | No | No |
| Registrar evidencia o comentarios | Sí* | No | Sí* | Sí* | Sí* |
| Administrar unidades, biblioteca de riesgos, métodos de riesgo y bitácora completa | Sí | No | No | No | No |

`*` La autorización final también depende del tipo de entidad y de si el usuario puede escribir en ese expediente. Para adjuntar evidencia directamente a una auditoría, las rutas actuales además exigen un rol de aprobación de planificación; el permiso general de registrar evidencia no es suficiente.

## Consulta y visibilidad

- Las rutas de módulos autenticados son accesibles a los roles existentes salvo las restricciones específicas arriba indicadas; el servidor filtra por ámbito y relación del registro.
- Auditor solo consulta propuestas/auditorías que tiene asignadas como responsable. Esa restricción está en el controlador y servicio, no solo en la navegación.
- Auditor responsable puede avanzar el flujo de trabajo de su auditoría en curso; no puede aprobar/rechazar propuestas, iniciarlas ni cerrarlas.
- Director puede consultar usuarios, pero está excluido de las operaciones de modificación de registros incluidas en `RECORD_CREATE_ROLES` y `RISK_CONTROL_MANAGE_ROLES`.
- Los recorridos de rol iniciados por Super Admin usan una cuenta dedicada y son de solo lectura. No equivalen a impersonar una sesión privilegiada.
- La interfaz no se considera una barrera de autorización. Las pruebas del backend siguen siendo necesarias aunque una opción no aparezca en el menú.

## Cambios de navegación relacionados

El PR [#418](https://github.com/VERA-GRC-IRM/VERA/pull/418) oculta Planificación a Auditor en el menú y bloquea esa ruta en la experiencia de pantalla. Esto mejora la navegación; las consultas API y transiciones siguen siendo gobernadas por permisos del servidor y asignación del expediente.

## Observaciones para revisión funcional

La matriz refleja las listas de roles actuales. Debe compararse con una matriz CRUD aprobada antes de modificar permisos. En particular, la autorización de Auditor para crear/evaluar controles y cerrar hallazgos, y la diferencia entre editar/cerrar un registro y revisar formalmente su cierre, son comportamientos implementados que deben ser confirmados por la persona dueña de la política.
