# Decisiones de dominio antes de activar nuevas reglas

Este registro evita introducir supuestos de negocio como si fueran políticas aprobadas. Las primeras implementaciones pueden crear estructuras vacías y contratos compatibles; no asignan entidades reales ni cambian las calificaciones históricas.

| Decisión | Propuesta técnica inicial | Quién debe validarla | Efecto si sigue abierta |
| --- | --- | --- | --- |
| Estructura organizativa | Distinguir entidad jurídica, unidad, ubicación y proceso; admitir relaciones vigentes por fecha | Responsable de gobierno y datos maestros | Usar ejemplos sintéticos; no poblar el árbol FEMSA |
| Titularidad y alcance | Cada expediente posee un ámbito primario y puede relacionarse con otros mediante vínculos explícitos | Dueños de procesos, seguridad y auditoría | No inferir acceso de una cadena `area` |
| Biblioteca de riesgos | Taxonomía versionada y plantillas; conservar casos específicos independientes | Responsable de riesgos | Catálogo inicial vacío o sintético |
| Escalas y umbrales | Conservar la escala histórica 1–3; proponer una versión nueva configurable y documentada | Comité o responsable de riesgos | No activar nuevo método para casos reales |
| Riesgo residual | Evaluación explícita sustentada en controles probados; no reducción porcentual automática | Responsable de riesgos y controles | Mostrar “no evaluado”, nunca cero implícito |
| Apetito/tolerancia | Definir por categoría y entidad con periodo de vigencia y aprobador | Instancia de gobierno competente | Sin alertas de incumplimiento inventadas |
| Agregación | En escalas cualitativas mostrar distribución y cobertura; solo agregar pérdidas cuando compartan unidades y método | Riesgos/finanzas | No sumar puntuaciones ordinales ni promediar colores |
| Marcos y obligaciones | Fuente, edición, licencia, jurisdicción, aplicabilidad y propietario | Jurídico/cumplimiento | No cargar textos protegidos ni declarar conformidad |
| Priorización de módulos | Validar valor y propietarios de terceros, continuidad, privacidad e incidentes | Patrocinador de producto | Mantenerlos en el programa, sin habilitarlos como existentes |

## Regla de compatibilidad

El riesgo actual con probabilidad/impacto 1–3 y `score`/`level` se interpreta como `legacy-3x3-v1` sin editar su resultado almacenado. Una evaluación posterior debe conservar explícitamente su metodología. Si se migra un registro a un método nuevo, se añade un evento de transición y no se reemplaza su historial. Los reportes no comparan puntuaciones de métodos distintos como si fueran la misma escala.

## Preguntas para la primera sesión de trabajo con negocio

1. ¿Cuál es la fuente maestra aprobada para entidades, unidades, procesos y responsables? ¿Con qué frecuencia cambia?
2. ¿Qué categorías de riesgo y horizontes de evaluación usan hoy? ¿Cuáles requieren impacto financiero, seguridad, continuidad, reputación o cumplimiento?
3. ¿Quién aprueba método, apetito, excepciones y aceptación de riesgo? ¿Cuál es la evidencia exigida?
4. ¿Qué relaciones deben cruzar entidades y qué usuarios pueden ver información consolidada?
5. ¿Qué informes y decisiones necesitan el comité y auditoría interna para el primer despliegue empresarial?
