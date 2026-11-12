# Búsqueda de registros

La barra superior conserva la navegación por secciones y acciones. Al escribir al menos dos caracteres también consulta registros del servidor: auditorías, riesgos, controles, hallazgos vinculados a auditorías, evidencias y fichas del mapa del negocio. Los resultados muestran identificador, título y enlace; no envían descripciones completas ni información de otros ámbitos. La consulta se cancela si cambia el texto y se limita a 24 resultados por petición.

`GET /api/search?q=` exige sesión, valida 2–80 caracteres, limita la frecuencia y responde sin caché. Reutiliza las proyecciones de lectura por rol y ámbito de cada registro; una revocación se observa al volver a consultar. Los enlaces a hallazgos abren su auditoría vinculada. No es un índice externo ni un motor de búsqueda semántica. El buscador de IA y las búsquedas de cada módulo conservan su propósito.
