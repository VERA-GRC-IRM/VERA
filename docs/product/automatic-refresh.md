# Actualización automática de vistas

Las pantallas de portafolio, planificación, riesgos, controles, evidencias y pendientes vuelven a consultar el servidor mientras permanecen abiertas. La actualización ocurre cada 40 segundos y también al volver a la pestaña, recuperar conexión o detectar una modificación desde otra pestaña del mismo navegador.

Las consultas usan la sesión actual y los permisos del backend. La señal entre pestañas contiene únicamente una marca de tiempo; no copia registros ni sustituye la comprobación de acceso. Las vistas no consultan cuando están ocultas o sin conexión. Planificación, riesgos, controles y evidencias pausan la actualización al editar para no interrumpir formularios.

Esto es actualización periódica, no colaboración simultánea en tiempo real. No ofrece presencia de usuarios, bloqueo de edición ni resolución de conflictos. El cambio de contenido puede tardar hasta 40 segundos en aparecer si ambas pestañas permanecen abiertas. El alcance no requiere migraciones de Supabase.
