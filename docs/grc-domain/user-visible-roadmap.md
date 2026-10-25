# Evolución funcional GRC/IRM para usuarios de VERA

Este plan organiza capacidades que las personas podrán utilizar en VERA. Cada fase se entrega en PR pequeños que conectan datos, reglas de negocio, interfaz y documentación. Una pantalla terminada no equivale a una política empresarial aprobada ni a una aceptación de producción. Los ejemplos son neutrales hasta contar con definiciones oficiales del negocio.

| Fase | Resultado visible | Entregas independientes | Seguimiento |
| --- | --- | --- | --- |
| 1. Contexto y biblioteca | Consultar escenarios de referencia; registrar un riesgo desde una versión concreta; navegar empresas, unidades, procesos, servicios y objetivos relacionados. | Vínculo plantilla–riesgo; catálogo de procesos/servicios/objetivos; relaciones y navegación por ámbito; asignación voluntaria de expedientes históricos. | [#253](https://github.com/VERA-GRC-IRM/VERA/issues/253), [#252](https://github.com/VERA-GRC-IRM/VERA/issues/252), [#247](https://github.com/VERA-GRC-IRM/VERA/issues/247) |
| 2. Decisiones de riesgo | Comparar evaluaciones inherente, residual y objetivo; ver método, fecha y fundamento; registrar respuesta, apetito, tolerancia e indicadores. | Método y ejemplos aprobados; registro de versiones; evaluaciones; respuestas y excepciones; indicadores y panel. | [#248](https://github.com/VERA-GRC-IRM/VERA/issues/248) |
| 3. Controles y obligaciones | Saber qué control atiende qué riesgo u obligación, cuándo se probó, con qué evidencia y qué falta atender. | Biblioteca; pruebas de diseño y operación; obligaciones aplicables; relación y cobertura; vista de brechas. | [#249](https://github.com/VERA-GRC-IRM/VERA/issues/249) |
| 4. Auditoría basada en riesgo | Construir un universo auditable y un plan explicable; consultar trabajo, hallazgos, acciones y cierre en un expediente continuo. | Universo; priorización y plan; programas y papeles de trabajo; revisión; informes y seguimiento. | [#250](https://github.com/VERA-GRC-IRM/VERA/issues/250) |
| 5. Ecosistema y continuidad | Seguir terceros relevantes, procesos críticos, dependencias, ejercicios y eventos observados. | Inventario y evaluación de terceros; impacto y planes de continuidad; ejercicios; eventos y pérdidas verificadas. | [#251](https://github.com/VERA-GRC-IRM/VERA/issues/251) |
| 6. Visión integrada | Consultar por entidad, proceso, responsable y periodo el vínculo entre objetivo, riesgo, control, evidencia, auditoría y decisión. | Fuentes e importaciones conciliadas; indicadores con definiciones; vistas ejecutivas; respuestas del asistente basadas en los expedientes autorizados. | [#241](https://github.com/VERA-GRC-IRM/VERA/issues/241) |

## Regla para cada entrega

1. Conservar el comportamiento y los registros anteriores, o publicar una migración compatible.
2. Hacer explícitos responsable, fuente, fecha, versión, alcance y datos ausentes en cada decisión que los necesite.
3. Usar el mismo contrato de negocio en formulario, API, persistencia, exportación y asistente cuando una capacidad aparezca en esas superficies.
4. Validar con escenarios neutrales y documentar por separado la aceptación real de usuarios y despliegue. No cargar estructuras ni umbrales atribuidos a FEMSA sin aprobación.
5. Cerrar una fase por sus criterios de uso y evidencia, no por el número de PR fusionados.

**Primer incremento:** selección opcional de una plantilla publicada al registrar un riesgo. Se conserva la revisión exacta como referencia y el texto del riesgo puede adaptarse al caso concreto. No cambia la matriz histórica ni vincula automáticamente expedientes anteriores.
