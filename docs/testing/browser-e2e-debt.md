# Deuda técnica: pruebas de navegadores y accesibilidad

**Decisión temporal (10 de noviembre de 2026):** la matriz Playwright deja de ser un requisito para fusionar PR y deja de formar parte del informe integral automático. Su workflow y sus casos permanecen en el repositorio para ejecución manual. La [incidencia #300](https://github.com/VERA-GRC-IRM/VERA/issues/300) registra el cierre futuro.

## Motivo y alcance

La [corrida de PR del 10 de noviembre](https://github.com/VERA-GRC-IRM/VERA/actions/runs/42916051637) terminó con fallo en los seis proyectos de navegador. El equipo difiere su estabilización para una etapa posterior. No se borran casos ni se cambia ninguna aserción para hacerlos pasar.

Durante esta excepción, `e2e.yml` solo se inicia manualmente. El ruleset de `main` sigue exigiendo calidad de Node.js, CodeQL, descripción de PR y ensayo de migraciones, pero no exige el check E2E. El informe integral y el portal deben indicar **diferida** para la matriz de navegadores; un resultado general PASS cubre únicamente las suites ejecutadas.

## Riesgo conocido

La integración de un PR puede ocurrir sin evidencia automatizada vigente para Chrome, Edge, Firefox, móvil, tableta ni las comprobaciones de accesibilidad incluidas en Playwright. Lint y build no demuestran compatibilidad visual o funcional. Las corridas históricas siguen siendo evidencia de su propio commit, no del código actual.

## Criterios para retirar la excepción

1. Investigar los fallos en `main` y en PR representativos; distinguir defecto de producto, fixtures e infraestructura.
2. Obtener una corrida reproducible de los seis proyectos sin fallos, casos inestables u omisiones añadidas para silenciar errores.
3. Reactivar `pull_request` y `push` para `e2e.yml`, incorporarlo de nuevo al informe integral y volver a exigir `UI E2E (Chrome, Edge, Firefox, mobile/tablet)` en el ruleset.
4. Actualizar el portal y las guías con evidencia del mismo SHA: resultados, duración, logs y artefactos.
5. Mantener separada la revisión humana de teclado, lector de pantalla y dispositivos físicos.

No se asigna una persona ni una fecha que el equipo no haya acordado.
