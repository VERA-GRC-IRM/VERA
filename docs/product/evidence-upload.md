# Carga de evidencias

La vista de evidencias acepta selección o arrastre de hasta 10 PDF, Word, Excel, CSV, TXT o imágenes compatibles de 3 MB cada uno. Muestra nombre, tamaño y estado individual. Los envía uno por uno al mismo registro relacionado, informa el avance del archivo actual y permite detener el lote. Cada archivo queda confirmado solo cuando responde el servidor; si alguno es rechazado, se pueden reintentar únicamente los fallidos sin repetir los confirmados.

Cada archivo sigue enviándose al mismo endpoint autenticado y almacenándose en el bucket privado existente. El backend mantiene sus validaciones de tipo, tamaño, entidad y permisos. Una cancelación, una falla de red o un error de servidor pueden ocurrir cuando el archivo ya empezó a procesarse. Estos casos se marcan con estado incierto y se bloquea su reintento desde el lote: primero hay que comprobar el expediente para evitar duplicados.

La carga todavía no se reanuda tras cerrar la pestaña o perder conexión. Para archivos mayores o reanudación real se necesita un protocolo de carga por partes con confirmación e idempotencia del lado del servidor; este incremento no simula esa capacidad.
