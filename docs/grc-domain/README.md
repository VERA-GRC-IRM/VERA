# Programa de dominio GRC/IRM empresarial

Este programa amplía el alcance de negocio de VERA sin atribuirle una certificación ni una metodología corporativa todavía no aprobada. Es una secuencia de contratos, datos, permisos y pruebas. Cada incremento debe preservar los registros y flujos actuales.

La [ruta de entregas visibles para usuarios](user-visible-roadmap.md) organiza las fases y los PR alrededor de decisiones y expedientes que podrán utilizarse en VERA.

## Punto de partida comprobado

- VERA registra propuestas, auditorías, riesgos, controles, hallazgos, evidencias, acciones y comentarios. Hay rutas de conversación que usan estos servicios. El estado de aceptación desplegada se sigue por separado en [#226](https://github.com/VERA-GRC-IRM/VERA/issues/226).
- `backend/services/riskEvaluationService.js` acepta probabilidad e impacto enteros de 1 a 3. `backend/config/riskRules.js` clasifica el producto en Bajo, Medio o Alto. `backend/services/controlEvaluationService.js` clasifica eficacia 1 a 5 como efectiva desde 4.
- El área de un riesgo es texto; no equivale a una entidad jurídica, unidad operativa o proceso con identidad y permisos propios. Los registros actuales no contienen una metodología versionada de riesgo inherente, residual y objetivo.
- Las [brechas funcionales ya identificadas](https://github.com/VERA-GRC-IRM/VERA/issues/168) y la aceptación de producción siguen abiertas. Este programa no las cierra por asociación.

## Modelo objetivo y dependencias

1. **Ámbito empresarial:** entidad jurídica, unidad de negocio, ubicación, proceso y objetivo son tipos distintos. Cada registro de riesgo, control, auditoría y obligación tendrá un ámbito explícito; la vista consolidada solo agrega ámbitos autorizados. No se cargarán entidades reales de FEMSA sin una fuente aprobada.
2. **Biblioteca y caso concreto:** una plantilla de riesgo define escenario, categoría, causas y consecuencias; un riesgo registrado pertenece a un ámbito, tiene responsable, decisiones y evaluaciones propias. Actualizar la biblioteca nunca modifica silenciosamente casos históricos.
3. **Metodología versionada:** cada evaluación conserva identificador y versión del método, factores, justificación, autor, fecha y alcance. Los registros actuales conservan su interpretación de escala 1–3. Una metodología nueva no recalcula retroactivamente resultados.
4. **Evaluaciones separadas:** inherente antes de controles, residual tras considerar controles y objetivo después del tratamiento planificado. No se deduce el residual restando mecánicamente una calificación de control; la decisión requiere factores, evidencia y revisión.
5. **Gobierno:** apetito y tolerancia por categoría y ámbito, decisión de respuesta, excepción aprobada, indicadores, controles probados, evidencia y seguimiento. Los paneles y la IA consumen resultados verificables y muestran metodología, cobertura y límites.
6. **Obligaciones y aseguramiento:** un requisito externo o interno tiene fuente, edición, vigencia, jurisdicción y aplicabilidad. Se relaciona con controles, evidencia, evaluaciones y auditorías; una relación no demuestra conformidad. Los catálogos protegidos por licencia requieren autorización de uso.

```text
Ámbito y objetivo → Escenario de biblioteca → Riesgo concreto → Evaluaciones versionadas
       ↓                                  ↓                 ↓
 Obligación aplicable                 Controles ← Pruebas y evidencia
       ↓                                  ↓                 ↓
 Plan de auditoría → Trabajo y hallazgos → Acciones → Revisión → Informe
```

## Orden de entrega

El [directorio de ámbitos empresariales](org-directory.md) es el primer incremento del tramo 1. La API admite ámbitos explícitos para propuestas nuevas y los hereda en riesgos y controles relacionados; todavía no reasigna expedientes existentes ni representa una estructura corporativa aprobada.

Las [autorizaciones directas por ámbito](org-grants.md) registran concesiones y revocaciones con motivo. Ya filtran las superficies enumeradas en el [inventario de rutas](scope-surface-inventory.md), pero todavía no incluyen reasignación controlada de expedientes existentes ni demuestran aislamiento multiempresa completo.

La [línea base de metodología](risk-methods.md) identifica la matriz histórica y evita llamar “residual” a una evaluación que no lo especifica.

La [biblioteca de riesgos](risk-library.md) introduce categorías y plantillas publicadas con historial inmutable. Aún no reclasifica los riesgos registrados.

El [contrato de procesos, servicios y objetivos](process-service-objective-contract.md) define identidades y vínculos muchos a muchos con unidades, vigencia, versiones y límites de acceso. El [primer mapa del negocio](business-context.md) añade registro y consulta de la revisión inicial; las relaciones entre conceptos, el historial de cambios y la carga corporativa siguen pendientes.

| Tramo | Primer resultado verificable | Dependencia |
| --- | --- | --- |
| 0. Contrato | Glosario, invariantes, decisiones pendientes y casos sintéticos | Ninguna |
| 1. Ámbito | Directorio de entidades/unidades, estructura, acceso y migración compatible | 0 |
| 2. Biblioteca | Taxonomía y plantillas versionadas; riesgos existentes intactos | 1 |
| 3. Evaluación | Motor versionado, inherente/residual/objetivo, pruebas de cálculo y explicación | 1–2 |
| 4. Gobierno | Apetito, tolerancia, KRIs, respuestas y excepciones | 3 |
| 5. Aseguramiento | Biblioteca de controles, pruebas, obligaciones aplicables y trazabilidad | 1–4 |
| 6. Auditoría | Universo auditable, plan basado en riesgo, papeles de trabajo y seguimiento | 1–5 |
| 7. Extensiones | Terceros, continuidad, eventos/pérdidas, privacidad y cambio regulatorio | Núcleo estable y prioridad aprobada |

Cada tramo se divide en PR pequeños de esquema/adaptador, servicio/API/permisos, interfaz, pruebas y documentación cuando corresponda. Un PR de esquema no activa por sí solo una función pública. La arquitectura debe permitir introducir tipos nuevos sin crear un almacén y una política de permisos distintos por cada módulo.

## Criterio de aceptación de cada capacidad

- El requisito y su responsable de negocio están identificados; se documentan supuestos pendientes en vez de tratarlos como política de FEMSA.
- La API valida ámbito, rol, registro, estado y versión en el servidor. Una vista global no lee un ámbito no autorizado.
- Migración y adaptadores `memory`/Supabase conservan datos anteriores y fallan claramente si la persistencia no está disponible.
- Cálculos y transformaciones tienen ejemplos reproducibles, límites, unidades, precisión y pruebas de propiedades. El histórico retiene el método usado.
- El expediente muestra fuente, actor, fecha, evidencia, cambios y decisiones; una recomendación de IA no se convierte en aprobación automática.
- Se distingue revisión local, CI y aceptación autenticada en producción.

## Fuentes de diseño, no sellos de conformidad

- [ISO 31000](https://www.iso.org/standard/31000): principios y proceso de gestión del riesgo.
- [COSO ERM](https://www.coso.org/enterprise-risk-management): integración con estrategia y desempeño.
- [NIST SP 800-30](https://csrc.nist.gov/pubs/sp/800/30/r1/final): evaluación y explicitación de incertidumbre.
- [IIA Global Internal Audit Standards](https://www.theiia.org/en/standards/2024-standards/global-internal-audit-standards/): práctica profesional de auditoría interna.
- [NIST OSCAL](https://pages.nist.gov/OSCAL/learn/concepts/layer/control/): catálogos, perfiles y relaciones legibles por máquina.
- [Open FAIR](https://www.opengroup.org/open-fair): opción cuantitativa futura cuando existan datos suficientes de frecuencia y pérdida.

Un marco puede servir como referencia de diseño sin que VERA, FEMSA o una auditoría concreta estén certificados o sean conformes. La aplicabilidad de leyes, normas y ediciones requiere revisión de los responsables jurídicos y de cumplimiento.
