import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const TITLES = {
  "/dashboard": "Panel de Portafolio",
  "/planificacion": "Planificación",
  "/trimestres": "Trimestres",
  "/auditorias-activas": "Auditorías activas",
  "/auditorias": "Buscar auditorías",
  "/riesgos": "Registro de riesgos",
  "/biblioteca-riesgos": "Biblioteca de riesgos",
  "/metodos-riesgo": "Métodos de riesgo",
  "/mapa-negocio": "Mapa de negocio",
  "/controles": "Mapa de controles",
  "/notificaciones": "Pendientes",
  "/actividad": "Actividad reciente",
  "/asistente": "Preguntar a VERA",
  "/calidad-ia": "Calidad de IA",
  "/evidencias": "Evidencias",
  "/sin-conexion": "Sin conexión",
  "/sin-conexion/informe": "Informe sin conexión",
  "/usuarios": "Usuarios",
  "/mi-rol": "Mi rol",
  "/trabajos": "Trabajos"
};

export default function RouteTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const title = TITLES[pathname] || (pathname.startsWith("/trimestres/") ? "Detalle del trimestre" :
      pathname.startsWith("/auditorias-activas/") ? "Detalle de auditoría" : null);
    if (title) document.title = `${title} | VERA`;
  }, [pathname]);

  return null;
}
