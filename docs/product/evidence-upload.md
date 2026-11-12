# Carga de evidencias

La vista de evidencias acepta selección o arrastre de PDF, Word, Excel, CSV, TXT e imágenes compatibles de hasta 3 MB. Muestra el nombre y tamaño antes de enviar. Durante la carga presenta el porcentaje transmitido y permite detener la solicitud; el 100% solo aparece cuando el servidor confirma la creación del registro.

El archivo sigue enviándose al mismo endpoint autenticado y almacenándose en el bucket privado existente. El backend mantiene sus validaciones de tipo, tamaño, entidad y permisos. Cancelar una petición puede ocurrir cuando el servidor ya empezó a procesarla; en ese caso conviene actualizar el expediente antes de reintentar para evitar duplicados.

La carga todavía no se reanuda tras cerrar la pestaña o perder conexión. Para archivos mayores o reanudación real se necesita un protocolo de carga por partes con confirmación e idempotencia del lado del servidor; este incremento no simula esa capacidad.
