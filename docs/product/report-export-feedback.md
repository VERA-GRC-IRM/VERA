# Estado de reportes en la pantalla

Al consultar o descargar el reporte de auditorías, VERA muestra la operación activa y el tiempo transcurrido. «Cancelar» interrumpe la petición del navegador y libera los controles para volver a intentar. Los filtros siguen siendo los últimos aplicados y el backend vuelve a decidir qué filas puede leer cada cuenta.

El tiempo mostrado es el transcurrido de esa solicitud, no una estimación de finalización ni una medición del rendimiento del servidor. Si el servidor ya recibió la petición, la cancelación del navegador no garantiza que deje de procesarla. La operación no se guarda al cerrar la pestaña: un centro de trabajos duraderos requiere la infraestructura pendiente de la [issue #371](https://github.com/VERA-GRC-IRM/VERA/issues/371).
