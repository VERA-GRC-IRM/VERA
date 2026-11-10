# Estado de calidad · bitácora de evidencia

> Desde el 10 de noviembre de 2026, las pruebas de navegadores y accesibilidad automatizada están [diferidas](https://github.com/VERA-GRC-IRM/VERA/issues/300). Los resultados de navegador que siguen abajo pertenecen a un corte histórico; consulta el [portal vigente](https://vera-grc-irm.github.io/VERA/) para el SHA actual.

Para revisar el estado actual de VERA **sin instalar nada**, abre el [portal público de calidad](https://vera-grc-irm.github.io/VERA/). La [issue de preparación #113](https://github.com/VERA-GRC-IRM/VERA/issues/113) registra las puertas que siguen abiertas. Esta página conserva también un corte histórico del commit `720cef05d2e1c5b16a5552837dbc0c5c3043381e`, observado el **17 de octubre de 2026**. El [workflow integral](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/classroom-quality.yml) ofrece el enlace estable para ejecutar o consultar corridas.

La sección [Releases](https://github.com/VERA-GRC-IRM/VERA/releases) conserva cortes puntuales con commit, evidencias y límites. El portal muestra el resultado más reciente de `main`; una Release no certifica por sí misma la aceptación funcional en Production.

## Evidencia posterior al corte histórico

La [corrida integral del 18 de octubre](https://github.com/VERA-GRC-IRM/VERA/actions/runs/39082004375) aprobó 111 pruebas backend, 20 casos sintéticos de IA y 186 escenarios de navegador, con cobertura backend de 96.43 % de líneas, 82.48 % de ramas y 95.77 % de funciones. La [aceptación de roles en Preview](https://github.com/VERA-GRC-IRM/VERA/actions/runs/39082004343) aprobó 83/83 comprobaciones con datos de demostración en memoria. El [smoke público de Production](https://github.com/VERA-GRC-IRM/VERA/actions/runs/39081832918) comprobó disponibilidad y rechazo anónimo, y el [ensayo desechable de Supabase](https://github.com/VERA-GRC-IRM/VERA/actions/runs/39085291569) verificó migraciones, acceso privado, persistencia sintética tras reinicio local y restauración lógica sintética. Consulta el portal para saber si alguna corrida corresponde al SHA vigente; estos enlaces son evidencia fechada, no una afirmación permanente.

La alerta histórica de una clave Supabase se cerró como revocada tras comprobar que el valor antiguo recibía HTTP 401; la [bitácora operativa](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/testing/production-verification-2026-10-17.md) delimita esa comprobación. Las alertas nuevas deben revisarse en [Security](https://github.com/VERA-GRC-IRM/VERA/security).

## Resultado verificado en ese commit

| Verificación | Resultado observado | Evidencia |
| --- | --- | --- |
| Informe integral | **PASS**, duración total observada **363 s** | [Corrida #39059538661](https://github.com/VERA-GRC-IRM/VERA/actions/runs/39059538661) |
| Backend y calidad | **111/111** pruebas; **0** vulnerabilidades altas o críticas en la auditoría npm de esa corrida | *Summary* y artefacto de la misma corrida |
| Interfaz y accesibilidad | **186** casos aprobados; 0 fallidos, 0 inestables y 0 omitidos, con navegadores y tamaños configurados | *Summary*, logs y trazas de la misma corrida |
| CodeQL | El análisis terminó correctamente. **Había 46 ubicaciones abiertas** de `js/missing-rate-limiting` en `main` al corte. | [Security](https://github.com/VERA-GRC-IRM/VERA/security/code-scanning) y [corrección integrada mediante PR #97](https://github.com/VERA-GRC-IRM/VERA/pull/97) |

**Actualización posterior:** el [PR #97](https://github.com/VERA-GRC-IRM/VERA/pull/97) se integró en `main`. El [CodeQL de ese commit](https://github.com/VERA-GRC-IRM/VERA/actions/runs/39061317593) terminó correctamente y la API de alertas mostraba **0 abiertas** tras el análisis. La fila de 46 ubicaciones describe solo el corte histórico de `720cef05d2e1`. La alerta de secreto se revisa por separado.

El artefacto de la corrida conserva JSON, Markdown, logs e informe de navegador durante **30 días**. La cifra de duración individual mostrada para CodeQL en esa ejecución incluía la espera de otras fases; no debe presentarse como latencia del análisis. El [PR #95](https://github.com/VERA-GRC-IRM/VERA/pull/95) corrige el cronómetro de próximas corridas.

## Tres enlaces para una revisión completa

1. [Ver el portal de calidad](https://vera-grc-irm.github.io/VERA/): resultado vigente por SHA, enlaces a Summary, logs y artefactos.
2. [Consultar el registro de evidencia por caso](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/testing/case-evidence-register.md), el [plan de 78 casos](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/testing/test-plan.md) y la [matriz de aceptación por HU](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/hu-acceptance-audit.md): qué código de prueba se relaciona con cada escenario y qué falta por aceptar en Production.
3. [Abrir el workflow estable](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/classroom-quality.yml): muestra corridas futuras sin cambiar el enlace. Solo integrantes con escritura pueden pulsar **Run workflow**; la lectura pública no requiere clonar el repositorio.

El [PR #98](https://github.com/VERA-GRC-IRM/VERA/pull/98) publicó el [portal de calidad](https://vera-grc-irm.github.io/VERA/) en HTML, Markdown y JSON. Sus datos se regeneran mediante GitHub Actions y Pages, sin llamadas a modelos ni consumo de tokens de IA. Esta página de Wiki sigue siendo una bitácora histórica; el portal muestra el estado más reciente de las corridas.

## Interpretación responsable

Las 78 filas del plan son **casos planeados**, no 78 aprobaciones de producción. Los E2E usan fixtures de API y no verifican persistencia real ni sesiones de todos los roles. La prueba de carga de 150/250 usuarios requiere staging autorizado. La [instancia propia de VERA](https://www.vera-digital-systems.com/) tiene un smoke público y despliegue trazado; siguen pendientes los flujos autenticados y la IA dentro de la aplicación. La barrera **Login – Vercel** se observó en la URL anterior `vera-figbo.vercel.app` durante el corte histórico, no es el resultado del smoke de la instancia propia. Las alertas de Security deben revisarse aparte; un check verde no equivale a cero hallazgos.
