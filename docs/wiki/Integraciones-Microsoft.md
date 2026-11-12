# Excel, Power BI y Teams

VERA ofrece cuatro rutas de trabajo con herramientas Microsoft:

| Herramienta | Qué se puede hacer | Cómo se comprueba |
| --- | --- | --- |
| Excel | Descargar el portafolio filtrado; importar el catálogo del mapa del negocio con vista previa. | [Exportación #401](https://github.com/VERA-GRC-IRM/VERA/pull/401) e [importación #404](https://github.com/VERA-GRC-IRM/VERA/pull/404). |
| Power BI Desktop | Importar las cinco tablas analíticas del Excel de VERA. | [Modelo #402](https://github.com/VERA-GRC-IRM/VERA/pull/402). |
| Microsoft Teams | Compartir manualmente un enlace a un registro o vista. | [Botón #403](https://github.com/VERA-GRC-IRM/VERA/pull/403). |

El archivo Excel es una instantánea. Publicarlo en otro sistema requiere controlar allí los permisos; los enlaces compartidos por Teams tampoco conceden acceso a VERA.

La actualización automática en Power BI Service y los avisos dirigidos o una pestaña dentro de Teams necesitan un espacio de trabajo y autorizaciones del tenant Microsoft. Sus criterios están en [Power BI #405](https://github.com/VERA-GRC-IRM/VERA/issues/405) y [Teams #406](https://github.com/VERA-GRC-IRM/VERA/issues/406). No se anuncian como conexiones activas.

Por ahora se dispone de una cuenta Microsoft personal. Permite preparar un informe local con Power BI Desktop, pero Power BI Service exige una cuenta de trabajo o escuela. El envío mediante el diálogo web de Teams también necesita una cuenta Teams admitida y aún no se ha probado con el tenant del equipo.

Para columnas, pasos y límites de cada flujo, consulta la [guía completa de integraciones](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/product/microsoft-integrations.md).

La [sección de integraciones del portal de calidad](https://vera-grc-irm.github.io/VERA/#integraciones-microsoft) muestra la última demostración automática, su estado y el enlace a los libros y tiempos de la corrida. Su alcance es sintético; las activaciones corporativas siguen separadas.
