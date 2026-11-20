# Datos y Supabase

VERA tiene seis modos de almacén. La plantilla [`.env.example`](https://github.com/VERA-GRC-IRM/VERA/blob/main/.env.example) usa `memory` por defecto para la demo. Los modos `supabase` requieren esquema, secretos del backend, dependencias entre dominios y una verificación en el entorno correspondiente. [`storeModes.js`](https://github.com/VERA-GRC-IRM/VERA/blob/main/backend/config/storeModes.js) rechaza combinaciones incompletas.

| Variable | Dominio | Dependencia al activar Supabase |
| --- | --- | --- |
| `VERA_USER_STORE` | Cuentas y login | Migraciones y configuración de usuarios. |
| `VERA_PLANNING_STORE` | Propuestas y auditorías | Migraciones de planificación. |
| `VERA_RISK_CONTROL_STORE` | Riesgos, controles y hallazgos | Usuarios **y** planificación persistentes. |
| `VERA_EVIDENCE_COMMENT_STORE` | Evidencias y comentarios | Usuarios, planificación, riesgos y controles persistentes. |
| `VERA_NOTIFICATION_STORE` | Marcas de lectura | Usuarios y planificación persistentes. |
| `VERA_AUDIT_STORE` | Bitácora general | Los demás almacenes persistentes requeridos por la validación. |

## Migraciones y archivos

Las [migraciones versionadas](https://github.com/VERA-GRC-IRM/VERA/tree/main/supabase/migrations) definen esquema y políticas de acceso. La guía de [activación de Supabase](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/supabase-planning.md) documenta orden, conciliación con datos existentes y verificaciones. La décima migración crea el bucket privado de evidencia; la undécima agrega lecturas de notificaciones.

El despliegue mantiene el flujo actual de hasta 3 MiB por archivo (PDF, Office, CSV, TXT e imágenes admitidas). Hay una ruta TUS opcional preparada para hasta 200 MiB, apagada por defecto y pendiente de comprobar el límite global del proyecto, el límite de 200 MiB del bucket `vera-evidence`, CORS, plan y una carga real. El backend comprueba acceso a la entidad antes de emitir autorización y antes de confirmar metadatos. IA y uso sin conexión siguen limitados a 3 MiB. Metadatos en `memory` pueden perderse al reiniciar aunque el objeto permanezca en Storage; por eso la configuración de ambos lados debe verificarse junta.

## Qué prueba la persistencia real

1. Anota el entorno y el SHA publicado, sin copiar claves.
2. Crea un registro sintético autorizado; conserva su ID y estado.
3. Reinicia o redespliega el backend y consulta con la misma cuenta y otra cuenta con distinto permiso.
4. Confirma el mismo ID/estado, la negativa de acceso ajeno y los eventos esperados. Registra fecha, resultado y limitaciones.

Una suite con adaptadores simulados, una migración aplicada o un despliegue `READY` no completan esos pasos. El [runbook operativo](https://github.com/VERA-GRC-IRM/VERA/blob/main/docs/testing/operations-runbook.md) conserva la secuencia de comprobación.
