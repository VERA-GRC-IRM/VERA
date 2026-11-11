# Trabajo sin conexión

VERA permite continuar una parte del trabajo después de una sesión inicial con internet. En **Sin conexión**, cada persona elige qué información autorizada guardar en una copia cifrada de este dispositivo. La copia indica cuándo se actualizó y caduca después de 24 horas.

| Disponible después de preparar la copia | Requiere volver a conectarse |
| --- | --- |
| Abrir la interfaz y consultar secciones elegidas | Iniciar una sesión nueva o recuperar acceso |
| Redactar notas, comentarios, avances de planes, descripciones de riesgos/controles y hallazgos como borradores | Confirmar cambios, aprobaciones y permisos actuales |
| Preparar archivos de evidencia cifrados y consultar hasta dos archivos ya registrados que se hayan elegido con conexión | Vincular archivos nuevos en Supabase y consultar archivos no preparados |
| Filtrar un informe guardado, descargar CSV e imprimir/guardar PDF local | Obtener datos nuevos, el PDF oficial y consultar la IA de Azure |

Al reconectar, los comentarios, avances, hallazgos y archivos se envían solo cuando la persona lo indica. VERA comprueba de nuevo permisos y versiones; una respuesta incierta exige revisión. Los hallazgos nuevos requieren causa raíz y severidad. Los borradores anteriores que no las incluyan permanecen visibles, pero no se envían incompletos. Los borradores locales no equivalen a registros confirmados.

La vista informa el uso y la cuota aproximada del navegador. Con una segunda confirmación, **Limpiar datos finalizados** elimina copias caducadas y borradores ya enviados, conservando el trabajo pendiente o en revisión. No modifica Supabase.

**Guía paso a paso:** [alcance, protección, límites y ensayos](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/offline-mode.md) · [contratos de lectura y envío](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/offline-contracts.md) · [ensayo integral](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/offline-rehearsal.yml) · [actualización entre dos releases](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/offline-two-release-rehearsal.yml).
