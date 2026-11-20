# Formularios, evidencia y vistas de trabajo

## Campos obligatorios

Los formularios muestran un asterisco junto a las etiquetas que contienen campos HTML `required` y una nota breve en la cuadrícula del formulario. La validación original del navegador y del servidor sigue siendo la fuente de aceptación; el marcador visual no sustituye ninguna regla.

## Expediente y Evidencias

El resumen y el mapa de relaciones del expediente se presentan juntos en la pestaña «Expediente». Los contadores de relaciones siguen abriendo Riesgos, Controles, Hallazgos o Evidencias. Las tarjetas de Evidencias comparten radio, espaciado, color y jerarquía visual con las tarjetas de Riesgos y Controles; no cambia la asociación, descarga o autorización de archivos.

## Textos simplificados

Se compactan instrucciones repetidas en Sin conexión, Pendientes y el encabezado del Asistente. Se conservan los avisos necesarios sobre caducidad de copias locales, sincronización, permisos, revisión de acciones y envío de contexto a Azure OpenAI.

Las copias sin conexión continúan caducando a las 24 horas. Ningún cambio visual modifica la sincronización, el cifrado, la persistencia o los permisos existentes.

## Límites que no cambian en este bloque

El despliegue conserva el límite de 3 MiB por defecto. La implementación opcional de carga grande incorpora una vía directa TUS con selección dinámica de hasta 200 MiB, pero permanece apagada hasta confirmar límites del proyecto y del bucket, CORS, persistencia de sesiones y aceptación real. No se debe habilitar únicamente el indicador del frontend. Los archivos grandes tampoco se procesan con IA ni se almacenan en el espacio sin conexión.
