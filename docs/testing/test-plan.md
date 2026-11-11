# Plan integral de pruebas de VERA

## Objetivo y alcance

Este plan convierte los 78 casos de prueba recibidos en un programa verificable. Distingue pruebas unitarias, de integración HTTP, de interfaz, de compatibilidad, de carga y verificaciones operativas. Un caso no se considera aprobado por existir en este catálogo: debe ejecutarse en el nivel indicado y conservar evidencia.

**Excepción vigente desde el 10 de noviembre de 2026:** la matriz automatizada de navegadores y accesibilidad está [diferida](browser-e2e-debt.md). Los casos permanecen planeados y el workflow Playwright se puede ejecutar manualmente; ningún PASS de CI actual los acredita.

La línea base del repositorio es un prototipo React/Vite y Express. La suite `node:test` incluye pruebas unitarias e integración HTTP para reglas de cuenta, autenticación, usuarios/roles, riesgos, controles, propuestas, notificaciones, historial, referencias de evidencias, carga pequeña de archivos y panel. Varias pruebas cubren solo APIs. Los datos de dominio usan memoria por defecto; los modos persistentes y el bucket privado requieren activación y verificación remota. Por eso la operación de producción no se puede declarar cubierta por pruebas simuladas.

## Secuencia propuesta de pull requests

Los PRs se preparan y se integran en este orden, uno a la vez, con base actualizada desde `main`:

| PR | Alcance | Entrega verificable |
|---|---|---|
| 1 | Catálogo, trazabilidad, criterios, datos ficticios y definición de niveles de prueba. | Este plan y matriz TC/RF/RNF revisada. |
| 2 | Registro y administración de usuarios, autenticación, sesión, bloqueo, contraseñas, 2FA y permisos. | Pruebas unitarias de reglas más pruebas HTTP negativas y positivas por rol. |
| 3 | Ciclo de auditoría, propuestas, riesgos, evaluaciones, controles, hallazgos y planes de acción. | Pruebas unitarias de reglas/transiciones y pruebas de integración de API. |
| 4 | Evidencias, notificaciones, historial, comentarios y trazabilidad. | Pruebas HTTP de alcance, validación y eventos; prueba de carga binaria solo si se implementa esa capacidad. |
| 5 | Panel, actividad reciente, filtros, búsquedas, reportes y exportaciones. | Pruebas de servicio/API y de interfaz para filtros, resultados vacíos y permisos. |
| 6 | Flujos web, navegadores, tamaños de pantalla, accesibilidad y usabilidad. | Playwright E2E automatizadas en Chromium, Chrome, Edge y Firefox; emulación de móvil/tablet, axe en login/panel y revisión manual de hardware real. |
| 7 | Concurrencia, rendimiento y controles operativos/de plataforma. | PR-7 prepara perfil k6 de 150/250 VUs y bitácora operativa; ejecución real de carga y evidencia manual/monitoreada dependen de staging y dueños de infraestructura. |

Cada PR debe incluir solo pruebas de comportamiento que correspondan a funciones existentes. Si el requisito depende de una función ausente, el caso queda como bloqueado/pending con el prerrequisito explícito; no se agrega una prueba que simule un resultado aún no ofrecido por VERA.

## Niveles de prueba

- **Unitarias:** reglas puras, validaciones, permisos y transiciones; rápidas, deterministas y sin red/servicios externos.
- **Integración API:** servidor Express con datos de prueba aislados; valida HTTP, autenticación, autorización, contratos y eventos.
- **E2E/UI:** navegación real por la aplicación, acciones y estados visibles. No sustituye las pruebas de API.
- **Compatibilidad/responsividad:** matriz de navegador y viewport; cualquier emulación se registra como emulación, no como dispositivo físico.
- **Carga/rendimiento:** ejecución en ambiente de pruebas aislado con datos y perfil de carga documentados. No ejecutar contra producción desde el CI de cada PR.
- **Operativas/manuales:** despliegue TLS, disponibilidad mensual, restauración de respaldos, escalamiento, revisión normativa y alineación IIA. Adjuntar fecha, ambiente, pasos, resultado y responsable de la verificación.

## Criterios de entrada

1. La funcionalidad objeto de prueba existe y está desplegada en el ambiente elegido.
2. Los requisitos y resultados esperados están acordados; los casos tienen precondiciones, pasos y datos ficticios.
3. El ambiente está disponible y aislado de usuarios/datos reales.
4. Las cuentas de prueba cubren roles y estados pertinentes; las credenciales/secrets no se guardan en Git.
5. La herramienta y versión, navegador/dispositivo, semilla y configuración están registradas para que la corrida sea repetible.

## Criterios de salida

1. Se ejecutaron los casos implementados y elegibles del alcance; los bloqueados se identifican con causa y dueño.
2. Se conservan resultados por caso, commit, ambiente, herramienta, fecha/hora, duración, fallos y evidencia relevante.
3. No quedan defectos críticos abiertos sin aceptación y seguimiento registrados.
4. Las correcciones tienen re-ejecución de caso y regresión relacionada.
5. La matriz TC/RF/RNF refleja el estado real, con vínculo a archivos de prueba o evidencia manual.

## Pisos automáticos de regresión

El control obligatorio `Quality gates (Node.js 22)` exige cobertura backend mínima de **90 % de líneas, 75 % de ramas y 90 % de funciones**. Los pisos se fijaron por debajo de la línea base de CI observada el 17 de octubre de 2026 (96.46 %, 82.58 % y 95.77 %, respectivamente) y de una ejecución local con Node 25 (94.41 %, 78.39 % y 94.43 %). La instrumentación produce cifras distintas entre versiones; se comparan tendencias del mismo runtime de CI. Si falta la medición, el control falla. Todo cambio debe conservar pruebas de los caminos afectados aunque supere los pisos globales; el frontend no tiene una métrica de cobertura equivalente en este reporte.

El mismo control ejecuta los 26 escenarios sintéticos de IA sin red ni llamadas a Azure. El workflow manual de evaluación conserva el informe detallado independiente. Ninguna de estas pruebas demuestra la calidad de las respuestas del modelo desplegado, la persistencia ni los permisos de producción.

## Prioridad y criterios no funcionales

La prioridad inicial respeta la evaluación de riesgo entregada: alta para autenticación/roles/permisos, ciclo de auditoría y estados/riesgos, además de concurrencia; media para evidencia/notificaciones, búsqueda/filtros/exportación y compatibilidad. Seguridad de acceso permanece alta aunque una pantalla particular esté clasificada como funcional.

Para concurrencia se recomienda ejecutar primero 150 usuarios simultáneos y luego una carga escalonada de 250 o más. El documento pide respuesta no mayor a 1.5 s; para evitar que un promedio oculte lentitud, el PR-7 debe acordar si el umbral se mide como p95, máximo u otra estadística, junto con tasa de error, duración, ramp-up y perfil de operaciones. No se presenta una meta de producción hasta tener ambiente representativo y una línea base.

La disponibilidad de 99.5% requiere una ventana de medición mensual; RTO de 4 horas se demuestra con simulacro de recuperación; respaldo diario requiere historial de jobs y restauración; crecimiento/escalamiento necesitan infraestructura configurada. WCAG AA requiere herramienta automática más revisión manual de teclado/lector; la herramienta por sí sola no certifica conformidad. Privacidad e IIA requieren revisión de responsables competentes y criterios normativos aplicables.

## Matriz de trazabilidad y estado de línea base

**Estado:** “Parcial” significa que el repositorio tiene pruebas relacionadas, pero no cubren todo el escenario de usuario/requisito. “Pendiente” significa que falta automatización/evidencia o no hay función implementada. “Bloqueado” significa que la prueba requiere una capacidad o ambiente que hoy no está disponible. El estado no es un resultado de ejecución.

| Caso | Requisito / escenario | Tipo principal | Prioridad | PR | Línea base |
|---|---|---|---|---:|---|
| TC-01 | RF-01: correo institucional duplicado | Unit/API | Alta | 2 | Cubierto por API: duplicado activo y dirección asociada a cuenta deshabilitada devuelve conflicto |
| TC-02 | RF-01: cuenta eliminada o bloqueada | API | Alta | 2 | Parcial: no permite reutilizar correo de una cuenta deshabilitada; política de re-registro tras rechazo por confirmar |
| TC-03 | RF-03: acceso correcto | API/E2E | Alta | 2 | Cubierto por API: token firmado, identidad/rol y sesión protegida; registro externo sustituido por test double |
| TC-04 | RF-03: credenciales inexistentes | API | Alta | 2 | Cubierto por API: respuesta 401 |
| TC-05 | RF-03: cuenta deshabilitada | API | Alta | 2 | Cubierto por API: respuesta 403 |
| TC-06 | RF-04: cinco intentos fallidos y bloqueo | Unit/API | Alta | 2 | Cubierto por API: quinto fallo bloquea, emite Retry-After y el bloqueo continúa |
| TC-07 | RF-09: actividad reciente tras crear auditoría | API/UI | Media | 5 | Bloqueado parcialmente: existen eventos en bitácora, pero no una sección de actividad reciente en el panel |
| TC-08 | RF-10: navegación del menú | E2E | Media | 6 | Parcial: navegación a Planificación comprobada con sesión sintética en navegador; faltan los demás destinos y roles. |
| TC-09 | RF-11: cerrar sesión y proteger rutas | API/E2E | Alta | 2 | Parcial: cierre de sesión y redirección de ruta directa comprobados en navegador con sesión sintética; falta verificar invalidación de token en backend. |
| TC-10 | RF-12: crear auditoría con datos completos | API/E2E | Alta | 3 | Parcial: se prueba propuesta/aprobación, no el flujo completo de captura de auditoría |
| TC-11 | RF-12: creación con campos vacíos | Unit/API | Alta | 3 | Parcial: validación de propuestas existe; validar contrato de auditoría |
| TC-12 | RF-12: creación con datos inválidos | Unit/API | Alta | 3 | Parcial: validación de propuestas existe; validar contrato de auditoría |
| TC-13 | RF-13: edición de auditoría | API/E2E | Alta | 3 | Cubierto por API (`auditEdit.integration.test.js`): edición de auditoría aprobada y en curso con campos permitidos por estado, campos bloqueados, cerrada protegida, permisos e historial `AUDIT_UPDATED` |
| TC-14 | RF-13: edición con campos vacíos | Unit/API | Alta | 3 | Parcial |
| TC-15 | RF-14: transición de estado reflejada en panel | API/UI | Alta | 3 | Parcial: estados previos, inicio/cierre y transiciones inválidas probadas por API; reflejo visual queda en PR-5 |
| TC-16 | RF-16: riesgo válido reflejado en panel | API/UI | Alta | 3 | Parcial: registro/cálculo de riesgo probado; falta verificar tablero integrado |
| TC-17 | RF-16: riesgo inválido | Unit/API | Alta | 3 | Cubierto por API: límites de escala/campos y vínculo a auditoría inexistente |
| TC-18 | RF-19: carga exitosa de archivo | API/E2E | Media | 4 | Parcial: integración HTTP prueba carga PDF privada, vínculo y descarga firmada con Storage simulado; falta prueba en Supabase real y E2E |
| TC-19 | RF-19: archivo excede límite | API/E2E | Media | 4 | Parcial: backend limita a 3 MB y devuelve 413; falta evidencia E2E/remota |
| TC-20 | RF-24: notificación al responsable | API/E2E | Media | 4 | Cubierto por API: eventos reales y avisos persistentes por destinatario, prioridad, enlace y alcance probados; falta aceptación desplegada. El canal externo no forma parte de esta bandeja. |
| TC-21 | RF-24: marcar/gestionar como leída | API/E2E | Media | 4 | Parcial: pruebas HTTP y repositorio simulado cubren lectura por persona, permisos y reversión; falta comprobar persistencia real en despliegue |
| TC-22 | RF-27: aplicar filtros | API/E2E | Media | 5 | Parcial: filtros de riesgos/evidencias, auditorías y reportes se cubren por API; falta dictamen desplegado. |
| TC-23 | RF-27: búsqueda con coincidencias | API/E2E | Media | 5 | Parcial: búsqueda por API/UI de auditorías y reporte filtrado; falta aceptar alcance global con criterios oficiales. |
| TC-24 | RF-27: búsqueda sin resultados | API/UI | Media | 5 | Parcial: HU-26 y el reporte muestran estado vacío; falta dictamen desplegado. |
| TC-25 | RF-27: filtro sin resultados | API/UI | Media | 5 | Parcial: filtro vacío y CSV solo con encabezados implementados; falta dictamen desplegado. |
| TC-26 | RF-29: exportación completa | API/E2E | Media | 5 | Cubierto en código: descarga CSV del portafolio visible; falta dictamen de Production. |
| TC-27 | RF-29: exportar datos filtrados | API/E2E | Media | 5 | Cubierto en código: exportación con año, trimestre, unidad, estado y responsable tras aplicar alcance por rol; falta dictamen de Production. |
| TC-28 | RF-29: exportar filtro vacío | API/UI | Media | 5 | Cubierto en código: reporte vacío y CSV con encabezados; falta dictamen de Production. |
| TC-29 | RF-30/RNF-03: funciones distintas por rol | Unit/API/E2E | Alta | 2 | Parcial: listado/edición y denegación por rol cubiertos en API; falta matriz completa de módulos |
| TC-30 | RF-33: cerrar auditoría y evitar edición posterior | API/UI | Alta | 3 | Parcial: flujo API y rechazo de transiciones/edición posteriores; reflejo visual queda en PR-5 |
| TC-31 | RNF-01: 150 usuarios concurrentes | Carga | Alta | 7 | Implementación preparada en k6; no ejecutada: requiere staging HTTPS y JWT de cuenta de carga activa; límite global actual de 600 solicitudes/IP/15 min puede rechazar la corrida |
| TC-32 | RNF-01: 250 o más usuarios y umbral de respuesta | Carga | Alta | 7 | Implementación preparada en k6 con 250 VUs, error <1% y p95 <1500 ms; no ejecutada por ausencia de ambiente/token; revisar el límite global 600/IP antes de interpretar capacidad |
| TC-33 | RNF-06: navegadores compatibles | E2E | Media | 6 | Parcial: existen casos Playwright y corridas históricas, pero el gate de Chrome, Edge y Firefox está diferido desde el 10 de noviembre de 2026; requiere una nueva corrida antes de afirmar compatibilidad vigente |
| TC-34 | RNF-06: navegador no compatible | E2E/manual | Media | 6 | Pendiente; acordar comportamiento soportado y mensaje esperado |
| TC-35 | RNF-07: escritorio, tablet, orientación | UI/E2E/manual | Media | 6 | Parcial: flujo del panel verificado en Chromium escritorio y viewport tablet; orientación y hardware físico quedan manuales |
| TC-36 | RNF-17: contraseña segura aceptada | Unit/API | Alta | 2 | Cubierto por unitarias de reglas y API de registro |
| TC-37 | RNF-07: diseño responsivo en dispositivos | UI/E2E/manual | Media | 6 | Parcial: login y panel sin overflow horizontal a 390 px y 768 px; prueba también emulación Pixel 7. Falta verificar dispositivos físicos y resto de pantallas |
| TC-38 | RNF-17: política mínima de longitud, mayúsculas, minúsculas y números | Unit/API | Alta | 2 | Cubierto por unitarias: frontera de ocho caracteres y cada categoría requerida |
| TC-39 | RF-02: administrador edita rol y deshabilita usuario | API/E2E | Alta | 2 | Cubierto por API: cambio de rol/estado, actor sin permiso y sesión anterior invalidada/reactivada |
| TC-40 | RF-05: panel con gráficas, métricas y acciones | API/E2E | Media | 5 | Parcial: métricas, roles y matriz cubiertos por unitarias/API; PR-6 verifica visualización y acciones director/auditor con respuestas API ficticias |
| TC-41 | RF-06: total por trimestre seleccionado | Unit/API/E2E | Media | 5 | Cubierto por API/E2E: selección anual, semestral y trimestral con recálculo de indicadores; falta dictamen desplegado |
| TC-42 | RF-07: auditorías activas pendientes | API/UI | Alta | 3 | Parcial: endpoint y alcance por rol probados; falta UI y casos de filtrado/orden |
| TC-43 | RF-08: matriz de riesgo del panel | Unit/API/UI | Alta | 5 | Parcial: nueve celdas, conteos activos y permisos cubiertos por unitarias/API; render y presencia de nueve celdas verificados en Chromium |
| TC-44 | RF-16: riesgo válido ligado a auditoría | API | Alta | 3 | Cubierto por API: registro ligado a una auditoría válida y rechazo de vínculo inexistente |
| TC-45 | RF-17: impacto, probabilidad y severidad calculada | Unit/API | Alta | 3 | Cubierto por API y unitarias para las nueve combinaciones de impacto/probabilidad |
| TC-46 | RF-18: control asociado al riesgo | API | Alta | 3 | Existente: enlace de controles a riesgos y validación de IDs |
| TC-47 | RF-20: registrar hallazgo ligado a auditoría | API/E2E | Alta | 3 | Parcial: HU-15 registra hallazgo ligado a control/riesgo y a auditoría cuando el riesgo la tiene vinculada; falta el flujo general de hallazgos por auditoría y su E2E |
| TC-48 | RF-21: crear plan de acción para hallazgo | API/E2E | Alta | 3 | Parcial: API y pantalla permiten avance, comentario, evidencia registrada y solicitud de validación con historial y versión; falta aceptar persistencia tras reinicio y el flujo desplegado con personas y datos sintéticos. |
| TC-49 | RF-22: asignar responsable y fecha de compromiso | API/E2E | Alta | 3 | Parcial: acción con responsable activo y fecha objetivo validada por API; falta aceptación desplegada. |
| TC-50 | RF-23: cerrar hallazgo tras completar plan | API/E2E | Alta | 3 | Cubierto en código: cierre exige una o más acciones vinculadas terminadas, motivo, actor y fecha; falta dictamen de Production. |
| TC-51 | RF-25: historial de cambios de auditoría | API/UI | Media | 4 | Parcial: historial contextual de propuestas y filtro de bitácora probados; falta historial de expediente persistente/UI |
| TC-52 | RF-26: comentario dentro de auditoría | API/E2E | Media | 4 | Parcial: permisos, alcance y validación de comentarios del expediente de planificación probados; falta persistencia/UI |
| TC-53 | RF-28: reporte combinado de auditorías/riesgos/hallazgos | API/E2E | Media | 5 | Cubierto en código: reporte vinculado por expediente, con controles y conteo de evidencias; falta dictamen de Production. |
| TC-54 | RF-31: crear propuesta con objetivo, alcance, justificación y periodo | API/E2E | Alta | 3 | Parcial: creación/validaciones de propuesta probadas; cotejar cada campo requerido |
| TC-55 | RF-32: aprobar propuesta | API/E2E | Alta | 3 | Existente: aprobación, permisos y transición probados por API |
| TC-56 | RF-32: rechazar propuesta con motivo | API/E2E | Alta | 3 | Existente: motivo obligatorio, actor/fecha y estado terminal probados por API |
| TC-57 | RNF-02: TLS 1.2 o superior en tránsito | Operativa | Alta | 7 | Bloqueado: requiere URL/ambiente desplegado y configuración TLS verificable |
| TC-58 | RNF-03: acceso directo a módulo sin permiso | API/E2E | Alta | 2 | Parcial: endpoints con roles cubiertos; falta matriz completa de rutas y pruebas UI/direct URL |
| TC-59 | RNF-04: registrar login y cambio con usuario/fecha/hora | API/operativa | Alta | 4 | Parcial: login instrumentado y bitácora consultable/restringida; almacenamiento y comprobación real de Supabase requieren ambiente |
| TC-60 | RNF-05: crear auditoría en menos de 10 minutos sin capacitación | Usabilidad/manual | Media | 6 | Pendiente: requiere protocolo y participantes de prueba |
| TC-61 | RNF-08: disponibilidad mensual de 99.5% | Operativa/monitoreo | Media | 7 | Bloqueado: requiere monitoreo continuo durante un mes |
| TC-62 | RNF-09: recuperar servicio desde respaldo en máximo 4 horas | Operativa/manual | Alta | 7 | Bloqueado: requiere respaldo, runbook y simulacro aislado |
| TC-63 | RNF-10: incremento de 300% de usuarios registrados | Carga/escala | Media | 7 | Bloqueado: persistencia/ambiente de carga representativo no disponible |
| TC-64 | RNF-11: agregar instancia sin interrupción | Operativa/carga | Alta | 7 | Bloqueado: requiere despliegue con escalamiento horizontal |
| TC-65 | RNF-12: revisión de privacidad y tratamiento de datos | Revisión/manual | Alta | 7 | Pendiente: definir jurisdicción, inventario de datos y responsable de aprobación |
| TC-66 | RNF-13: conservar historial/evidencia según retención | Operativa/API | Alta | 4 | Bloqueado: almacenamiento actual en memoria, sin política de retención |
| TC-67 | RNF-14: panel carga en máximo 2 segundos | Rendimiento/E2E | Media | 7 | Parcial: perfil k6 propone medir API p95 <1500 ms, pero no se ha ejecutado; falta medición completa de página, red y hardware representativos |
| TC-68 | RNF-15: reporte de hasta 100 páginas en máximo 10 segundos | Rendimiento | Media | 7 | Parcial: PDF paginado de 100 páginas en 1 085 ms de render local con datos sintéticos y Node 22; falta medir API, Supabase y red en un entorno representativo. CSV conserva su contrato sin páginas. |
| TC-69 | RNF-16: activar y usar 2FA | API/E2E | Alta | 2 | Cubierto por API: enrolamiento TOTP, código erróneo/expirado y sesión solo tras código válido |
| TC-70 | RNF-18: WCAG 2.1 AA | A11y/UI/manual | Media | 6 | Parcial: axe analiza login y panel contra reglas WCAG 2.1 A/AA; falta teclado/lector, resto de rutas y revisión manual antes de afirmar conformidad |
| TC-71 | RNF-19: interfaz completamente en español | UI/manual | Media | 6 | Pendiente: inventario y verificación de textos visibles |
| TC-72 | RNF-20: mensajes claros sin trazas técnicas | API/E2E | Media | 6 | Parcial: API y E2E validan error visible de login sin stack/exception; revisar demás formularios y flujos |
| TC-73 | RNF-21: aviso de mantenimiento con 48 horas | Operativa/E2E | Media | 7 | Bloqueado: no se encontró agenda/canal de mantenimiento |
| TC-74 | RNF-22: respaldo diario automático | Operativa | Alta | 7 | Bloqueado: requiere servicio de respaldo y evidencia de ejecución diaria |
| TC-75 | RNF-23: rendimiento con alto volumen de evidencias | Carga | Media | 7 | Bloqueado: falta entorno persistente y conjunto de carga representativo; la carga individual admite hasta 3 MB |
| TC-76 | RNF-24: integrar una fuente externa nueva | Integración | Media | 7 | Pendiente: definir fuente, contrato y prueba de integración |
| TC-77 | RNF-25: aviso de privacidad y consentimiento explícito | E2E/revisión | Alta | 7 | Implementación preparada en PR #135; pendiente publicación, revisión jurídica y evidencia de flujo real |
| TC-78 | RNF-26: alineación con estándares IIA | Revisión/manual | Media | 7 | Pendiente: acordar estándar/versión, alcance y revisor competente |

## Datos de prueba y privacidad

Usar cuentas, correos, nombres, riesgos, comentarios y referencias sintéticos reservados para pruebas. No reutilizar los correos de ejemplo del documento como cuentas reales ni adjuntar datos de personas/clientes. Cada corrida debe crear datos identificables por prefijo único y limpiar o reiniciar su almacenamiento aislado al terminar. Nunca registrar contraseñas, códigos TOTP, tokens JWT ni secretos en logs o artefactos.

## Evidencia por corrida

Para cada workflow/corrida registrar: commit y rama probados; nombre/versión del entorno; fecha y zona horaria; inicio, fin y duración; herramienta/versión; casos ejecutados, aprobados, fallidos y bloqueados; navegador/viewport o perfil de carga; defectos vinculados; y enlaces a logs/artifacts. Los tiempos describen una ejecución concreta y no son un SLO por sí mismos.
