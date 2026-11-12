# Exportación a Excel

En **Buscar auditorías**, aplica los filtros y elige **Descargar Excel**. El archivo `.xlsx` contiene dos hojas: **Resumen** con el alcance, fecha, filtros e indicadores; y **Auditorías** con las mismas veinte columnas de la exportación CSV. Los números de horas se conservan como valores numéricos y los textos que podrían interpretarse como fórmulas se neutralizan.

La descarga usa la sesión de VERA y el mismo servicio de reporte que CSV, PDF y la vista previa. Solo incluye auditorías y relaciones visibles para esa cuenta. El servidor aplica los filtros de año, trimestre, unidad, estado y responsable antes de generar el archivo. No se almacena una copia pública ni se activa un trabajo en segundo plano.

El archivo se puede abrir en Excel o importar manualmente en Power BI Desktop. Una actualización automática en Power BI Service necesita un origen estable, identidad de servicio y autorización del tenant; esta descarga manual no proporciona por sí sola esa conexión.
