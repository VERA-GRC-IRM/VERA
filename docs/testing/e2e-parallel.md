# Pruebas de interfaz y accesibilidad

## Smoke acotado en pull requests

El workflow [UI smoke and accessibility](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/ui-smoke.yml) ejecuta en cada PR que modifica la interfaz un conjunto pequeño en Chromium de escritorio: navegación por teclado entre pestañas del Panel de Portafolio y un análisis automatizado axe para WCAG 2.1 A/AA en esa vista. Usa sesión y respuestas API sintéticas interceptadas; no accede a Supabase ni a datos de producción. La corrida conserva reportes, capturas y trazas por 14 días y publica su duración en el resumen de GitHub Actions.

Este smoke es una señal de regresión de alcance limitado; no sustituye una revisión manual con tecnologías de asistencia ni acredita todas las pantallas.

## Matriz amplia manual

El workflow `Browser and accessibility tests` ejecuta los mismos proyectos Playwright de `frontend/playwright.config.js` en seis trabajos independientes: Chromium de escritorio, Firefox, móvil Chromium, tablet Chromium, Google Chrome y Microsoft Edge. Cada trabajo conserva su reporte HTML, capturas, trazas y video bajo un nombre de artefacto propio. `fail-fast: false` permite observar todos los resultados aunque falle uno.

**Estado temporal desde el 10 de noviembre de 2026:** el workflow se ejecuta solo de forma manual y `UI E2E (Chrome, Edge, Firefox, mobile/tablet)` dejó de ser requerido para `main`. El trabajo de síntesis sigue fallando si cualquiera de los seis proyectos falla; no se ocultan errores ni se relajan aserciones. El motivo, el riesgo y los criterios de reactivación están en la [deuda #300](https://github.com/VERA-GRC-IRM/VERA/issues/300) y la [bitácora de excepción](browser-e2e-debt.md).

Para investigar una falla, abre el trabajo `Browser E2E / <navegador>` correspondiente y descarga su artefacto `vera-e2e-<navegador>-<run>-<intento>`. El tiempo total de la corrida depende del trabajo más lento y de la capacidad disponible en GitHub Actions; no se promete una reducción fija hasta medirla en una ejecución real.
