# Plataforma de aseguramiento de calidad

La [plataforma de calidad](https://vera-grc-irm.github.io/VERA/) ofrece una vista pública y de solo lectura del commit actual de `main`, el estado de las corridas de calidad, CodeQL, evaluación sintética de IA, aceptación de roles en Preview, smoke de Production, ensayos específicos del modo sin conexión e informe integral. La matriz **general** de navegadores permanece visible como [deuda técnica #300](https://github.com/VERA-GRC-IRM/VERA/issues/300), con ejecución manual y fuera de los gates vigentes. La matriz **offline** de seis perfiles es otra corrida manual y sintética; no cierra esa deuda ni acredita dispositivos físicos. **Al abrirla**, la plataforma consulta la API pública de GitHub y vuelve a hacerlo al recuperar el foco o cada cinco minutos mientras esté visible. Si GitHub no responde, marca el estado como **sin confirmar**; no deja una instantánea anterior presentada como vigente. GitHub puede servir hasta 60 segundos de caché y una corrida tarda en aparecer o terminar: «en vivo» no significa latencia cero.

Cuando el informe integral aprobado del mismo SHA y de la misma corrida publicada está disponible, presenta recuentos de backend e IA, cobertura de líneas, ramas y funciones, duración, auditoría npm y trazabilidad. Navegadores muestra **Diferida**, nunca un recuento inventado. Si cambia `main` o aparece una corrida integral nueva, oculta esas cifras hasta que la publicación correspondiente esté lista. Cada resultado abre la ejecución original de GitHub Actions con sus pasos, logs, duración y artefactos disponibles. La publicación también incluye una [bitácora Markdown](https://vera-grc-irm.github.io/VERA/status.md) y [datos JSON](https://vera-grc-irm.github.io/VERA/status.json): son **instantáneas fechadas**, no respuestas en vivo.

La fila **Supabase local** enlaza un [ensayo de migraciones y restauración sintética](local-supabase-rehearsal.md) en una base desechable. Ese resultado no es un respaldo de producción ni cierra la verificación de persistencia real.

La sección **Excel, Power BI y Teams** muestra la última [demostración automática](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/microsoft-integration-proof.yml), su SHA, estado y tiempo, con enlace al Summary y sus libros de ejemplo. Compara formatos y límites usando datos sintéticos en memoria. Si el commit de esa corrida ya no es el `main` actual, se muestra como **Histórica**; si GitHub no responde, queda **Sin confirmar**. No acredita una actualización de Power BI Service ni la entrega de mensajes en Teams.

## Actualización

El workflow [`quality-portal.yml`](../../.github/workflows/quality-portal.yml) publica la página en GitHub Pages después de cada push a `main`, de las verificaciones de `main`, al publicar un Release, diariamente y por ejecución manual. El generador [`build-quality-portal.py`](../../scripts/build-quality-portal.py) consulta la API de GitHub con el `GITHUB_TOKEN` temporal de solo lectura. El navegador usa [`quality-portal-live.js`](../../scripts/quality-portal-live.js) y **únicamente la API pública**, sin token. Ni el generador ni el navegador llaman a Azure OpenAI, Copilot u otros modelos.

El portal solo llama **vigente** a una verificación terminada cuyo SHA del workflow coincide con el `main` consultado. Si falta una corrida, está en curso o corresponde a otro commit, muestra ese límite. Para Preview y Production, ese SHA corresponde al **código que hizo la comprobación**, no demuestra por sí mismo qué deployment recibió las solicitudes: el artifact JSON identifica la URL y la hora, y Vercel permite cotejar su deployment y commit. Si la API no permite identificar `main`, el generador falla y no publica un estado ambiguo. Si falla la consulta en el navegador, la interfaz oculta métricas integrales y deja enlaces a Actions para comprobación directa. Un workflow verde puede mantener alertas abiertas en Security.

Los tiempos de la tabla son aproximaciones calculadas con `run_started_at` y `updated_at` de la API. Para una duración exacta de un job o de una suite, abre la corrida y su `Summary`.

## Recorrido de revisión

1. Abre el portal, espera la leyenda **Estado consultado** y anota la hora de consulta y el SHA de `main`. Si aparece **sin confirmar**, usa los enlaces a Actions; la instantánea publicada no es una confirmación actual.
2. Contrasta los indicadores con el **informe integral** del mismo commit. En la pestaña *Summary* encontrarás recuentos, cobertura y duraciones; sus artefactos se conservan por 30 días. La plataforma oculta las cifras si falta un informe válido del SHA vigente.
3. Sigue los enlaces a [plan de pruebas](test-plan.md) y [estado por HU](../hu-acceptance-audit.md) para distinguir casos implementados, simulados y pendientes.

El [workflow integral](https://github.com/VERA-GRC-IRM/VERA/actions/workflows/classroom-quality.yml) sigue siendo el enlace estable si GitHub Pages no está disponible. El [corte archivado en Releases](https://github.com/VERA-GRC-IRM/VERA/releases) conserva el resumen y las métricas agregadas después de la caducidad del artefacto de Actions; sus enlaces a logs históricos pueden dejar de funcionar. La [guía de ejecución](professor-quick-run.md) explica cómo iniciar una corrida; solo usuarios con escritura pueden pulsar **Run workflow**.

El enlace de una corrida histórica del antiguo propietario del repositorio puede redirigir a la organización actual. Para compartir una referencia permanente al estado vigente, usa el portal de esta página; GitHub Pages cambió de dirección al transferir el repositorio y la URL antigua de Pages no redirige automáticamente.

## Límite de la evidencia

La página no sustituye pruebas con cuentas de producción autorizadas, persistencia Supabase de Production, un respaldo real restaurable, revisión de alertas, 150/250 usuarios en staging ni aceptación funcional en producción. Preview usa credenciales de demostración y datos en memoria; su workflow no publica tokens ni respuestas privadas. La marca *Aprobada* describe el resultado y alcance de una suite, no el estado global del producto.
