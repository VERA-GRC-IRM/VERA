# Carga de evidencias

La vista de evidencias acepta selección o arrastre de hasta 10 PDF, Word, Excel, CSV, TXT o imágenes compatibles de 3 MB cada uno. Muestra nombre, tamaño y estado individual. Los envía uno por uno al mismo registro relacionado, informa el avance del archivo actual y permite detener el lote. Cada archivo queda confirmado solo cuando responde el servidor; si alguno es rechazado, se pueden reintentar únicamente los fallidos sin repetir los confirmados.

Cada archivo sigue enviándose al mismo endpoint autenticado y almacenándose en el bucket privado existente. El backend mantiene sus validaciones de tipo, tamaño, entidad y permisos. Una cancelación, una falla de red o un error de servidor pueden ocurrir cuando el archivo ya empezó a procesarse. Estos casos se marcan con estado incierto y se bloquea su reintento desde el lote: primero hay que comprobar el expediente para evitar duplicados.

La carga todavía no se reanuda tras cerrar la pestaña o perder conexión. Para archivos mayores o reanudación real se necesita un protocolo de carga por partes con confirmación e idempotencia del lado del servidor; este incremento no simula esa capacidad.

## Historial de versiones preparado

Cada nueva versión conserva el archivo anterior como evidencia inmutable con su ID y descarga autorizada. La lista muestra la versión vigente y permite desplegar y descargar las anteriores. Una revisión solo se crea sobre el último archivo de la cadena, exige los permisos de la entidad y usa una ruta privada nueva; no sobrescribe el objeto anterior. El índice único de `20261112040000_evidence_file_versions.sql` impide bifurcaciones simultáneas en la base de datos. Ante un conflicto se retira el objeto recién cargado. Los registros antiguos se interpretan como versión 1 sin alterarlos.

La función queda apagada hasta aplicar esa migración al proyecto correcto y validar con dos cuentas: `VERA_EVIDENCE_VERSIONS_ENABLED=true` en backend y `VITE_VERA_EVIDENCE_VERSIONS_ENABLED=true` en frontend. Mientras estén apagadas, la carga y las evidencias actuales se comportan como antes. Esta versión conserva el límite actual de 3 MB y no reanuda cargas interrumpidas.

## Carga reanudable preparada

Una segunda vía optativa divide cada archivo de hasta 3 MB en partes de 256 KiB. El backend autentica a la persona, comprueba rol y alcance de la entidad al iniciar, subir cada parte y cerrar. Cada parte confirmada queda en el bucket privado y se identifica por sesión y número; si se interrumpe la conexión, al volver a seleccionar el mismo archivo y entidad desde el mismo navegador se consultan las partes ya confirmadas y solo se envían las restantes. Se conserva la sesión por 24 horas. El cierre reúne las partes, verifica la huella SHA-256 y la firma del tipo de archivo, crea el objeto final y un único registro de evidencia. Repetir el cierre devuelve el mismo registro; una respuesta perdida no duplica el archivo. Tras confirmar, se retiran las partes temporales. La clave de servidor nunca llega al navegador.

La migración `20261112050000_resumable_evidence_uploads.sql` crea sesiones privadas y un índice único por operación. No está aplicada a Production. Para activar, verificar primero el proyecto Supabase y la migración, configurar `VERA_RESUMABLE_STORE=supabase` y `VERA_RESUMABLE_UPLOADS_ENABLED=true` en backend, y después `VITE_VERA_RESUMABLE_UPLOADS_ENABLED=true` en frontend. Programar `GET /api/evidence/uploads/cleanup` con `Authorization: Bearer CRON_SECRET` cada día para retirar partes de sesiones expiradas. La ruta está preparada, pero el cron no está configurado mientras la activación siga pendiente. Validar con corte de red, reanudación tras recarga, cambio de rol, pérdida de respuesta del cierre, dos cuentas y descarga final antes de habilitarla para todas las personas.

El botón «Detener lote» pausa las cargas; no borra las partes ya confirmadas. El historial de versiones usa la vía de carga habitual hasta que ambos incrementos se validen juntos. El límite de 3 MB sigue vigente; la mejora se enfoca en redes inestables, no en archivos grandes.
