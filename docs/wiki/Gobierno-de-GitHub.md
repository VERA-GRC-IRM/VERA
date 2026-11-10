# Gobierno de GitHub · VERA

Esta página explica la configuración del entorno GitHub, separada del comportamiento de las historias de usuario. **Corte inicial: 17 de octubre de 2026; excepción E2E: 10 de noviembre de 2026.** Las políticas reales viven en GitHub; vuelve a comprobarlas después de cambiar la organización, el plan o los permisos.

## Dos repositorios, una aplicación

| Repositorio | Función |
| --- | --- |
| [`VERA-GRC-IRM/VERA`](https://github.com/VERA-GRC-IRM/VERA) | Aplicación, pruebas, documentación, Wiki versionada y automatizaciones. |
| [`VERA-GRC-IRM/.github`](https://github.com/VERA-GRC-IRM/.github) | Únicamente el perfil público de la organización, mostrado desde `profile/README.md`. No es una segunda copia de la aplicación. |

El repositorio `.github` tiene Issues, Projects, Wiki y Actions desactivados para evitar dos lugares donde gestionar el mismo trabajo. Su rama `main` [requiere PR](https://github.com/VERA-GRC-IRM/.github/rules/25316961), bloquea borrado y cambios forzados; las ramas fusionadas se eliminan automáticamente. Las incidencias, propuestas y ejecuciones se consultan en `VERA`.

## Ruta de integración en `VERA`

La [regla de `main`](https://github.com/VERA-GRC-IRM/VERA/rules/25312937) exige PR, conversaciones resueltas y checks actualizados con la rama antes de integrar. No exige una aprobación ajena: quien tenga permiso de escritura puede proponer y fusionar su propio PR cuando pase los controles. Bloquea el borrado y el force push.

| Check obligatorio | Qué comprueba | Límite |
| --- | --- | --- |
| Calidad Node.js 22 | Pruebas, lint, build, dependencias e informe | No sustituye pruebas con cuentas y datos de producción. |
| CodeQL JavaScript/TypeScript | Análisis estático del código | Cero alertas abiertas es un dato de corte, no garantía absoluta. |
| Descripción revisable | Alcance, evidencia, verificación y riesgos del PR | La evidencia debe seguir siendo verificable por quien revisa. |
| Supabase local | Migraciones, tablas privadas, persistencia y bitácora sintéticas tras reinicio, restauración lógica | Base desechable; no acredita copia ni persistencia de Production. |

La matriz UI E2E de Chrome, Edge, Firefox, móvil/tableta y accesibilidad automatizada está [diferida](https://github.com/VERA-GRC-IRM/VERA/issues/300): su workflow sigue disponible manualmente, pero no es un check obligatorio ni se cuenta como aprobado en el informe integral.

La [plantilla de PR](https://github.com/VERA-GRC-IRM/VERA/blob/main/.github/pull_request_template.md) y el [validador](https://github.com/VERA-GRC-IRM/VERA/blob/main/.github/scripts/check_pr_description.py) dan el mismo formato a cambios humanos y asistidos por IA. El workflow lee el script de `main`, no del código propuesto; los PR cerrados omiten el job al editar su descripción. El PR [#103](https://github.com/VERA-GRC-IRM/VERA/pull/103) registra la corrección y sus tiempos.

## Automatización con alcance explícito

| Automatización | Activación | Evidencia principal |
| --- | --- | --- |
| [Calidad y CodeQL](https://github.com/VERA-GRC-IRM/VERA/actions) | Cada PR y push a `main` | Checks obligatorios del commit; navegadores diferidos. |
| [Informe integral de calidad](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/classroom-quality.yml) | Manual y semanal | Summary, tiempos, logs y artefacto de 30 días. |
| [Evaluación sintética de IA](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/ai-evaluation.yml) | Manual | Regresiones reproducibles sin llamadas al modelo real. |
| [Portal público de calidad](https://vera-grc-irm.github.io/VERA/) | Cambios y comprobación programada | Estado por SHA en GitHub Pages, sin instalación local. |
| [Ensayo local de Supabase](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/local-supabase-rehearsal.yml) | Cada PR, push a `main` y manual | Migraciones, privacidad, persistencia sintética y restauración lógica con tiempos. |
| [Sincronización de Wiki](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/wiki-sync.yml) | Cambios en `docs/wiki/` y ejecución manual | Publica las páginas revisadas desde `main`. |
| [Carga en staging](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/load-test.yml) | Manual | Solo se ejecuta con destino y autorización de staging. |

Dependabot propone actualizaciones semanales de npm y GitHub Actions. Sus PR pasan por las mismas reglas; una propuesta abierta no equivale a una actualización integrada. GitHub elimina las ramas fusionadas y permite auto merge una vez satisfechos los checks.

## Política de ejecución y seguridad

En `VERA`, Actions está limitado a acciones publicadas por GitHub y a `grafana/setup-k6-action` en el SHA usado por el workflow de carga. GitHub exige **SHA completo** en las referencias de acciones. El `GITHUB_TOKEN` parte de permiso **read**; cada workflow declara solo las capacidades adicionales que necesita. Este control se aplica en la configuración del repositorio y debe revisarse allí si se añade o actualiza una acción externa.

CodeQL, Dependabot security updates, secret scanning, push protection y reporte privado de vulnerabilidades están habilitados. El [panel de seguridad](https://github.com/VERA-GRC-IRM/VERA/security) es la fuente para el estado actual. No publiques valores de secretos en issues, PR, logs ni artefactos.

**Actualización de la alerta histórica:** la [alerta #1 de secret scanning](https://github.com/VERA-GRC-IRM/VERA/security/secret-scanning/1) se cerró como `revoked` después de comprobar que el valor antiguo recibía HTTP 401 en REST y Auth. El panel mostró una clave activa distinta; no se publicó ni rotó a ciegas. La [bitácora](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/testing/production-verification-2026-10-17.md) conserva el alcance exacto. El estado actual de alertas se consulta en Security, porque puede cambiar después de este corte.

## Interpretar el estado

El [portal](https://vera-grc-irm.github.io/VERA/) muestra la evidencia más reciente de Actions en `main`; compara siempre su SHA con el commit actual. El antiguo despliegue registrado en GitHub apuntaba en el corte inicial a `720cef05…` y la URL `vera-figbo.vercel.app` mostraba **Login – Vercel**. Después se conectó la [instancia propia](https://www.vera-digital-systems.com/) a `VERA-GRC-IRM/VERA`; [#113](https://github.com/VERA-GRC-IRM/VERA/issues/113) enlaza el despliegue automático y el smoke verificados. Comprueba el SHA efectivo en Vercel para cada entrega. Los checks aprobados y un smoke anónimo no prueban que todos los flujos funcionen con cuentas reales, Supabase y Azure OpenAI.

## Entregas y aceptación visibles

Los [hitos cerrados](https://github.com/VERA-GRC-IRM/VERA/milestones?state=closed) separan tres cortes históricos de PR integrados del [hito abierto de aceptación](https://github.com/VERA-GRC-IRM/VERA/milestone/4). El [tablero público](https://github.com/orgs/VERA-GRC-IRM/projects/1/views/2) muestra el estado de la [issue #113](https://github.com/VERA-GRC-IRM/VERA/issues/113) y sus seis subtareas. Las nuevas issues abiertas se incorporan automáticamente; cerrar una exige evidencia del entorno correcto. Un hito histórico cerrado no declara aceptada una HU en producción. Las historias y sus estados siguen en Azure Boards.

Para revisar o restaurar el entorno después de una transferencia: confirma el destino de `main`, reglas, checks requeridos, política de Actions, permisos del token, escaneo de seguridad, Pages, Wiki y última ejecución integral. Después comprueba por separado el SHA y las variables del despliegue. No ejecutes la carga de 150/250 usuarios contra producción.
