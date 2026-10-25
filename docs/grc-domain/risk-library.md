# Biblioteca de categorías y escenarios de riesgo

La biblioteca separa una **plantilla reutilizable** de un riesgo registrado. Las categorías tienen código estable, nombre, descripción y padre opcional. Una plantilla publicada contiene categoría, título, escenario, causas, consecuencias y referencia opcional. Cada revisión es una fila nueva e inmutable: conserva autor, fecha, motivo y número. La vista principal muestra solo la revisión más reciente; el historial se puede consultar por ID.

La interfaz `/biblioteca-riesgos` permite a cualquier usuario autenticado consultar la estructura de categorías, buscar plantillas, filtrar por categoría y sus descendientes, revisar causas, consecuencias, fuente y versiones. Cuando no hay catálogo aprobado, muestra un estado vacío. Un `SUPER_ADMIN` puede abrir los formularios para crear categorías, publicar plantillas y publicar una nueva versión con comparación y confirmación; la API vuelve a comprobar el rol y valida el contenido. Desde una plantilla publicada, quien puede registrar riesgos puede abrir el formulario con el escenario propuesto. Esta página no cambia la metodología de evaluación.

No se precarga una taxonomía atribuida a FEMSA ni contenido de marcos sujeto a licencia. El responsable de riesgos debe aprobar nombres, niveles, categorías y fuentes antes de poblar la biblioteca real. Los ejemplos de pruebas son sintéticos.

## API y permisos

- `GET /api/risk-library` y `GET /api/risk-library/templates/:id/revisions`: requieren sesión. Devuelven categorías y plantillas publicadas, o todas las revisiones de una plantilla.
- `POST /api/risk-library/categories`: solo `SUPER_ADMIN`; crea categoría con código único. El padre, si se indica, debe ser una categoría existente.
- `POST /api/risk-library/templates`: solo `SUPER_ADMIN`; publica revisión 1. Exige categoría activa, título, escenario, al menos una causa y una consecuencia.
- `POST /api/risk-library/templates/:id/revisions`: solo `SUPER_ADMIN`; exige el contenido completo nuevo y motivo. Nunca reescribe la revisión anterior.

El código conserva categorías y revisiones de forma inmutable; no hay edición ni borrado. Al registrar un riesgo, el usuario puede seleccionar una versión publicada: el formulario propone el escenario como descripción y guarda una referencia con ID, revisión, título y categoría. El texto del riesgo sigue siendo editable y la evaluación conserva el método vigente. La revisión posterior de la plantilla no cambia el riesgo ni recalcula su puntuación. Los riesgos anteriores permanecen sin referencia; no se asigna ninguna por similitud de texto. La edición del riesgo no cambia su escenario de origen.

Si los riesgos usan Supabase, la vinculación requiere que la biblioteca use también Supabase. De otro modo, el backend rechaza la vinculación para evitar una referencia que desaparezca tras reiniciar el servidor. El registro manual sin plantilla permanece disponible.

## Persistencia y despliegue

`VERA_RISK_LIBRARY_STORE=memory` (valor por defecto) conserva el catálogo solo durante el proceso. La migración `20261024030000_create_risk_library.sql` agrega una tabla privada vacía, con RLS, referencias, revisión única y control de coherencia del documento. Tras conciliar el proyecto de destino y aplicar la migración, el backend puede usar `VERA_RISK_LIBRARY_STORE=supabase` con `VERA_USER_STORE=supabase`. No cambie esa variable antes de probar inserción, revisión, lectura tras reinicio y permisos con cuentas autorizadas. Un fallo de Supabase devuelve error: no hay reemplazo silencioso por memoria.

Una reversión de código no elimina el catálogo persistente. No ejecute `DROP TABLE` en un proyecto con datos sin inventario, exportación y aprobación de conservación.
