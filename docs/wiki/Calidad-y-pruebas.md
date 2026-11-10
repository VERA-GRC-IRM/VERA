# Calidad y pruebas

Para una lectura ejecutiva con el SHA actual, estados y tiempos abre el [portal de calidad](https://vera-grc-irm.github.io/VERA/). La página [Estado de calidad](https://github.com/VERA-GRC-IRM/VERA/wiki/Estado-de-calidad) conserva un corte histórico documentado.

VERA deja resultados accesibles desde GitHub Actions. Una persona sin entorno local puede ver el commit, el estado, los pasos, los logs y, cuando existen, los artefactos de cada corrida. **Lee siempre la corrida concreta**: un enlace a un workflow no garantiza que su última ejecución haya pasado.

## Ruta de verificación

1. Abre el [portal de calidad](https://vera-grc-irm.github.io/VERA/) y sigue el enlace del informe integral a [VERA — Calidad y pruebas completas](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/classroom-quality.yml).
2. Elige una corrida, revisa `Summary`, su SHA y el resultado de cada fase.
3. Consulta los logs y el artefacto de esa misma corrida. La [guía rápida](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/testing/professor-quick-run.md) explica la navegación y los permisos para ejecutar manualmente.

El workflow integral es manual y semanal. Solo quien tiene escritura puede pulsar `Run workflow`; la lectura de una corrida pública no requiere clonar el repositorio.

## Capas de verificación

| Capa | Enlace | Alcance |
| --- | --- | --- |
| Backend, lint, build y dependencias | [Quality gates](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/quality.yml) | Pruebas de Node con cobertura, sintaxis, ESLint, compilación y `npm audit`. |
| Navegadores y accesibilidad | [UI E2E manual](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/e2e.yml) | Matriz conservada, [diferida como gate](https://github.com/VERA-GRC-IRM/VERA/issues/300); no incluida en el PASS integral vigente. |
| Análisis estático | [CodeQL](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/codeql.yml) | JavaScript/TypeScript; no sustituye una revisión completa de seguridad. |
| Vista unificada | [Informe integral de calidad](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/classroom-quality.yml) | Reúne fases, tiempos y evidencia en una ejecución para inspección. |
| IA sintética | [AI continuous evaluation](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/ai-evaluation.yml) | Casos reproducibles, sin Azure real y sin costo por llamada. |
| Carga | [Load test](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/load-test.yml) | Ejecución manual condicionada a staging aprobado y cuenta dedicada. |

## Qué falta para una afirmación de calidad completa

El [plan de pruebas](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/testing/test-plan.md) incluye casos funcionales, seguridad, compatibilidad y concurrencia. Algunos dependen de una función implementada, dispositivo, datos o entorno real. El script de 150 usuarios simultáneos y 250 o más **no equivale a una corrida ejecutada**. Hay que registrar VU efectivos, p95, tasa de error, fecha, SHA y configuración de staging.

La [ruta de calidad y criterios de salida](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/testing/quality-readiness.md) ordena los pendientes por riesgo y especifica qué evidencia hace falta antes de afirmar preparación de producción. Una cobertura elevada o un check verde no cierran por sí solos las verificaciones del entorno real.

Cuando se ejecutan manualmente, las pruebas E2E con fixtures comprueban la interfaz y el contrato simulado; no acreditan persistencia Supabase ni permisos con cuentas reales desplegadas. La [matriz de aceptación](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/hu-acceptance-audit.md) enumera verificaciones pendientes por HU. Si una función se corrige, se repiten los casos relacionados y se registra el resultado antes de darla por aceptada.

## Ejecutar localmente

Con Node.js 22 y dependencias instaladas:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
npm run quality
```

`npm run quality` genera un resumen local bajo `quality-report/`, ignorado por Git. El [runbook operativo](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/testing/operations-runbook.md) ofrece el detalle de interpretación y evidencia.
