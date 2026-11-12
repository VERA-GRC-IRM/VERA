export const routeLoaders = {
  login: () => import("./pages/Login"),
  dashboard: () => import("./pages/Dashboard"),
  usuarios: () => import("./pages/Usuarios"),
  miRol: () => import("./pages/MiRol"),
  registro: () => import("./pages/Registro"),
  buscarAuditorias: () => import("./pages/BuscarAuditorias"),
  publicOverview: () => import("./pages/PublicOverview"),
  publicSolutions: () => import("./pages/PublicSolutions"),
  publicTrust: () => import("./pages/PublicTrust"),
  publicTechnology: () => import("./pages/PublicTechnology"),
  privacyNotice: () => import("./pages/PrivacyNotice"),
  planificacion: () => import("./pages/Planificacion"),
  auditoriasActivas: () => import("./pages/AuditoriasActivas"),
  committeeDossier: () => import("./pages/CommitteeDossier"),
  riesgos: () => import("./pages/Riesgos"),
  bibliotecaRiesgos: () => import("./pages/BibliotecaRiesgos"),
  businessContext: () => import("./pages/BusinessContext"),
  controles: () => import("./pages/Controles"),
  notificaciones: () => import("./pages/Notificaciones"),
  actividadReciente: () => import("./pages/ActividadReciente"),
  asistente: () => import("./pages/Asistente"),
  aiQuality: () => import("./pages/AiQuality"),
  evidencias: () => import("./pages/Evidencias"),
  metodosRiesgo: () => import("./pages/MetodosRiesgo"),
  offlineRoutes: () => import("./pages/OfflineRoutes"),
  trimestres: () => import("./pages/Trimestres")
};

const navigationLoaders = {
  "/": routeLoaders.login,
  "/dashboard": routeLoaders.dashboard,
  "/usuarios": routeLoaders.usuarios,
  "/mi-rol": routeLoaders.miRol,
  "/registro": routeLoaders.registro,
  "/auditorias": routeLoaders.buscarAuditorias,
  "/acerca": routeLoaders.publicOverview,
  "/soluciones": routeLoaders.publicSolutions,
  "/confianza": routeLoaders.publicTrust,
  "/tecnologia": routeLoaders.publicTechnology,
  "/privacidad": routeLoaders.privacyNotice,
  "/planificacion": routeLoaders.planificacion,
  "/auditorias-activas": routeLoaders.auditoriasActivas,
  "/riesgos": routeLoaders.riesgos,
  "/biblioteca-riesgos": routeLoaders.bibliotecaRiesgos,
  "/mapa-negocio": routeLoaders.businessContext,
  "/controles": routeLoaders.controles,
  "/notificaciones": routeLoaders.notificaciones,
  "/actividad": routeLoaders.actividadReciente,
  "/asistente": routeLoaders.asistente,
  "/calidad-ia": routeLoaders.aiQuality,
  "/evidencias": routeLoaders.evidencias,
  "/metodos-riesgo": routeLoaders.metodosRiesgo,
  "/sin-conexion": routeLoaders.offlineRoutes,
  "/trimestres": routeLoaders.trimestres
};

export function prefetchNavigation(path) {
  const loader = navigationLoaders[path.split("?")[0]];
  if (loader) void loader().catch(() => {});
}
