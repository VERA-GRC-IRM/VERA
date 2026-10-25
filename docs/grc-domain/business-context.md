# Mapa del negocio: procesos, servicios y objetivos

El primer incremento de [#252](https://github.com/VERA-GRC-IRM/VERA/issues/252) añade `/mapa-negocio`. Personas con sesión pueden consultar los procesos, servicios y objetivos vinculados a sus unidades disponibles. Cada ficha muestra código, definición, unidades visibles, periodo, fuente y revisión. La búsqueda filtra código, nombre y descripción. Un `SUPER_ADMIN` puede registrar ámbitos organizativos mediante la API ya existente y publicar la primera revisión de cada concepto.

## Modelo y límites

- Un concepto tiene `contextId` estable, tipo `PROCESS`, `SERVICE` u `OBJECTIVE`, código único dentro del tipo, nombre, descripción y periodo de vigencia. La primera revisión es inmutable; el modelo permite añadir revisiones posteriores sin sobrescribir la anterior.
- Un concepto puede estar vinculado a varias unidades por sus IDs estables. La API comprueba que todas estén activas y disponibles para el actor. Al consultar, proyecta solo los IDs de unidades visibles para esa cuenta; si no hay ninguno, omite la ficha completa. Un nombre compartido no concede acceso a expedientes de otra unidad.
- Este incremento no añade aún relaciones proceso–servicio u objetivo–proceso, titulares de negocio, historial de cambios de definición ni vínculos a riesgos/auditorías. Esos pasos siguen en [#252](https://github.com/VERA-GRC-IRM/VERA/issues/252). Tampoco asigna expedientes históricos desde el texto libre `area`.
- No se precarga la estructura ni los objetivos de FEMSA. Publicar una ficha no declara que sea su catálogo oficial; la fuente maestra y el aprobador siguen pendientes de decisión empresarial.

## API y persistencia

- `GET /api/business-context`: sesión obligatoria; devuelve la última revisión registrada de cada concepto, proyectada por unidades visibles. Las fechas se muestran para que la persona interprete su vigencia; el servicio no oculta automáticamente fichas pasadas o futuras.
- `POST /api/business-context`: solo `SUPER_ADMIN`; valida tipo, código, descripción, fechas y de 1 a 20 unidades activas. Devuelve la revisión 1.
- `VERA_BUSINESS_CONTEXT_STORE=memory` conserva datos solo durante el proceso. Para persistencia, la migración `20261025010000_create_business_context.sql` crea la tabla privada `vera_business_context` sin insertar filas. Activar `supabase` requiere `VERA_ORG_STORE=supabase` y `VERA_USER_STORE=supabase`; el backend falla al iniciar si esa combinación es incompleta. No cambiar la variable antes de aplicar y verificar la migración en el proyecto de destino.
- Una reversión de código no elimina la tabla ni las filas. Las referencias de unidad se validan en la API y se guardan dentro de la revisión inmutable, siguiendo el almacenamiento documental que VERA ya usa para riesgos y controles. Cambiar ámbitos requerirá publicar una nueva revisión con motivo y periodo, conservando las anteriores; este incremento no admite mutaciones silenciosas.

## Aceptación pendiente

Con dos unidades sintéticas y una ficha vinculada a ambas, comprobar con cuentas `VIEW` separadas que cada una ve solo su unidad; una cuenta sin vínculo no ve ni ficha ni conteo. Confirmar que la ficha conserva ID y revisión después de redesplegar con Supabase, que duplicar el código se rechaza y que el catálogo vacío es comprensible. Las pruebas locales y CI no sustituyen esta aceptación desplegada.
