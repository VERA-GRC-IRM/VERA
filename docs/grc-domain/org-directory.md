# Primer incremento: directorio de ámbitos empresariales

`GET /api/org-units` y `POST /api/org-units` están reservados a `SUPER_ADMIN`. Solo registran una estructura vacía o sintética: **no asignan cuentas, riesgos, controles ni auditorías a una entidad**. El resto de VERA conserva sus permisos y el campo textual `area` hasta que otro incremento añada vínculos por registro y pruebe el alcance.

## Contrato actual

Cada unidad tiene `id`, `code` único, `name`, `kind`, `parentId`, `effectiveFrom`, `externalReference` opcional, `status`, actor y fecha de creación. Los tipos son `GROUP`, `LEGAL_ENTITY`, `BUSINESS_UNIT` y `SITE`. Un grupo es raíz; una entidad jurídica pertenece a un grupo o entidad jurídica; una unidad de negocio pertenece a una entidad jurídica u otra unidad; un sitio pertenece a una entidad jurídica o unidad. El padre debe existir y haber comenzado su vigencia. El directorio solo permite crear y consultar; mover, desactivar o borrar requiere una política de ciclo de vida y protección de referencias que no se presume aquí.

Ejemplo sintético de solicitud (no representa la estructura real de FEMSA):

```json
{
  "code": "EXAMPLE_GROUP",
  "name": "Grupo de ejemplo",
  "kind": "GROUP",
  "effectiveFrom": "2026-01-01"
}
```

No se carga ninguna entidad por defecto. `VERA_ORG_STORE=memory` mantiene el directorio local en memoria. Para persistir, primero aplique la migración `20261024010000_create_org_units.sql`, configure `VERA_USER_STORE=supabase` y `VERA_ORG_STORE=supabase` solo en el backend y compruebe el destino. La tabla tiene RLS y acceso únicamente mediante la API de servidor. La migración no altera las tablas GRC anteriores.

La prueba local con adaptador simulado no acredita persistencia remota. Antes de activar el modo Supabase en un despliegue, crear una unidad sintética autorizada, reiniciar, consultar el mismo ID y validar que perfiles distintos de Super Admin reciben 403. No usar nombres corporativos reales sin una fuente maestra validada.
