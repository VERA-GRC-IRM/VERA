# Compartir un enlace en Microsoft Teams

Junto a **Copiar enlace**, la opción **Teams** abre la ventana de Microsoft Teams con el enlace del registro o de la vista filtrada. La persona elige el chat o canal y confirma el envío. VERA no envía mensajes automáticamente ni concede acceso al destinatario: al abrir el enlace, este debe iniciar sesión y conservar sus permisos propios.

La opción comparte solo la URL interna HTTPS y pide a Teams que no genere vista previa de una pantalla autenticada. No incorpora nombres, hallazgos, archivos ni tokens en el mensaje. Las pruebas automatizadas comprueban el destino, el enlace codificado y el rechazo de destinos externos; la entrega final depende de la cuenta y las políticas de Teams. Microsoft documenta este flujo para Edge y Chrome de escritorio; requiere una cuenta Teams habilitada y no se ha validado con el tenant de FEMSA.

Los avisos automáticos, una pestaña integrada en Teams y la sincronización con Planner son proyectos distintos: necesitan autorización del tenant, identidad de aplicación, destinatarios y una regla de privacidad por cuenta. Ninguno de ellos se activa con este botón.
