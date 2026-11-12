# Exportación a Excel

En **Buscar auditorías**, aplica los filtros y elige **Descargar Excel**. El archivo `.xlsx` contiene dos hojas: **Resumen** con el alcance, fecha, filtros e indicadores; y **Auditorías** con las mismas veinte columnas de la exportación CSV. Los números de horas se conservan como valores numéricos y los textos que podrían interpretarse como fórmulas se neutralizan.

La descarga usa la sesión de VERA y el mismo servicio de reporte que CSV, PDF y la vista previa. Solo incluye auditorías y relaciones visibles para esa cuenta. El servidor aplica los filtros de año, trimestre, unidad, estado y responsable antes de generar el archivo. No se almacena una copia pública ni se activa un trabajo en segundo plano.

El archivo se puede abrir en Excel o importar manualmente en Power BI Desktop. Una actualización automática en Power BI Service necesita un origen estable, identidad de servicio y autorización del tenant; esta descarga manual no proporciona por sí sola esa conexión.

## Modelo para Power BI

El libro también incluye cinco tablas estructuradas: `VERA_Audits`, `VERA_Risks`, `VERA_Controls`, `VERA_Findings` y `VERA_Evidence`. En Power BI Desktop, usa **Obtener datos → Excel** e importa estas tablas. Relaciona `VERA_Audits[audit_id]` con el campo `audit_id` de cada tabla secundaria; la cardinalidad es uno a muchos en cada relación. Cada fila secundaria describe la relación de un registro visible con una auditoría visible, por lo que un mismo riesgo puede aparecer bajo más de una auditoría. Las horas están como números y los datos faltantes quedan vacíos; no se inventan cero horas.

Este archivo es una instantánea del alcance autorizado al descargarlo. Compartirlo o publicarlo en Power BI exige controlar el acceso al destino por separado; los permisos de VERA no viajan dentro del libro. La actualización automática y la publicación de un informe corporativo requieren la identidad, el espacio de trabajo y las reglas del tenant de Microsoft que el equipo aún no ha proporcionado. No debe programarse una consulta con credenciales personales ni colocar un token de VERA en Power Query.
