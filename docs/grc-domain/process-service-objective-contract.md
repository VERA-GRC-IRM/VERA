# Contrato propuesto: procesos, servicios y objetivos

**Estado:** diseño de dominio para #252. No hay esquema, API ni pantalla implementados por este documento. No representa el organigrama, la taxonomía ni las decisiones de FEMSA.

## Qué problema resuelve

El directorio actual identifica grupos, entidades jurídicas, unidades de negocio y sitios. Un proceso, un servicio y un objetivo son conceptos distintos: pueden atravesar varias unidades, cambiar de responsable y tener vigencia propia. Guardarlos como texto en `area` o duplicarlos dentro de cada empresa impediría seguir su historia y produciría permisos ambiguos. Este contrato separa su identidad de los vínculos organizativos y prepara los incrementos posteriores sin tocar expedientes anteriores.

## Vocabulario y límites

| Concepto | Identidad propuesta | Relación principal | No equivale a |
| --- | --- | --- | --- |
| Proceso | Actividad estable con propósito, entrada y resultado descritos | Puede servir a varias unidades y servicios | Entidad jurídica, departamento o registro de auditoría |
| Servicio | Capacidad entregada a una persona, área o sistema consumidor | Puede depender de varios procesos y estar vigente en varias unidades | Proceso, aplicación o proveedor por defecto |
| Objetivo | Resultado de negocio expresado con horizonte y responsable | Puede vincularse con varias unidades, procesos o servicios | KPI alcanzado, control efectivo o aceptación de riesgo |
| Vínculo organizativo | Asociación con vigencia entre uno de los tres conceptos y una unidad existente | Muchos a muchos, con procedencia y actor | Concesión de acceso a una cuenta |

Una categoría de riesgo de la biblioteca sigue siendo una plantilla; un riesgo concreto conserva su expediente y su `orgUnitId`. Ningún nombre de proceso, servicio u objetivo concede acceso a riesgos por coincidencia textual. Un vínculo nuevo no cambia automáticamente el ámbito de auditorías, controles, hallazgos o evidencias existentes.

## Identidad, versiones y vigencia

El siguiente incremento de esquema debe conservar, como mínimo, estos datos sin fijar todavía una fuente corporativa:

| Familia | Campos y regla |
| --- | --- |
| Registro principal | ID estable, código único dentro de su tipo, nombre, descripción, estado de ciclo de vida, fecha de inicio, fecha de fin opcional, referencia externa opcional, creador y fechas de creación/modificación. El código no es una clave de autorización. |
| Revisión | Número o ID de versión, actor, fecha y motivo. Una edición conserva la versión anterior para explicar qué definición regía una decisión histórica. |
| Titularidad | Referencia a una cuenta o responsable de negocio y periodo de vigencia. Ser propietario no implica permiso `VIEW` ni `MANAGE` por sí solo. |
| Vínculo con unidad | ID del concepto, `orgUnitId` existente, inicio y fin opcional, origen de la relación, actor y motivo. Para la misma pareja concepto–unidad no debe haber periodos activos solapados. |
| Relación funcional | Proceso–servicio y objetivo–proceso/servicio como asociaciones explícitas, con vigencia. No se deducen de nombres, jerarquía organizativa ni `area`. |

Las fechas de vigencia forman intervalos desde el inicio inclusive hasta el fin exclusivo. El fin vacío significa vigencia sin fecha de cierre conocida, no permanencia garantizada. Las consultas históricas deben indicar el instante evaluado. Retirar una relación impide nuevas asociaciones basadas en ella, pero no borra la referencia ni reescribe la evidencia anterior.

No se asigna de forma implícita un objetivo medible, umbral, moneda, porcentaje o algoritmo de cumplimiento. Si un objetivo incorpora una métrica después, el valor, unidad, periodo, fuente, método de agregación y estado de validación deben quedar explícitos; la ausencia de medición se muestra como «sin medición», nunca como cero o cumplido.

## Acceso y proyección compartida

1. La futura API comprueba sesión, rol funcional y concesión vigente del `orgUnitId` en el servidor, por cada operación. La vista React no autoriza registros.
2. Un proceso compartido puede tener vínculos con las unidades A y B sin duplicar su ID. Una persona con `VIEW` solo en A obtiene la parte autorizada de A; no recibe identificadores, nombres, conteos ni relaciones de B. Con `MANAGE` solo en A tampoco puede modificar el vínculo de B.
3. Una concesión sobre un grupo no se hereda a sus descendientes mientras #247 mantenga permisos directos. Revocar una concesión afecta la siguiente lectura/escritura; no se confía en un permiso copiado al token.
4. Las relaciones proceso–servicio y objetivo–proceso se proyectan solo cuando **ambos extremos y el vínculo concreto** son visibles. La búsqueda, exportación, dashboard y contexto de IA deben usar la misma proyección, sin consultas globales alternativas.
5. La cuenta propietaria no adquiere acceso automáticamente por aparecer en un campo. El directorio de personas y la pertenencia empresarial siguen sujetos a la decisión abierta en el [inventario de superficies](scope-surface-inventory.md).
6. Un registro sin vínculo organizativo queda en borrador administrativo y no aparece en vistas operativas por empresa hasta contar con una política aprobada. No se asigna a una unidad por texto libre.

Estas son invariantes de diseño. Antes de implementarlas, #247 debe cerrar sus superficies de lectura/escritura y el equipo debe acordar quién puede publicar o cambiar definiciones compartidas. En particular, `SUPER_ADMIN` como rol técnico no sustituye al aprobador de negocio de una taxonomía oficial.

## Persistencia y compatibilidad

- Añadir tablas y relaciones privadas con migraciones versionadas y RLS, sin modificar ni precargar `vera_org_units`, propuestas o riesgos existentes. Las asociaciones deben referenciar IDs estables, no nombres. La API de servidor conserva la autorización por registro.
- Implementar el mismo contrato en `memory` y Supabase; si falla Supabase, responder error de almacenamiento. No crear un resultado temporal que aparente persistencia.
- Para cambios relacionados entre varias tablas, definir una operación transaccional o un plan con estados recuperables y versiones optimistas. No publicar un vínculo parcialmente guardado como completo.
- Una asociación posterior con un expediente GRC debe guardar la revisión exacta y validar permisos de ambos extremos. Reabrir el catálogo no recalcula evaluaciones históricas ni cambia el `orgUnitId` del expediente.
- El retiro de una unidad con referencias requiere una política de ciclo de vida; no usar borrado en cascada para perder historia.

## Escenario neutral de aceptación futura

Crear en un entorno aislado dos unidades sintéticas A y B y un proceso P, un servicio S y un objetivo O, cada uno con un vínculo vigente a ambas unidades. Asociar S a P y O a S, registrando versiones y fechas. Una cuenta con `VIEW` solo en A ve P/S/O únicamente en el contexto de A; no ve el nombre de B, ni por URL directa, búsqueda, conteo, exportación o IA. Una cuenta con `MANAGE` solo en B puede actualizar el vínculo de B, pero no el de A. Revocar B elimina ese acceso en la siguiente solicitud. Cambiar la definición de P conserva la revisión anterior para una consulta histórica. Reiniciar la aplicación y repetir las lecturas debe devolver los mismos IDs y fechas desde Supabase.

Las pruebas locales con adaptadores simulados comprueban el contrato de código; la aceptación desplegada exige cuentas autenticadas, dos unidades persistidas y evidencia de reinicio. No usar este escenario como afirmación de aislamiento ya alcanzado.

## Decisiones necesarias antes de activar datos corporativos

| Decisión | Estado |
| --- | --- |
| Fuente maestra y códigos oficiales para procesos, servicios, objetivos y unidades | Pendiente; no precargar FEMSA |
| Responsable de aprobar definiciones, versiones, titularidad y retiro | Pendiente |
| Reglas para procesos compartidos y visibilidad de su identidad entre empresas | Pendiente; aplicar proyección mínima mientras se define |
| Vigencia y jerarquía de procesos, y tratamiento de fusiones o divisiones | Pendiente; no reescribir historia |
| Qué objetivos llevan métricas y cómo se calcula su estado | Pendiente; no inventar KPI ni cumplimiento |
| Política para asignar expedientes GRC ya existentes a procesos y objetivos | Pendiente; depende del procedimiento controlado de #247 |

**Orden de implementación:** contrato (este documento) → esquema y adaptadores aditivos → API privada y permisos por vínculo → interfaz y navegación → pruebas de dos entidades y aceptación persistente. Cada paso requiere su propio PR revisable. La dependencia [#252](https://github.com/VERA-GRC-IRM/VERA/issues/252) permanece abierta hasta completar esa secuencia.
