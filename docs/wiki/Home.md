# VERA · Centro de conocimiento

<img src="https://raw.githubusercontent.com/VERA-GRC-IRM/VERA/main/docs/assets/social-preview.png" alt="VERA: decisiones con fundamento. Tres planos en perspectiva representan propuesta, decisión y evidencia." width="960">

**Una sola vista del recorrido de auditoría.** Explora el producto, la arquitectura, los permisos, la operación y la evidencia de calidad sin perder el contexto de cada decisión. Esta Wiki conecta las perspectivas de negocio, ingeniería, operación y aseguramiento de calidad.

**VERA en video:** [ver el tráiler en YouTube](https://www.youtube.com/shorts/X2RuivSwSVo) · [reproducirlo en la presentación pública](https://www.vera-digital-systems.com/acerca#trailer-vera).

> **Cómo leer el estado:** VERA es un prototipo funcional en evolución. «Implementado en código», «aprobado en CI» y «aceptado en producción» son afirmaciones distintas. Consulta [Estado y evidencias](https://github.com/VERA-GRC-IRM/VERA/wiki/Modulos-y-HU) antes de cerrar una HU.

## Empieza por lo que necesitas

| Si quieres... | Empieza aquí | Después |
| --- | --- | --- |
| Entender la solución en 5 minutos | [Producto y flujos](https://github.com/VERA-GRC-IRM/VERA/wiki/Producto-y-flujos) | [Módulos y HU](https://github.com/VERA-GRC-IRM/VERA/wiki/Modulos-y-HU) |
| Revisar el acceso y la apariencia | [Experiencia y accesibilidad](https://github.com/VERA-GRC-IRM/VERA/wiki/Experiencia-y-accesibilidad) | [Guía técnica de interfaz](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/ui-experience.md) |
| Trabajar durante una desconexión | [Trabajo sin conexión](https://github.com/VERA-GRC-IRM/VERA/wiki/Sin-conexion) | [Alcance y ensayos](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/offline-mode.md) |
| Revisar la calidad sin instalar software | [Plataforma de calidad de software](https://vera-grc-irm.github.io/VERA/) | [Calidad y pruebas](https://github.com/VERA-GRC-IRM/VERA/wiki/Calidad-y-pruebas) |
| Entender la organización y sus controles | [Gobierno de GitHub](https://github.com/VERA-GRC-IRM/VERA/wiki/Gobierno-de-GitHub) | [Estado de calidad](https://github.com/VERA-GRC-IRM/VERA/wiki/Estado-de-calidad) |
| Seguir entregas y pendientes | [Cortes integrados](https://github.com/VERA-GRC-IRM/VERA/milestones?state=closed) | [Tablero público de entrega y aceptación](https://github.com/orgs/VERA-GRC-IRM/projects/1/views/2) |
| Comprender cómo funciona | [Arquitectura](https://github.com/VERA-GRC-IRM/VERA/wiki/Arquitectura) | [Datos y Supabase](https://github.com/VERA-GRC-IRM/VERA/wiki/Datos-y-Supabase) |
| Revisar quién puede hacer qué | [Acceso y permisos](https://github.com/VERA-GRC-IRM/VERA/wiki/Acceso-y-permisos) | [Política vigente en código](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/config/roles.js) |
| Conocer la IA | [IA de VERA](https://github.com/VERA-GRC-IRM/VERA/wiki/IA-de-VERA) | [Evaluación continua](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/ai-continuous-evaluation.md) |
| Desarrollar o desplegar | [Contribuir](https://github.com/VERA-GRC-IRM/VERA/wiki/Contribuir) | [Operación y despliegue](https://github.com/VERA-GRC-IRM/VERA/wiki/Operacion-y-despliegue) |
| Encontrar un documento técnico | [Biblioteca de runbooks](https://github.com/VERA-GRC-IRM/VERA/wiki/Biblioteca-de-runbooks) | [Glosario](https://github.com/VERA-GRC-IRM/VERA/wiki/Glosario) |

## Cómo se conecta todo

VERA reúne propuesta, decisión, auditoría, riesgo, control, evidencia y seguimiento en un mismo recorrido, con datos visibles según los permisos del usuario.

```mermaid
flowchart LR
  P[Propuesta] --> D{Decisión}
  D -->|Aprobada| A[Auditoría]
  D -->|Rechazada| R[Motivo registrado]
  A --> G[Riesgos y controles]
  G --> E[Evidencias y hallazgos]
  E --> S[Seguimiento]
```

## Accesos directos

- [Repositorio y README](https://github.com/VERA-GRC-IRM/VERA) · [Despliegue público](https://www.vera-digital-systems.com/) — los flujos autenticados requieren una cuenta de VERA.
- [Plataforma de calidad](https://vera-grc-irm.github.io/VERA/) · [Informe integral](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/classroom-quality.yml) · [Cortes archivados](https://github.com/VERA-GRC-IRM/VERA/releases) · [PR fusionados](https://github.com/VERA-GRC-IRM/VERA/pulls?q=is%3Apr+is%3Amerged).
- [Plan de pruebas](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/testing/test-plan.md) · [Matriz de aceptación](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/hu-acceptance-audit.md).
- [Cortes integrados](https://github.com/VERA-GRC-IRM/VERA/milestones?state=closed) · [Hito de aceptación](https://github.com/VERA-GRC-IRM/VERA/milestone/4) · [Tablero de seguimiento](https://github.com/orgs/VERA-GRC-IRM/projects/1). Las HU y su aceptación se mantienen en Azure Boards.

**Fuentes de verdad.** La Wiki explica y orienta; el comportamiento vigente se verifica en el código de `main`, sus pruebas y el entorno concreto. Los runbooks de `docs/` son la referencia operativa versionada. La versión revisable de estas páginas vive en [`docs/wiki/`](https://github.com/VERA-GRC-IRM/VERA/tree/main/docs/wiki). Si se contradicen, registra el archivo y el commit antes de corregir la página.
