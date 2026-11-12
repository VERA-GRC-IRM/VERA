# Enlaces de trabajo

Las vistas de búsqueda de auditorías y riesgos conservan filtros en la URL. «Copiar vista» permite enviarla a otra persona; «Copiar enlace» apunta a una auditoría, riesgo, control, evidencia o ficha del mapa del negocio. El enlace no lleva datos del expediente, contraseñas ni tokens. Al abrirlo se exige iniciar sesión y la API vuelve a comprobar los permisos vigentes; compartir un enlace no concede acceso.

En navegadores sin acceso al portapapeles, VERA muestra el enlace seleccionable. La URL de una auditoría seleccionada utiliza `auditId`, mientras que los filtros compartidos utilizan los parámetros `q`, `status`, `risk`, `type`, `quarter`, `year`, `orgUnitId` y `responsibleId`. Los filtros son preferencias de la vista, no amplían el alcance del servidor. Las personas sin permiso verán la pantalla según su propio acceso, sin el registro ajeno.
