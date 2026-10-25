# Inventario de superficies que leen o modifican expedientes

Este inventario describe el código de `main` revisado el 24 de octubre de 2026. **Es una revisión de rutas y pruebas sintéticas, no una aceptación de aislamiento multiempresa en Production.** Los expedientes legados sin `orgUnitId` conservan la visibilidad anterior; no se les asigna una empresa por el texto de `area`.

| Superficie | Puerta de acceso actual | Evidencia automatizada | Límite pendiente |
| --- | --- | --- | --- |
| `/api/planning`: listas, búsqueda, auditorías activas, contexto e historial | Filtra `orgUnitId`; el contexto e historial exigen visibilidad del expediente, incluido el responsable para `AUDITOR` | `recordScopeRead.integration.test.js`: dos entidades, URL directa de contexto e historial, búsqueda y revocación | Validar con datos persistidos tras reinicio |
| `/api/planning/report` y CSV | `buildPortfolioReport` calcula desde colecciones visibles | Prueba de conteos y ausencia del título ajeno en CSV dentro de `recordScopeRead.integration.test.js` | Comprobar exportación autenticada desplegada |
| `/api/risks`, `/api/controls`, `/api/findings` | Proyección común de riesgo y relaciones; escrituras exigen `MANAGE`; riesgos vinculados y controles heredan el ámbito y evitan vínculos mixtos | Listas, evaluación, edición y cierre en `recordScopeRead.integration.test.js`; creación en `scopedPrimaryCreation.test.js` | Reasignación de expedientes existentes y aceptación desplegada pendientes |
| `/api/actions`: lista, origen, responsables, consulta directa, bitácora del expediente y cambios | El origen se resuelve mediante `visibleRecordForUser`; cambios y creación exigen permiso de escritura; el compromiso hereda el ámbito | Lista, consulta directa, creación con `MANAGE`, revocación y origen ajeno en `recordScopeRead.integration.test.js` | Validar persistencia y revocación desplegadas |
| `/api/evidence`: lista, descarga, preguntas y OCR | Cada lectura comprueba acceso al origen; la descarga exige evidencia visible antes de firmar URL; nuevas evidencias heredan el ámbito | Lista, creación con `MANAGE` y URL directa ajena en `recordScopeRead.integration.test.js` | Aceptar archivo real, índice y consulta en entorno aislado con Supabase |
| `/api/dashboard`, notificaciones y actividad reciente | Propuestas, hallazgos y compromisos visibles antes de contar o construir pendientes | Panel y avisos en `recordScopeRead.integration.test.js` | Revisar actividad reciente con dos entidades tras reinicio |
| `/api/assistant`: contexto, navegación, dossier, reportes y búsqueda de evidencias | Construye contexto desde registros visibles; los archivos de proyecto y memorias privadas pertenecen a la cuenta | Catálogo de fuentes, vista previa y dossier en `recordScopeRead.integration.test.js`; suites del asistente por intención | Aceptar conversaciones y documentos reales sintéticos desplegados; no inferir permisos desde el texto del modelo |
| `/api/org-units` y concesiones | Directorio administrado por `SUPER_ADMIN`; `/available` muestra solo concesiones directas vigentes | Suite de ámbitos, creación, revocación y consulta siguiente | No hay estructura oficial de FEMSA cargada ni herencia automática |

Los reintentos de creación se vuelven a autorizar por actor, origen, contenido inmutable cuando aplica y permiso actual. Véanse `creationReplayScope.test.js` y `coreCreationReplayScope.test.js`.

## Decisiones antes de activar ámbitos en expedientes reales

1. Acordar si el directorio de personas (`/api/risks/owners`, `/api/planning/auditors`) es global o debe limitarse por entidad. Hoy muestra cuentas activas según el rol funcional, no una pertenencia empresarial: **no usarlo como prueba de aislamiento**.
2. Definir la relación de una persona con varias entidades y quién puede asignarla. Una concesión sobre un grupo no se hereda a sus empresas hijas.
3. Diseñar una reasignación controlada de expedientes existentes y de su grafo de relaciones. La creación nueva ya hereda el ámbito desde relaciones autorizadas; no inferir el ámbito de un campo libre ni hacer escrituras parciales entre almacenes.
4. Ejecutar con dos entidades sintéticas, cuentas de roles distintos, revocación y reinicio sobre Supabase desplegado. Registrar respuestas, conteos, exportación y trazas sin publicar datos reales.

Hasta terminar esas decisiones y la aceptación, #247 sigue abierto. La biblioteca global de plantillas de riesgo es un catálogo distinto de los casos concretos; su vínculo a expedientes espera el cierre de este trabajo y persistencia compatible (#253).
