# Autorizaciones directas por ámbito

El directorio puede registrar autorizaciones `VIEW` o `MANAGE` para una cuenta activa y una unidad existente. Solo `SUPER_ADMIN` puede listarlas, concederlas o revocarlas; cada operación exige motivo y queda en la bitácora. La revocación conserva el registro histórico y permite conceder después una nueva autorización. Las autorizaciones son **directas**: aún no existe herencia automática hacia unidades descendientes.

Estas autorizaciones **todavía no gobiernan** las lecturas y escrituras de riesgos, controles, auditorías o evidencias. Esos módulos conservan sus reglas anteriores hasta que un PR de alcance aplique la comprobación de ámbito a cada ruta y servicio consumidor. No presente este incremento como aislamiento multiempresa terminado.

La migración `20261024020000_create_org_grants.sql` crea una tabla privada con referencias a `vera_org_units` y `vera_users`, una autorización activa máxima por pareja cuenta–unidad y actualización optimista. Aplíquela solo después de `20261024010000_create_org_units.sql`. Con `VERA_ORG_STORE=supabase`, tanto el directorio como sus autorizaciones usan Supabase; en `memory`, ambos son temporales. No se crean autorizaciones por defecto.
