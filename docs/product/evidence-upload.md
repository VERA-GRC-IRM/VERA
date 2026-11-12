# Carga de evidencias

La vista de evidencias acepta selección o arrastre de hasta 10 PDF, Word, Excel, CSV, TXT o imágenes compatibles de 3 MB cada uno. Muestra nombre, tamaño y estado individual. Los envía uno por uno al mismo registro relacionado, informa el avance del archivo actual y permite detener el lote. Cada archivo queda confirmado solo cuando responde el servidor; si alguno es rechazado, se pueden reintentar únicamente los fallidos sin repetir los confirmados.

Cada archivo sigue enviándose al mismo endpoint autenticado y almacenándose en el bucket privado existente. El backend mantiene sus validaciones de tipo, tamaño, entidad y permisos. Una cancelación, una falla de red o un error de servidor pueden ocurrir cuando el archivo ya empezó a procesarse. Estos casos se marcan con estado incierto y se bloquea su reintento desde el lote: primero hay que comprobar el expediente para evitar duplicados.

La carga todavía no se reanuda tras cerrar la pestaña o perder conexión. Para archivos mayores o reanudación real se necesita un protocolo de carga por partes con confirmación e idempotencia del lado del servidor; este incremento no simula esa capacidad.

## Historial de versiones preparado

Cada nueva versión conserva el archivo anterior como evidencia inmutable con su ID y descarga autorizada. La lista muestra la versión vigente y permite desplegar y descargar las anteriores. Una revisión solo se crea sobre el último archivo de la cadena, exige los permisos de la entidad y usa una ruta privada nueva; no sobrescribe el objeto anterior. El índice único de `20261112040000_evidence_file_versions.sql` impide bifurcaciones simultáneas en la base de datos. Ante un conflicto se retira el objeto recién cargado. Los registros antiguos se interpretan como versión 1 sin alterarlos.

La función queda apagada hasta aplicar esa migración al proyecto correcto y validar con dos cuentas: `VERA_EVIDENCE_VERSIONS_ENABLED=true` en backend y `VITE_VERA_EVIDENCE_VERSIONS_ENABLED=true` en frontend. Mientras estén apagadas, la carga y las evidencias actuales se comportan como antes. Esta versión conserva el límite actual de 3 MB y no reanuda cargas interrumpidas.
