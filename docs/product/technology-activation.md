# Activación controlada de capacidades transversales

Esta bitácora distingue **código integrado**, **función disponible en el despliegue** y **aceptación con cuentas reales**. La decisión actual es mantener pendientes las migraciones y la activación de nuevas funciones persistentes en Supabase Production. Una revisión automática satisfactoria no sustituye las pruebas de extremo a extremo.

| Capacidad | Código | Disponible sin activación adicional | Dependencia pendiente |
| --- | --- | --- | --- |
| Búsqueda en registros y texto ya indexado | [#382](https://github.com/VERA-GRC-IRM/VERA/pull/382), [#392](https://github.com/VERA-GRC-IRM/VERA/pull/392) | Sí, con el índice privado existente | Medir latencia por volumen; documentos sin texto indexado no aparecen por contenido |
| Enlace directo desde todas las pantallas autenticadas | [#383](https://github.com/VERA-GRC-IRM/VERA/pull/383) | Sí | Comprobar destinos y permisos en el despliegue actual; el estado solo visual no se serializa |
| Cambios visibles entre usuarios | [#390](https://github.com/VERA-GRC-IRM/VERA/pull/390) | Continúa la consulta periódica existente | Activar el canal y medir carga; depende de bitácora persistente |
| Presencia de edición en riesgos y controles | [#391](https://github.com/VERA-GRC-IRM/VERA/pull/391) | No | Migración `20261112060000_record_edit_presence.sql`, limpieza y pruebas con dos cuentas |
| Espacio personal entre dispositivos | [#384](https://github.com/VERA-GRC-IRM/VERA/pull/384) | Solo copia local actual | Migración `20261112010000_create_user_workspace.sql` y aceptación de sincronización |
| Centro de trabajos de reportes | [#386](https://github.com/VERA-GRC-IRM/VERA/pull/386) | Continúa la exportación inmediata actual | Migración `20261112020000_create_report_jobs.sql`, procesador programado y pruebas de reinicio |
| Versiones de evidencias | [#388](https://github.com/VERA-GRC-IRM/VERA/pull/388) | No | Migración `20261112040000_evidence_file_versions.sql` y prueba de historial/descarga |
| Carga reanudable de evidencias de hasta 3 MB | [#389](https://github.com/VERA-GRC-IRM/VERA/pull/389) | Continúa la carga actual | Migración `20261112050000_resumable_evidence_uploads.sql`, limpieza y prueba de corte de red |
| Push con la aplicación cerrada | [#387](https://github.com/VERA-GRC-IRM/VERA/pull/387) | Continúan los avisos con VERA abierta | Migración `20261112030000_create_push_subscriptions.sql`, claves VAPID y aceptación en dispositivos |

## Orden de activación cuando se retome

1. Confirmar la identidad del proyecto Supabase **VERA**, referencia `rsrsycokfdypliepcxgi`, y comparar el historial de migraciones con `main`. Confirmar también el SHA desplegado en Vercel y la disponibilidad de un entorno aislado de prueba. Si existe una diferencia no explicada, detener la activación y documentarla.
2. Revisar una estrategia de respaldo y reversión apropiada para el plan disponible. Aplicar solo las migraciones faltantes, en orden de nombre, primero en el entorno de prueba. Las tablas nuevas son privadas: RLS activo y acceso únicamente desde el backend con `service_role`.
3. Habilitar una capacidad a la vez. Configurar primero el almacén y la bandera del backend; comprobar la API y los permisos; después habilitar la bandera de frontend y desplegar ambas piezas desde el mismo commit. No encender todas las banderas a la vez.
4. Para el espacio personal: `VERA_WORKSPACE_STORE=supabase`, `VERA_WORKSPACE_SYNC_ENABLED=true`, `VITE_VERA_WORKSPACE_SYNC_ENABLED=true`. Comprobar importación opcional, edición concurrente, eliminación y revocación de permiso en dos dispositivos.
5. Para los reportes: `VERA_JOB_STORE=supabase`, `VERA_JOBS_ENABLED=true`, `VITE_VERA_JOBS_ENABLED=true`, `CRON_SECRET` privado y ejecución programada de `GET /api/jobs/worker`. Comprobar que un trabajo continúa al cerrar la pestaña, que la descarga revalida permisos y que cancelación/reintento no duplican resultados. Sin procesador programado, la cola no está operativa.
6. Para archivos: activar versiones con `VERA_EVIDENCE_VERSIONS_ENABLED=true` y `VITE_VERA_EVIDENCE_VERSIONS_ENABLED=true`; después la vía reanudable con `VERA_RESUMABLE_STORE=supabase`, `VERA_RESUMABLE_UPLOADS_ENABLED=true` y `VITE_VERA_RESUMABLE_UPLOADS_ENABLED=true`. Programar `GET /api/evidence/uploads/cleanup` con `CRON_SECRET`. Probar interrupción, nueva selección del mismo archivo, huella, cierre repetido y descarga de cada versión. El límite permanece en 3 MB por archivo.
7. Para cambios visibles: comprobar `VERA_AUDIT_STORE=supabase` y probar `VERA_LIVE_UPDATES_ENABLED=true` junto con `VITE_VERA_LIVE_UPDATES_ENABLED=true`. Para presencia, activar por separado `VERA_PRESENCE_STORE=supabase`, `VERA_PRESENCE_ENABLED=true` y `VITE_VERA_PRESENCE_ENABLED=true`; programar `GET /api/live/presence/cleanup` con `CRON_SECRET`. Verificar aislamiento por ámbito, cambio de rol, cierre brusco y retorno a la consulta periódica si falla el canal.
8. Para push: generar VAPID fuera de Git, configurar `VERA_VAPID_PUBLIC_KEY`, `VERA_VAPID_PRIVATE_KEY`, `VERA_VAPID_SUBJECT`, `VERA_PUSH_STORE=supabase`, `VERA_PUSH_ENABLED=true` y al final `VITE_VERA_PUSH_ENABLED=true`. Confirmar permiso denegado, consentimiento por dispositivo, pantalla bloqueada, sesión cerrada, revocación y suscripción inválida.

## Evidencia de aceptación

Por capacidad, conservar: SHA de `main` y despliegue, migración aplicada, banderas activas, casos y resultados con fecha, tiempo observado, cuenta/rol de prueba sin credenciales, resultado de permisos y procedimiento de reversión probado. Para el canal en vivo, presencia, cola y cargas, medir carga concurrente y consumo antes de anunciar disponibilidad general. Los escenarios de 150 y 250 personas se ejecutan en un entorno aislado, no contra Production sin preparación. No completar como «aprobado» ningún caso que no haya sido ejecutado allí.

## Reversión

Apagar primero la bandera de frontend y luego la de backend; retirar la programación del procesador o limpieza que corresponda. Conservar tablas y resultados para investigación y decidir su retención posteriormente. No borrar datos ni revertir migraciones con `DROP` como respuesta automática a un fallo. La búsqueda y los enlaces actuales no dependen de estas nuevas banderas.

Los criterios detallados y las limitaciones están en [búsqueda](universal-search.md), [actualización](live-updates.md), [espacio personal](personal-workspace.md), [trabajos](durable-jobs.md), [carga](evidence-upload.md) y [avisos](desktop-alerts.md). Las incidencias [#371](https://github.com/VERA-GRC-IRM/VERA/issues/371), [#372](https://github.com/VERA-GRC-IRM/VERA/issues/372), [#373](https://github.com/VERA-GRC-IRM/VERA/issues/373) y [#374](https://github.com/VERA-GRC-IRM/VERA/issues/374) permanecen abiertas hasta la aceptación correspondiente.
