# Cargas de evidencias

## Comportamiento disponible por defecto

La sección Evidencias permite registrar referencias y cargar lotes de hasta 10 archivos privados PDF, Word, Excel, CSV, TXT o imágenes compatibles. El límite actual por archivo es 3 MiB. El servidor valida el tipo, el contenido, el tamaño, el registro relacionado y los permisos. La carga existente conserva su verificación SHA-256 completa y el expediente mantiene su flujo actual.

## Carga reanudable de archivos grandes

Se preparó una vía opcional de carga directa y reanudable mediante TUS para archivos mayores a 3 MiB y de hasta 200 MiB. El navegador transfiere el archivo directamente al bucket privado de Supabase, por bloques de 6 MiB, evitando enviar el archivo completo a una función de Vercel. Supabase recomienda TUS para archivos por encima de 6 MB y requiere el tamaño de bloque de 6 MiB en su ejemplo de integración. [Documentación oficial de cargas reanudables](https://supabase.com/docs/guides/storage/uploads/resumable-uploads). Vercel limita a 4.5 MB el cuerpo de una solicitud a una Function, por lo que esa vía no sirve para transportar estos archivos completos. [Límites oficiales de Vercel Functions](https://vercel.com/docs/functions/limitations).

La API autentica la sesión, comprueba el rol y el acceso al registro, valida los metadatos y emite una autorización temporal para una sola ruta privada. La clave secreta de Storage permanece en el servidor. Al terminar, el backend vuelve a comprobar que la cuenta está activa, valida el tamaño final, el MIME y la firma del contenido inicial, y crea el registro de evidencia y su vínculo de versión. El servidor limita las solicitudes de inicio, renovación y cierre. Supabase documenta una vigencia de dos horas para los tokens de carga firmados y hasta 24 horas para la URL TUS; la aplicación mantiene la sesión hasta 24 horas y solicita una autorización nueva al reanudar. La ruta de limpieza existente puede retirar objetos de sesiones expiradas. [Referencia TUS y autorizaciones firmadas](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).

La vía grande queda apagada hasta habilitar conjuntamente:

- Backend: `VERA_RESUMABLE_STORE=supabase`, `VERA_EVIDENCE_COMMENT_STORE=supabase`, `VERA_RESUMABLE_UPLOADS_ENABLED=true` y `VERA_LARGE_EVIDENCE_UPLOADS_ENABLED=true`.
- Frontend: `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VERA_RESUMABLE_UPLOADS_ENABLED=true` y `VITE_VERA_LARGE_EVIDENCE_UPLOADS_ENABLED=true`.
- En Storage: límite global de al menos 200 MiB y límite del bucket `vera-evidence` fijado en 200 MiB, tipos admitidos y CORS compatibles con el dominio web. El límite del bucket evita que el token de carga de una sesión pueda almacenar un objeto mayor antes de la validación final del backend.
- Antes de activarla: revisar que el plan permita ese tamaño, validar que el proyecto Storage tenga las actualizaciones de seguridad vigentes, y completar una aceptación desde un navegador real, incluyendo reanudación tras desconexión, expiración, permisos revocados, descarga y limpieza.

Los límites globales y por bucket son independientes: el límite del bucket no puede superar el global. La documentación de Supabase indica que Free limita el global a 50 MB; Pro y superiores permiten configurarlo hasta 500 GB. No se cambió ningún plan ni configuración del proyecto remoto. [Límites oficiales de Storage](https://supabase.com/docs/guides/storage/uploads/file-limits).

La implementación reutiliza la tabla de sesiones creada por `20261112050000_resumable_evidence_uploads.sql`; no incorpora otra migración. La bandera de backend requiere almacenamiento persistente incluso fuera de Production, porque una sesión mantenida solo en memoria no es fiable entre funciones o instancias. Mantener las banderas apagadas conserva el comportamiento actual de 3 MiB. El frontend necesita `VITE_VERA_LARGE_EVIDENCE_UPLOADS_ENABLED=true`, `VITE_VERA_RESUMABLE_UPLOADS_ENABLED=true` y la clave pública de Supabase para llamar al servicio Storage; la clave secreta nunca se incluye en variables `VITE_`.

## Límites funcionales de archivos grandes

Los archivos mayores a 3 MiB se almacenan y descargan como evidencia. La lectura e indexación de contenido con IA, búsqueda textual del contenido y el espacio sin conexión siguen limitados a 3 MiB; la interfaz lo señala y no ofrece la acción de consultar con IA para un archivo grande. La vista deriva ese estado del tamaño del archivo; no modifica la tabla de cobertura ni requiere una migración nueva. Este incremento no amplía OCR, extracción documental ni almacenamiento offline.

La vía TUS verifica la posición y finalización de la carga con el protocolo; al cierre el servidor valida el tamaño final, el MIME declarado por Storage y la firma del prefijo de hasta 64 KiB. A diferencia del flujo anterior, no calcula una huella SHA-256 del archivo completo en servidor, para evitar volver a transportar hasta 200 MiB por una Function. Por tanto, la carga grande no se debe anunciar como aceptación de integridad criptográfica de extremo a extremo. La vía existente de hasta 3 MiB sí mantiene su validación SHA-256 completa.

## Aceptación aún pendiente

El código y la interfaz están preparados, pero la función permanece desactivada y no está aceptada en Production. La prueba pendiente requiere confirmar el límite del proyecto, CORS, funcionamiento TUS real, reanudación en el mismo navegador, cierre idempotente, permisos por rol, descarga, costos de almacenamiento/egress y limpieza de sesiones. Una corrida automática o una compilación local no demuestra esos puntos.
