# Abrir el informe integral de calidad de VERA

## Para revisar resultados sin instalar nada

1. Abre el [portal público de calidad](https://vera-grc-irm.github.io/VERA/) y espera la confirmación de la consulta a GitHub. Ahí verás el SHA actual, los estados y los tiempos; desde allí entra al [informe integral de las suites vigentes en GitHub Actions](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/classroom-quality.yml). Si aparece **sin confirmar**, consulta Actions directamente: la página publicada por sí sola es una instantánea fechada.
2. Entra a la ejecución más reciente, abre **Summary** y revisa resultado, commit, cantidad de pruebas, cobertura de líneas/ramas/funciones, evaluación sintética de IA y tiempos. Si está en rojo, lee el paso fallido; no la presentes como aprobada.
3. Si necesitas los logs detallados y los archivos JSON/Markdown, abre el artefacto de esa misma ejecución. El workflow lo conserva durante 30 días. Los reportes Playwright pertenecen a su [workflow manual separado](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/e2e.yml).

No hace falta clonar el repositorio, instalar Node, descargar navegadores ni ejecutar comandos localmente para revisar el resultado.

## Para iniciar una nueva ejecución

Pulsa **Run workflow** en esa página. GitHub ejecuta en una sola corrida:

- Calidad backend/frontend, pruebas unitarias y de integración, cobertura, lint, build y auditoría de dependencias. El número ejecutado se lee en la corrida, porque la suite cambia con el código.
- Regresión sintética de IA, sin red ni consumo de Azure. El resumen indica casos aprobados y llamadas al modelo.
- La matriz E2E de navegadores y accesibilidad con Playwright **no se ejecuta** en este informe; está [diferida como deuda técnica](browser-e2e-debt.md) y disponible por separado de forma manual.
- CodeQL para JavaScript/TypeScript.

La ejecución publica un resumen ejecutivo en la pestaña **Summary** y un solo artefacto con bitácora y evidencia de las suites ejecutadas. También se genera automáticamente cada lunes. Un PASS de este informe no acredita Chrome, Edge, Firefox, móvil, tableta ni accesibilidad automatizada.

GitHub solo permite iniciar manualmente workflows a usuarios con permiso de escritura en el repositorio. El enlace público sí permite a un usuario de solo lectura inspeccionar una ejecución ya iniciada. Para compartir evidencia, usa directamente la URL de la corrida reciente; la lectura no requiere permisos de escritura.

## Lo que no puede marcarse aprobado desde esta corrida

La matriz de [`test-plan.md`](test-plan.md) tiene 78 escenarios; algunos no corresponden todavía a una función implementada o requieren hardware, staging o evidencia operativa. La prueba de 150/250 usuarios es un workflow manual separado y requiere staging, una allowlist de hostname y una credencial de prueba. Cuando se ejecutan por separado, las pantallas E2E usan fixtures de API y no prueban el backend desplegado. El resumen lista estos límites para evitar presentar una función planeada como aprobada.

El [registro de evidencia por caso](case-evidence-register.md) enlaza los 78 escenarios con las pruebas de código relacionadas y distingue su cobertura de un dictamen de aceptación en Production. El control de calidad verifica automáticamente que estén los 78 casos y que los archivos vinculados existan; el JSON detallado queda en el artefacto de la corrida de calidad.
