# Piloto real del modo sin conexión

Fecha: 10 de noviembre de 2026 (hora de Ciudad de México). Entorno: `https://www.vera-digital-systems.com/`, despliegue de `main` `ad7b806d921af71188ba9e751471e518b8bcaaa4` al comenzar el ensayo. Navegador: navegador integrado basado en Chromium. Cuenta: una sesión existente con rol `SUPER_ADMIN`; no se registran credenciales, nombres de expedientes, frases locales ni datos descargados.

| Paso observado | Resultado | Límite de la observación |
| --- | --- | --- |
| Entrar con una sesión real vigente y abrir **Sin conexión** | Aprobado: la pantalla abrió y ofreció crear el espacio local | No prueba primer inicio de sesión sin red |
| Crear una frase local en el dispositivo | Aprobado: apareció **Espacio desbloqueado** | La frase la introdujo la persona titular; no se inspeccionó |
| Guardar las 11 secciones elegidas | Aprobado: la pantalla informó **guardado** para las 11 y mostró fecha por sección | Acredita solo esta cuenta y el contenido visible para ella |
| Cortar la red de la pestaña y abrir **Panel de Portafolio** | Aprobado: apareció el aviso **Mostrando copia local** y se visualizaron indicadores del portafolio guardado | Se usó emulación de red de la pestaña, no desconexión física del dispositivo |
| Restaurar la red y recargar el panel | Aprobado: desapareció el aviso de copia local y el panel cargó datos actuales del servidor | No prueba todos los módulos ni un cambio enviado al servidor |
| Repetir en un teléfono físico | La persona usuaria informó «Todo bien» tras recibir los pasos de guardar el panel, activar modo avión, reabrirlo y reconectar | Resultado comunicado, no observado por el equipo; navegador, sistema operativo y evidencias no registrados |

No se modificó ningún expediente, plan, evidencia, rol ni cuenta del servidor durante este piloto. La copia cifrada queda en el dispositivo de la persona hasta que la borre. Este registro documenta una observación puntual; no es aceptación integral de producción.

## Ensayos aún necesarios

- Una cuenta autorizada por cada rol, con datos propios y ajenos, para comprobar la visibilidad tras desconexión y reconexión.
- Preparar un borrador y subirlo en un entorno aislado con un expediente de prueba, incluyendo conflicto, permiso revocado y respuesta incierta.
- Comprobar cuota agotada y limpieza de datos en dispositivos físicos; la suite automatizada solo simula la limpieza.
- Repetir el recorrido en dispositivos físicos identificados por navegador y sistema operativo, con bitácora y evidencia; el primer resultado telefónico solo fue comunicado por la persona usuaria. La matriz automatizada de Chrome, Edge, Firefox y tamaños móvil/tablet mide navegadores y viewports, no teléfonos reales.
