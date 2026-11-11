# Contratos de operación sin conexión

Este inventario describe lo que permite **el código actual**. No convierte operaciones en línea en operaciones offline ni aprueba cambios de negocio. Las copias son explícitas, cifradas por cuenta y origen, y caducan a las 24 horas; el servidor conserva la decisión final sobre permisos y versiones.

## Lectura y preparación

| Capacidad | Fuente y contrato actual | Sin red | Al reconectar |
| --- | --- | --- | --- |
| Portafolio, planificación, auditorías, riesgos, responsables, controles, hallazgos, planes, evidencias, pendientes e informe | `SNAPSHOT_MODULES` en `frontend/src/services/offlineSnapshots.js`; 11 respuestas `GET /api/...` autorizadas, con validación de lista, tamaño y vigencia | Consultar solo lo que se guardó previamente; el informe local puede filtrarse y exportarse como CSV o imprimirse | `captureOfflineSnapshots` vuelve a pedir cada sección con token y `cache: no-store`; un 403 retira esa sección y sus archivos asociados si corresponde |
| Archivo de evidencia ya registrado | `GET /api/evidence/:id/content`, `offlineEvidenceFiles.js`; selección expresa, autorización actual, límite por archivo y total | Descargar solo el archivo previamente cifrado y mientras la sección Evidencias siga vigente | Se vuelve a validar; un archivo retirado o no visible deja de estar disponible localmente |
| Respaldo portátil | `offlineVault.js`, esquema cifrado v1, misma cuenta y mismo origen | Exportar o importar el archivo con la frase local; no sustituye un espacio ya existente | Restaurar no modifica Supabase ni renueva la fecha original de las copias |

## Escrituras diferidas permitidas

| Borrador | Ruta al enviar | Control antes y durante el envío | Respuesta incierta |
| --- | --- | --- | --- |
| Avance o comentario de plan | `PATCH /api/actions/:id/progress`, `POST /api/actions/:id/comments` | Versión y permiso actuales; `Idempotency-Key` estable por borrador; el backend comprueba actor, versión y contenido | Queda en revisión; un reintento **explícito** usa la misma clave y contenido |
| Hallazgo desde control y riesgo | `POST /api/findings/` | Relación, evaluación, permiso y versión; título, descripción, causa raíz y severidad obligatorios; clave de operación estable | Queda en revisión; un reintento **explícito** usa la misma clave y contenido. Los borradores antiguos sin campos obligatorios permanecen legibles, sin botón de envío |
| Descripción de riesgo o control | `PATCH /api/risks/:id/offline-description`, `PATCH /api/controls/:id/offline-description` | Rol, ámbito, descripción original y versión del registro; un cambio simultáneo produce conflicto | No se repite automáticamente; se consulta el registro actual y se prepara otra edición si procede |
| Archivo de evidencia nuevo | `POST /api/evidence/upload` | Permiso, entidad, tipo, tamaño y archivo verificados en servidor | No hay replay seguro todavía: se revisa Evidencias manualmente antes de intentar otra carga. **La migración de idempotencia permanece aplazada por decisión del usuario.** |

Una nota general solo se guarda localmente. La lista de trabajo distingue **Para enviar**, **Revisar**, **Notas** y **Enviados**; el filtro no ejecuta operaciones.

## Operaciones deliberadamente en línea

Las propuestas y su aprobación, el inicio o cierre de auditoría, la evaluación de riesgos o controles, el cierre o validación de hallazgos, las reasignaciones y cambios de rol, el inicio de sesión y OAuth, y el asistente de Azure requieren conexión. Los endpoints existentes de esas operaciones no garantizan aquí una combinación de versión, clave de operación y resolución de conflictos apta para replay diferido. No se debe agregar un botón offline basándose solo en que la ruta acepte un `POST` o `PATCH`.

## Regla para ampliar esta matriz

Antes de admitir otra escritura diferida, verificar en el backend: autorización sobre el registro concreto, precondición de versión, clave única durable si la operación crea datos, igualdad de actor y contenido al repetirla, tratamiento de respuesta perdida y conflicto, y prueba contra los modos de almacenamiento aplicables. Después, agregar el formulario, un escenario sin red, uno de rechazo/colisión, la documentación y un ensayo de GitHub Actions. Para archivos binarios, comparar además el contenido y evitar duplicados en Storage; esa ampliación requiere la migración pendiente y una decisión posterior.

Las pruebas sintéticas no demuestran comportamiento de un despliegue real. La aceptación con cuentas y dispositivos reales se registra separadamente en el [piloto de producción](testing/offline-production-pilot.md).
