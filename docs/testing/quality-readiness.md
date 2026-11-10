# Preparación de calidad: criterios de salida y brechas

> **Estado operativo más reciente:** consulta la [issue #113](https://github.com/VERA-GRC-IRM/VERA/issues/113) y el [portal público](https://vera-grc-irm.github.io/VERA/). La tabla inferior es un corte histórico del 17 de octubre; sus celdas no describen el estado actual.

> **Excepción de calidad vigente desde el 10 de noviembre:** la [matriz E2E de navegadores y accesibilidad](browser-e2e-debt.md) está fuera de los gates obligatorios y del informe integral. La [deuda #300](https://github.com/VERA-GRC-IRM/VERA/issues/300) conserva el riesgo y la evidencia requerida para reactivarla.

Después de ese corte se revocó la clave histórica y se cerró su alerta, Vercel volvió a publicar `main` automáticamente, el smoke público pasó y se añadieron pruebas de roles en Preview y un ensayo desechable de Supabase. La [corrida integral posterior](https://github.com/VERA-GRC-IRM/VERA/actions/runs/39082004375) documenta 111 pruebas backend, 20 casos de IA sin red, 186 escenarios de navegador, CodeQL y cobertura del mismo corte. Ninguna de estas evidencias acredita aceptación autenticada completa en Production.

Siguen abiertas las sesiones y flujos reales por rol, la consulta de IA desde VERA desplegada, una lectura independiente de un cambio sintético después de redesplegar, la carga 150/250 en staging, una restauración de una copia real y la revisión humana de accesibilidad. El [ensayo local de Supabase](local-supabase-rehearsal.md) usa exclusivamente datos sintéticos; Supabase Free permanece sin plan de pago. El estado de cada puerta se actualiza con evidencia en la issue #113.

**Corte:** 17 de octubre de 2026, `main` en `ac253fee98417f08a2e0390a38e4f803eafa83c1`. Este documento es un mapa de verificación, no una certificación. Consulta el [portal dinámico](https://vera-grc-irm.github.io/VERA/) y las [alertas de Security](https://github.com/VERA-GRC-IRM/VERA/security) antes de reutilizar una cifra.

**Actualización posterior:** la [verificación operativa del 17 de octubre](production-verification-2026-10-17.md) registra una escritura sintética de auditoría en Supabase desde la aplicación publicada, la alerta histórica cerrada como clave revocada y los límites vigentes de despliegue, carga, recuperación y accesibilidad. La tabla siguiente conserva el estado del corte original.

## Línea base comprobada

La [corrida integral del corte](https://github.com/VERA-GRC-IRM/VERA/actions/runs/39065155452) terminó PASS en 273 s: 111/111 pruebas backend, 186/186 casos de navegador, CodeQL aprobado y 0 vulnerabilidades altas/críticas en la auditoría npm. La cobertura backend fue 96.46 % de líneas, 82.58 % de ramas y 95.77 % de funciones. La [evaluación sintética de IA](https://github.com/VERA-GRC-IRM/VERA/actions/runs/39065160258) aprobó 20/20 casos sin llamadas al modelo. Estas cifras prueban el alcance de esas suites en ese SHA; los E2E usan respuestas API controladas.

## Puertas de salida

| Puerta | Estado del corte | Evidencia necesaria para cerrarla |
| --- | --- | --- |
| Integración continua | **Aprobada para el SHA del corte** | Checks requeridos en PR y `main`, artefactos, resultados y tiempos del mismo commit. |
| Credenciales y hallazgos | **Abierta** | Revocar o rotar la [clave Supabase expuesta](https://github.com/VERA-GRC-IRM/VERA/security/secret-scanning/1), actualizar entornos, comprobar funcionamiento y registrar cierre de la alerta. No publicar el valor. |
| Despliegue trazable | **Sin verificar** | SHA efectivamente publicado, acceso a la aplicación, rol, configuración saneada y prueba de humo posterior al despliegue. El registro Production observado apuntaba a un commit anterior y la URL del equipo mostraba el acceso de Vercel. |
| Persistencia y permisos reales | **Sin prueba integral** | Staging aislado con Supabase, cuentas sintéticas por rol, prueba de escritura/lectura tras reinicio, aislamiento entre usuarios, casos negativos y limpieza de datos. |
| Rendimiento y concurrencia | **Preparado, no ejecutado** | Corrida k6 de 150 y 250 VUs en staging autorizado: tasa de error, p95, p99, recursos, configuración y decisión explícita sobre el límite de 100 solicitudes/IP/15 min. |
| Recuperación y continuidad | **Sin prueba** | Evidencia de respaldos, restauración en entorno aislado, integridad de datos, tiempo de recuperación medido y monitoreo de disponibilidad durante la ventana acordada. |
| Accesibilidad y usabilidad | **Parcial** | Revisión manual de teclado/lector y dispositivos físicos en rutas clave; protocolo de tareas con participantes y resultados observados. Axe y emulación no equivalen a conformidad WCAG completa. |
| Seguridad aplicada | **Parcial** | Matriz de controles verificables para autenticación, autorización, entradas, archivos, sesiones y registros; revisión de los hallazgos y pruebas dinámicas en un entorno autorizado. |

Una puerta abierta o no verificada **no se convierte en aprobada por promedio de cobertura**, por número de casos planeados ni por una etiqueta de historia. Los 78 casos de la [matriz de trazabilidad](test-plan.md) conservan su estado individual.

## Orden propuesto de trabajo

1. **Cerrar el secreto y restablecer la trazabilidad del despliegue.** Coordinar la rotación con los entornos que usan la clave y obtener acceso de verificación al despliegue del equipo. Registrar el SHA y una prueba de humo con datos sintéticos. No rotar a ciegas si eso interrumpe el servicio.
2. **Probar la integración real.** Preparar una base/bucket de staging aislados y sembrados reproducibles; ejecutar contratos de API, permisos por rol, persistencia tras reinicio y limpieza. Separar estos resultados de las pruebas que usan memoria o fixtures.
3. **Medir carga y fiabilidad.** Resolver la política de rate limiting antes de interpretar k6; registrar latencias, errores y recursos. Definir SLI/SLO sobre una línea base, configurar alertas y realizar un simulacro de restauración.
4. **Completar verificaciones humanas.** Ejecutar teclado/lector de pantalla, dispositivos reales, usabilidad y revisión de privacidad/retención con criterios acordados; adjuntar evidencia fechada y defectos.
5. **Preparar cada liberación.** Vincular commit, despliegue, resultados, hallazgos aceptados, plan de reversión y artefactos. Considerar SBOM y procedencia verificable cuando se distribuya una imagen o paquete; no generar una etiqueta de release como sustituto de estas evidencias.

En cada etapa, registrar ambiente, commit, fecha, datos de prueba, pasos, resultados, duración, fallos y enlace a logs saneados. Cualquier excepción debe indicar exactamente qué control no pasó y qué riesgo queda abierto. Para una referencia externa de proceso, [NIST SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final) describe prácticas de desarrollo seguro, y [OWASP ASVS](https://owasp.org/projects/asvs) ofrece requisitos técnicos de verificación web. Esta ruta usa esas referencias como guía; **no afirma conformidad ni certificación**.
