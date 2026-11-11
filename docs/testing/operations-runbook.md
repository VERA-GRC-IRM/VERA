# Bitácora de pruebas de carga y controles operativos

Este formato conserva la evidencia de los casos que no se pueden concluir con las pruebas unitarias o CI del repositorio. Se llena por ejecución; “No ejecutado” es un estado explícito, no un resultado aprobado.

## Registro de ejecución

| Campo | Valor |
|---|---|
| Identificador / fecha UTC | `PENDIENTE` |
| Responsable y revisor | `PENDIENTE` |
| Commit / versión desplegada | `PENDIENTE` |
| Ambiente y región | `staging aislado / PENDIENTE` |
| URL base (sin tokens) | `PENDIENTE` |
| Navegador / herramienta / versión | `Grafana k6 2.3.0` o herramienta aplicable |
| Datos y cuentas de prueba | `PENDIENTE; solo datos sintéticos` |
| Inicio / fin / duración | `PENDIENTE` |
| Evidencias / runbook / enlaces | `PENDIENTE` |
| Resultado | `No ejecutado / PASS / FAIL / BLOQUEADO` |

## Prueba de carga del panel (TC-31, TC-32, TC-67)

El workflow manual [`.github/workflows/load-test.yml`](../../.github/workflows/load-test.yml) llama k6 contra `GET /api/dashboard` autenticado. Acepta solo un origen HTTPS que coincida exactamente con la variable de repositorio `VERA_LOAD_TEST_ALLOWED_HOST`, requiere el secret `VERA_LOAD_TEST_TOKEN` con un JWT de una cuenta de prueba dedicada y exige confirmar explícitamente que el target es staging aislado. Si falta la allowlist o el host no coincide, k6 se niega a correr. No se ejecuta en PR ni push.

Perfil: rampa gradual hasta 150 usuarios virtuales (VUs), mantiene 60 s, escala hasta 250 VUs, mantiene 60 s y reduce la carga durante 60 s. Cada VU consulta el panel con pausa de 1 s. Umbrales iniciales: menos de 1% de solicitudes fallidas, p95 de la API menor de 1500 ms y respuestas JSON HTTP 200. El umbral de p95 es una propuesta medible para proteger el requisito de carga de panel en 2 s; se debe validar con responsable de producto antes de convertirlo en SLO.

El resumen del workflow documenta resultado, hash, fecha/hora UTC, duración, número de solicitudes, latencia media/p90/p95/máxima y porcentaje de fallos en JSON y Markdown. El artifact se conserva 30 días. Los VUs comparten un token de prueba: la corrida mide lecturas concurrentes de la API, no crea 250 identidades ni mide login, carga de archivos, persistencia o escalamiento multi-región.

### Requisito previo y riesgo conocido

La aplicación Express aplica actualmente un límite global de **600 solicitudes por 15 minutos por IP** (`backend/server.js`); el inicio de sesión tiene un límite adicional de 30 y el asistente otro de 10 preguntas por usuario. Dado que los VUs en el runner salen por una misma IP, es probable que la prueba reciba respuestas 429 y falle sus umbrales al superar 600 peticiones. El límite se mantiene por instancia, por lo que una corrida tampoco demostraría un límite distribuido. La prueba no cambia ni salta estos controles. Antes de interpretar el resultado como capacidad de la plataforma, el responsable debe decidir y documentar la política de rate limiting para staging y producción y confirmar que el ambiente representa la configuración objetivo. No eleves el límite ni hagas esta prueba contra producción para obtener un resultado verde.

Campos de análisis para cada corrida:

- Carga alcanzada y duración efectiva en 150/250 VUs: `PENDIENTE`.
- Solicitudes/segundo, fallos por status (2xx/4xx/5xx), timeout: `PENDIENTE`.
- p50, p90, p95, p99 y máximo; desviación respecto a baseline: `PENDIENTE`.
- CPU, memoria, conexiones, event loop, base de datos y límites del proveedor: `PENDIENTE`.
- Logs correlacionados, degradación observada, impacto y recuperación: `PENDIENTE`.
- Aprobación del resultado, defectos y seguimiento: `PENDIENTE`.

## Evidencia de confiabilidad y operación (TC-57, TC-61 a TC-68, TC-73 a TC-77)

| Caso | Evidencia que debe adjuntarse | Resultado |
|---|---|---|
| TC-57 TLS | URL de staging, certificado/cadena, protocolo y fecha de verificación automatizada/manual. | No ejecutado |
| TC-61 disponibilidad 99.5% | Fuente de monitoreo, ventana continua de 30 días, minutos elegibles/no disponibles y exclusiones acordadas. | No ejecutado |
| TC-62 recuperación <=4 h | Backup identificado, RTO medido, pasos y cronología de restore en ambiente aislado; validación de datos posterior. | No ejecutado |
| TC-63 crecimiento 300% | Baseline y carga de datos sintéticos, configuración, latencias/errores y recursos antes/después. | No ejecutado |
| TC-64 escala sin interrupción | Deployment/escala documentada, réplicas, errores y medición de interrupción durante cambio. | No ejecutado |
| TC-65 privacidad | Inventario de datos, finalidad/retención, jurisdicción aplicable, revisión del responsable y aprobación fechada. | No ejecutado |
| TC-66 retención de historia/evidencia | Política vigente, storage persistente, fechas de creación/borrado y validación de consulta. | Bloqueado: el código contempla Supabase, pero falta evidencia de la política y su ejecución en el entorno real. |
| TC-67 panel <=2 s | Navegador, red, viewport, dataset, p50/p95, repetición y artefacto de medición. | Parcial: PR-7 mide API; falta página completa con red/hardware representativos |
| TC-68 reportes de 100 páginas <=10 s | Reporte/dataset/versiones, duración end-to-end, memoria y evidencia descargada. | PDF paginado y benchmark local sintético implementados; pendiente medición completa de API, Supabase y red en entorno representativo. |
| TC-73 aviso de mantenimiento 48 h | Cambio planificado, hora de aviso, canales, audiencia y entrega comprobada. | No ejecutado |
| TC-74 backup diario | Retención de 30 días de ejecuciones, resultado/alerta, almacenamiento y dueño de guardia. | Bloqueado: no se encontró configuración de backup |
| TC-75 volumen alto de evidencia | Cantidad/tamaño de archivos, concurrencia, storage y p95 de carga/descarga. | Parcial: existe carga binaria individual con límite de 3 MB; falta probar volumen y concurrencia en almacenamiento persistente de staging. |
| TC-76 integración externa | Contrato/fuente, ambiente sandbox, latencia/errores, reintentos y reconciliación. | No ejecutado: fuente externa no definida |
| TC-77 privacidad/consentimiento | Aviso público, versión y fecha almacenadas, consulta y solicitud de cancelación. | Implementación preparada en PR #135; no ejecutado en producción ni revisado jurídicamente. |

La evidencia debe adjuntar fecha, región, commit, configuración saneada, método de cálculo y dueño del siguiente paso. Nunca almacenar credenciales, datos personales reales o tokens en la bitácora.
