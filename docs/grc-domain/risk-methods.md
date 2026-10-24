# Metodologías de evaluación: línea base versionada

El primer método identificable es `legacy-3x3-v1`: probabilidad e impacto ordinales de 1 a 3, producto numérico y niveles Bajo (1–2), Medio (3–4) y Alto (5–9). Es la matriz histórica de VERA; **no** se presenta como política aprobada de FEMSA, estimación monetaria ni medida de riesgo residual. `GET /api/risks/methods` la expone a una sesión válida con `approvedEnterprisePolicy: false`.

Cada nueva evaluación conserva `methodId` y `assessmentStage`. En este método, el único estadio permitido es `UNSPECIFIED`; solicitar `INHERENT`, `RESIDUAL` o `TARGET` produce error. Los registros anteriores, que no tienen esos campos, se interpretan como `legacy-3x3-v1` y `UNSPECIFIED` en el código de lectura sin reescribir la base. Un método futuro no debe recalcular evaluaciones históricas ni comparar sus puntuaciones como si pertenecieran a una escala común.

Este incremento no crea una nueva escala ni un cálculo residual. Antes de ello, el responsable de riesgos debe validar horizontes, definiciones de probabilidad e impacto, umbrales, evidencia requerida, tratamiento de incertidumbre y autoridad para aprobar versiones. Después se agregará un método nuevo con fixtures de referencia y validación de permisos; una transición tendrá actor y fecha explícitos.

## Laboratorio de matrices cualitativas

`POST /api/risks/methods/preview` permite a `SUPER_ADMIN` revisar una definición **no aprobada y no persistida**. El cuerpo incluye `method` con `name`, `version`, listas ordenadas `likelihood`, `impact` y `levels`, y una `matrix` completa. Las filas siguen la probabilidad y las columnas el impacto. Cada celda contiene un nivel exacto de `levels`. La validación rechaza celdas ausentes, niveles desconocidos, duplicados en ejes y matrices en las que la severidad baja al aumentar una dimensión.

La solicitud exige `stage` (`INHERENT`, `RESIDUAL` o `TARGET`), índices de probabilidad e impacto comenzando en 1 y `assumptionNote`. Para `RESIDUAL` requiere también `controlEvidenceNote`; para `TARGET`, `treatmentAssumption`. Esas notas son supuestos del usuario: la API **no comprueba evidencia**, no mide eficacia de controles, no persiste una evaluación y no cambia un riesgo existente. La respuesta no produce una cifra monetaria ni suma categorías ordinales; informa `approvedEnterprisePolicy: false`, `persisted: false` y `controlsEvaluatedBySystem: false`.

Ejemplo sintético mínimo:

```json
{
  "method": {
    "name": "Matriz para deliberación",
    "version": "draft-1",
    "likelihood": ["Rara", "Frecuente"],
    "impact": ["Menor", "Grave"],
    "levels": ["Bajo", "Alto"],
    "matrix": [["Bajo", "Alto"], ["Alto", "Alto"]]
  },
  "stage": "INHERENT",
  "likelihoodIndex": 2,
  "impactIndex": 1,
  "assumptionNote": "Ejemplo sintético sin aprobación empresarial"
}
```
