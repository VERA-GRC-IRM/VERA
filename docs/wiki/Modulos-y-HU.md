# Módulos, historias y estado de la evidencia

Esta página es un mapa de navegación, no un acta de aceptación. Los estados de Azure DevOps pueden describir gestión del trabajo, pero **no sustituyen** los criterios completos, la prueba del entorno ni la revisión del responsable. La [matriz de aceptación fechada](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/hu-acceptance-audit.md) conserva las brechas identificadas al 16 de octubre de 2026; algunos runbooks posteriores describen cambios de despliegue y deben leerse junto a esa fecha.

El [corte funcional previo al siguiente sprint de IA](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/functional-readiness-cut.md) distingue capacidad implementada, decisiones de negocio pendientes y aceptación desplegada.

| Dominio | HU relacionadas | Evidencia en `main` | Límite que debe revisarse |
| --- | --- | --- | --- |
| Panel y portafolio | HU-07 | [Servicio de dashboard](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/services/dashboardService.js), [pantalla](https://github.com/VERA-GRC-IRM/VERA/blob/main/frontend/src/pages/Dashboard.jsx), [guía del panel](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/portfolio-dashboard.md) | Contrastar indicadores con datos y cuentas del despliegue. |
| Auditorías activas y matriz | HU-09 | [Rutas de planificación](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/routes/planningRoutes.js), [pantalla](https://github.com/VERA-GRC-IRM/VERA/blob/main/frontend/src/pages/AuditoriasActivas.jsx) | Confirmar relaciones, navegación y permisos con datos persistentes. |
| Riesgos y controles | HU-14, HU-15 | [Rutas de riesgos](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/routes/riskRoutes.js), [rutas de controles](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/routes/controlRoutes.js) | Verificar persistencia, evaluación y matriz de permisos vigente. |
| Hallazgos, remediación y cierre | HU-21, RF-20 a RF-23 | [Regla de cierre](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/rf23-cierre-hallazgos.md), [planes y acciones](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/action-register.md) | Confirmar avance, solicitud de validación e historial persistente con cuentas reales en el despliegue. |
| Evidencias | HU-16 | [Rutas de evidencia](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/routes/evidenceRoutes.js), [guía de IA documental](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/ai-evidence-content.md) | La carga privada requiere configuración y prueba real de Storage y metadatos. |
| Pendientes e historial | HU-17, HU-18 | [Contrato de notificaciones](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/hu17-notificaciones.md), [rutas](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/routes/notificationRoutes.js), [acciones](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/action-register.md) | Comprobar emisión, lecturas y persistencia después de reinicio; no hay correo ni push. |
| Compatibilidad y concurrencia | HU-19 | [Playwright](https://github.com/VERA-GRC-IRM/VERA/tree/main/frontend/e2e), [workflow de carga](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/load-test.yml) | El script de 150/250 VU no acredita una corrida real; requiere staging aprobado. |
| Propuestas y decisiones | HU-22, HU-23 | [Planificación](https://github.com/VERA-GRC-IRM/VERA/blob/main/frontend/src/pages/Planificacion.jsx), [rutas](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/routes/planningRoutes.js) | Validar criterios completos, permisos y persistencia remota. |
| Búsqueda de auditorías | HU-26 | [Pantalla](https://github.com/VERA-GRC-IRM/VERA/blob/main/frontend/src/pages/BuscarAuditorias.jsx), [rutas](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/routes/planningRoutes.js) | Contrastar filtros y alcance por rol en el despliegue. |
| Reporte y exportación | HU-27, RF-28, RF-29 | [Contrato y evidencia](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/rf29-reportes-exportacion.md), [API](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/services/portfolioReportService.js) | Verificar filtros, horas, indicadores y alcance con Supabase desplegado; RNF-15 paginado sigue pendiente. |
| Asistente de VERA | HU-34 | [API](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/routes/assistantRoutes.js), [guía funcional](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/ai-copilot-evolution.md) | Evaluación con datos reales representativos y varios roles aún es distinta de CI sintético. |

## Regla para declarar una HU terminada

1. **Criterio:** texto oficial completo y comportamiento esperado identificados.
2. **Implementación:** código del commit y relación entre interfaz, API, permisos y datos.
3. **Prueba:** caso reproducible con resultado, fecha, entorno y defectos registrados.
4. **Persistencia y despliegue:** cuando aplican, mismo ID y estado después de reiniciar, SHA publicado y roles reales.
5. **Aceptación:** responsable del requisito confirma que la evidencia cubre todos los criterios.

Un PR fusionado demuestra integración de ese cambio; la aceptación requiere los pasos restantes. Para la evidencia histórica del alcance, consulta la [entrega del 16 de octubre](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/entrega-alcance-2026-10-16.md) y los [PR fusionados](https://github.com/VERA-GRC-IRM/VERA/pulls?q=is%3Apr+is%3Amerged).
