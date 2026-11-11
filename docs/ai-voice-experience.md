# Voz en el asistente VERA

## Dictado de una pregunta

El botón de micrófono aparece solo cuando el backend confirma que Azure Speech está configurado. Al pulsarlo, VERA solicita una sesión temporal mediante una ruta autenticada y limitada por usuario. El navegador captura una intervención breve en español de México y envía el audio directamente a Azure Speech. VERA coloca la transcripción en el campo de texto para que la persona la revise y la edite. **No se envía ninguna pregunta al asistente de forma automática.** «Detener dictado» cancela la captura; el teclado siempre sigue disponible.

La ruta `/api/assistant/speech/token` no entrega la clave permanente. `AZURE_SPEECH_REGION` y `AZURE_SPEECH_KEY` se configuran solo en el backend. No deben añadirse a `VITE_*`, al repositorio, a capturas ni a registros. Un error de Azure no se presenta como transcripción correcta. El límite gratuito F0 de Azure Speech puede agotarse; eso detiene la función de voz sin bloquear el chat escrito.

Esta primera entrega usa el [Speech SDK de JavaScript](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/quickstarts/setup-platform?pivots=programming-language-javascript) y el [reconocimiento desde micrófono en navegador](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-recognize-speech?pivots=programming-language-javascript). El SDK se carga solo al pedir dictado. El consentimiento del micrófono lo controla el navegador.

## Límite de alcance y comprobación

La voz convierte entrada a texto; las respuestas y cualquier cambio de datos continúan por las rutas existentes de VERA, con sus permisos, vista previa y confirmación. Esta entrega no crea una sesión de conversación de audio simultáneo ni conserva grabaciones de voz en VERA. La transcripción entra al historial solo cuando la persona decide enviar la pregunta.

Antes de dar por aceptado el dictado en Production, probar con una cuenta autorizada: permiso de micrófono aceptado y denegado, una pregunta corta, silencio, cancelación, edición previa al envío, agotamiento de cuota y uso en móvil. Las pruebas automatizadas comprueban el contrato y la cancelación; no sustituyen la prueba con un micrófono real.

Azure documenta el [nivel F0 y sus cuotas](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits) y los [precios vigentes](https://azure.microsoft.com/en-us/pricing/details/speech/). Revisar esas páginas antes de cambiar el recurso a un nivel de pago.

## Escuchar respuestas

Cada respuesta breve del asistente ofrece «Escuchar» cuando Azure Speech está disponible. La lectura usa la voz mexicana `es-MX-DaliaNeural`; el usuario puede detenerla desde la misma respuesta. El audio se genera a demanda y se conserva solo en memoria mientras se reproduce. Una respuesta superior a 1800 caracteres mantiene su texto y no solicita síntesis. VERA no guarda ni exporta el audio. Al iniciar un dictado se detiene la reproducción para evitar que el micrófono capte la propia voz del sistema.

La lectura envía el texto de esa respuesta a Azure Speech tras una acción explícita. Esto incluye potencialmente información del expediente que el usuario ya podía ver; no hay reproducción automática. La síntesis usa la misma sesión temporal autenticada y está limitada por usuario. [Microsoft documenta la síntesis desde JavaScript](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis) y la [voz mexicana disponible](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=text-to-speech). La comprobación automatizada verifica voz, formato, cancelación y límite; la aceptación en Production requiere escuchar una respuesta real y comprobar «Detener» en escritorio y móvil.
