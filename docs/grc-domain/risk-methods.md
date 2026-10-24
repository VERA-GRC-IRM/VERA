# Metodologías de evaluación: línea base versionada

El primer método identificable es `legacy-3x3-v1`: probabilidad e impacto ordinales de 1 a 3, producto numérico y niveles Bajo (1–2), Medio (3–4) y Alto (5–9). Es la matriz histórica de VERA; **no** se presenta como política aprobada de FEMSA, estimación monetaria ni medida de riesgo residual. `GET /api/risks/methods` la expone a una sesión válida con `approvedEnterprisePolicy: false`.

Cada nueva evaluación conserva `methodId` y `assessmentStage`. En este método, el único estadio permitido es `UNSPECIFIED`; solicitar `INHERENT`, `RESIDUAL` o `TARGET` produce error. Los registros anteriores, que no tienen esos campos, se interpretan como `legacy-3x3-v1` y `UNSPECIFIED` en el código de lectura sin reescribir la base. Un método futuro no debe recalcular evaluaciones históricas ni comparar sus puntuaciones como si pertenecieran a una escala común.

Este incremento no crea una nueva escala ni un cálculo residual. Antes de ello, el responsable de riesgos debe validar horizontes, definiciones de probabilidad e impacto, umbrales, evidencia requerida, tratamiento de incertidumbre y autoridad para aprobar versiones. Después se agregará un método nuevo con fixtures de referencia y validación de permisos; una transición tendrá actor y fecha explícitos.
