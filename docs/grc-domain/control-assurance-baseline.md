# Línea base de controles: vínculos y valoraciones

El mapa actual presenta **relaciones declaradas** entre controles y riesgos autorizados para la persona. `Riesgos con vínculo` cuenta riesgos visibles con al menos un control visible relacionado; no mide cobertura eficaz ni reducción de riesgo. La matriz permite inspeccionar la relación y la última calificación preliminar del control, pero una relación no acredita que el control exista en la operación o cumpla una obligación.

Cada control conserva una calificación ordinal de 1 a 5 y su historial de justificaciones. No se promedian estas calificaciones: carecen de una escala intervalar y pueden corresponder a controles, periodos y pruebas distintos. La creación del control ya incluye una primera valoración; el recuento de valoraciones lo indica expresamente.

La API mantiene temporalmente la clasificación histórica `EFFECTIVE` desde 4 y `INEFFECTIVE` desde 1 a 3 para preservar clientes y flujos existentes, incluido el registro de hallazgos. Esa clasificación es una **regla heredada de calificación**, no una conclusión de aseguramiento. La interfaz y las respuestas operativas del asistente muestran la calificación como preliminar. No se recalculan ni cambian expedientes históricos.

Para emitir una conclusión formal faltan pruebas separadas de diseño y operación con periodo, criterio, muestra, resultado, revisor y evidencia autorizada, además de un criterio empresarial aprobado. Ese contrato forma el siguiente incremento de [#249](https://github.com/VERA-GRC-IRM/VERA/issues/249).
