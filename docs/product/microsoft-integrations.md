# Integraciones con Excel, Power BI y Microsoft Teams

VERA separa el intercambio de archivos, la colaboración manual y las conexiones corporativas automáticas. Esa distinción evita que una descarga o un botón de compartir se presente como sincronización activa.

| Capacidad | Punto de entrada | Estado comprobable |
| --- | --- | --- |
| Excel, salida | Buscar auditorías → Descargar Excel | Libro `.xlsx` con datos filtrados y visibles para la cuenta; hojas de lectura y tablas analíticas. [Implementación #401](https://github.com/VERA-GRC-IRM/VERA/pull/401). |
| Excel, entrada | Mapa del negocio → Importar catálogo → plantilla Excel | Vista previa, confirmación, digest, resultado por fila y permiso `SUPER_ADMIN`. Solo procesos, servicios y objetivos; no es una importación general de auditorías o riesgos. [Implementación #404](https://github.com/VERA-GRC-IRM/VERA/pull/404). |
| Power BI Desktop | Obtener datos → Excel → tablas `VERA_*` | Modelo manual con cinco tablas y clave `audit_id`. Es una instantánea; sus permisos no se trasladan a Power BI. [Implementación #402](https://github.com/VERA-GRC-IRM/VERA/pull/402). |
| Teams, colaboración manual | Compartir enlace → Teams | La persona elige destinatario y confirma. Al abrir el enlace, VERA aplica los permisos de la cuenta receptora. [Implementación #403](https://github.com/VERA-GRC-IRM/VERA/pull/403). |
| Power BI Service, actualización automática | Espacio de trabajo de Microsoft | Pendiente de tenant, identidad de servicio, licencia, modelo de acceso y aceptación real. [Criterios #405](https://github.com/VERA-GRC-IRM/VERA/issues/405). |
| Teams, avisos dirigidos y pestaña | Aplicación aprobada en el tenant | Pendiente de destinatarios, consentimiento, permisos del tenant y pruebas. [Criterios #406](https://github.com/VERA-GRC-IRM/VERA/issues/406). |

## Ruta de uso hoy

1. En VERA, aplica los filtros y descarga Excel. El archivo contiene los datos que la API permite consultar a esa cuenta en ese momento. [Contrato y columnas](excel-export.md).
2. En Power BI Desktop, importa las tablas `VERA_Audits`, `VERA_Risks`, `VERA_Controls`, `VERA_Findings` y `VERA_Evidence`. Relaciona `VERA_Audits[audit_id]` con el campo `audit_id` de cada tabla secundaria. Verifica los conteos contra el resumen del mismo libro. Publicar el archivo requiere gestionar de nuevo los permisos del destino.
3. Para compartir una vista, usa Teams junto al botón de copiar enlace. Selecciona el chat o canal en la ventana de Microsoft y confirma. No se manda contenido del expediente ni se salta el inicio de sesión de VERA. [Alcance del botón](teams-share.md).
4. Para cargar un catálogo desde Excel, descarga la plantilla de **Mapa del negocio**, llena la hoja `Catalogo`, revisa la vista previa y publica solo si no hay conflictos. La operación no sobrescribe fichas existentes. [Reglas del catálogo](../grc-domain/business-context.md).

## Activación corporativa posterior

Un tablero con actualización programada necesita un espacio de trabajo Power BI y una identidad autorizada para una fuente de datos de alcance definido. No se debe pegar el JWT de una persona en Power Query ni publicar un libro con datos más amplios que el público previsto. La aceptación deberá demostrar actualización, control de acceso, errores visibles y concordancia de indicadores. [Tarea #405](https://github.com/VERA-GRC-IRM/VERA/issues/405).

En este momento solo hay acceso a una cuenta Microsoft personal. Power BI Desktop permite trabajar localmente con el libro; Power BI Service pide una cuenta de trabajo o escuela y un espacio autorizado. La cuenta personal no acredita la publicación corporativa.

Los avisos automáticos a Teams requieren relacionar la identidad VERA con el destinatario correcto. Un webhook de canal general no sirve para mensajes privados por usuario. Microsoft recomienda Teams Workflows para webhooks; los antiguos conectores Office 365 están retirados. La configuración debe tener propietario y copropietario, secreto fuera de Git y una prueba de entrega sin revelar expedientes. [Tarea #406](https://github.com/VERA-GRC-IRM/VERA/issues/406).

El diálogo **Compartir en Teams** de Microsoft está documentado para Edge y Chrome de escritorio con una cuenta Teams habilitada. Microsoft no admite en ese flujo cuentas gratuitas o invitadas; se debe ensayar con la cuenta del equipo antes de afirmar que el envío funciona.

**Evidencia:** los PR anteriores contienen pruebas locales y CI. No acreditan un informe publicado en Power BI Service, una app instalada en el Teams de FEMSA ni aceptación con cuentas corporativas.

Referencias de Microsoft: [importar Excel a Power BI](https://learn.microsoft.com/en-us/power-bi/connect-data/service-excel-workbook-files), [cuentas admitidas por Power BI Service](https://learn.microsoft.com/en-us/power-bi/fundamentals/service-self-service-signup-purchase-for-power-bi), [compartir desde una web a Teams](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/share-to-teams-from-web-apps) y [webhooks mediante Teams Workflows](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook).
