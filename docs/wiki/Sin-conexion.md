# Trabajo sin conexión

VERA permite continuar una parte del trabajo después de una sesión inicial con internet. En **Sin conexión**, cada persona elige qué información autorizada guardar en una copia cifrada de este dispositivo. La copia indica cuándo se actualizó y caduca después de 24 horas.

| Disponible después de preparar la copia | Requiere volver a conectarse |
| --- | --- |
| Abrir la interfaz y consultar secciones elegidas | Iniciar una sesión nueva o recuperar acceso |
| Redactar notas, comentarios y avances de planes como borradores | Confirmar cambios, aprobaciones y permisos actuales |
| Preparar archivos de evidencia cifrados y consultar hasta dos archivos ya registrados que se hayan elegido con conexión | Vincular archivos nuevos en Supabase y consultar archivos no preparados |
| Filtrar un informe guardado, descargar CSV e imprimir/guardar PDF local | Obtener datos nuevos, el PDF oficial y consultar la IA de Azure |

Al reconectar, los comentarios, avances y archivos se envían solo cuando la persona lo indica. Si la versión del plan cambió o la respuesta del servidor es incierta, VERA pide revisión antes de repetir una acción. Los borradores locales no equivalen a registros confirmados.

**Guía paso a paso:** [alcance, protección, límites y ensayos](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/offline-mode.md) · [ensayo manual del modo local](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/offline-rehearsal.yml).
