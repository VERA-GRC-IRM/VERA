import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route
} from "react-router-dom";

import { routeLoaders } from "./routeLoaders";

const Login = lazy(routeLoaders.login);
const Dashboard = lazy(routeLoaders.dashboard);
const Usuarios = lazy(routeLoaders.usuarios);
const MiRol = lazy(routeLoaders.miRol);
const Registro = lazy(routeLoaders.registro);
const BuscarAuditorias = lazy(routeLoaders.buscarAuditorias);
const Trabajos = lazy(routeLoaders.trabajos);
const PublicOverview = lazy(routeLoaders.publicOverview);
const PublicSolutions = lazy(routeLoaders.publicSolutions);
const PublicTrust = lazy(routeLoaders.publicTrust);
const PublicTechnology = lazy(routeLoaders.publicTechnology);
const PrivacyNotice = lazy(routeLoaders.privacyNotice);
const Planificacion = lazy(routeLoaders.planificacion);
const AuditoriasActivas = lazy(routeLoaders.auditoriasActivas);
const CommitteeDossier = lazy(routeLoaders.committeeDossier);
const Riesgos = lazy(routeLoaders.riesgos);
const BibliotecaRiesgos = lazy(routeLoaders.bibliotecaRiesgos);
const BusinessContext = lazy(routeLoaders.businessContext);
const Controles = lazy(routeLoaders.controles);
const Notificaciones = lazy(routeLoaders.notificaciones);
const ActividadReciente = lazy(routeLoaders.actividadReciente);
const Asistente = lazy(routeLoaders.asistente);
const AiQuality = lazy(routeLoaders.aiQuality);
const Evidencias = lazy(routeLoaders.evidencias);
const MetodosRiesgo = lazy(routeLoaders.metodosRiesgo);
const loadOfflineRoutes = routeLoaders.offlineRoutes;
const OfflineWorkspace = lazy(loadOfflineRoutes);
const OfflineReport = lazy(() => loadOfflineRoutes().then(({ OfflineReport: report }) => ({ default: report })));
const loadTrimestres = routeLoaders.trimestres;
const Trimestres = lazy(loadTrimestres);
const TrimestreDetalle = lazy(() => loadTrimestres().then(({ TrimestreDetalle: detail }) => ({ default: detail })));
import ProtectedRoute from "./components/ProtectedRoute";
import AssistantConversationProvider from "./contexts/AssistantConversationProvider";
import ConnectivityStatus from "./components/ConnectivityStatus";
import PwaUpdateNotice from "./components/PwaUpdateNotice";
import DesktopAlerts from "./components/DesktopAlerts";
import WorkspaceSync from "./components/WorkspaceSync";
import RouteLoading from "./components/RouteLoading";
import { ROLE_REQUEST_ROLES, USER_VIEW_ROLES } from "./constants/roles";


function App() {
  useEffect(() => {
    const syncSession = (event) => {
      if (event.key === "token" || event.key === "user") window.location.reload();
    };
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, []);
  return (
    <BrowserRouter>
      <ConnectivityStatus />
      <PwaUpdateNotice />
      <DesktopAlerts />
      <WorkspaceSync />
      <AssistantConversationProvider>
        <Suspense fallback={<RouteLoading />}>
        <Routes>

          <Route
            path="/"
            element={<Login />}
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route path="/registro" element={<Registro />} />
          {import.meta.env.VITE_VERA_JOBS_ENABLED === "true" &&
            <Route path="/trabajos" element={<ProtectedRoute><Trabajos /></ProtectedRoute>} />}
          <Route path="/acerca" element={<PublicOverview />} />
          <Route path="/soluciones" element={<PublicSolutions />} />
          <Route path="/confianza" element={<PublicTrust />} />
          <Route path="/tecnologia" element={<PublicTechnology />} />
          <Route path="/privacidad" element={<PrivacyNotice />} />
          <Route path="/mi-rol" element={<ProtectedRoute allowedRoles={ROLE_REQUEST_ROLES}><MiRol /></ProtectedRoute>} />

          <Route
            path="/usuarios"
            element={
              <ProtectedRoute allowedRoles={USER_VIEW_ROLES}>
                <Usuarios />
              </ProtectedRoute>
            }
          />

          <Route path="/auditoria" element={<Navigate to="/actividad" replace />} />
          <Route
            path="/planificacion"
            element={
              <ProtectedRoute>
                <Planificacion />
              </ProtectedRoute>
            }
          />

          <Route
            path="/trimestres"
            element={
              <ProtectedRoute>
                <Trimestres />
              </ProtectedRoute>
            }
          />

          <Route
            path="/auditorias-activas"
            element={
              <ProtectedRoute>
                <AuditoriasActivas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/auditorias"
            element={
              <ProtectedRoute>
                <BuscarAuditorias />
              </ProtectedRoute>
            }
          />
          <Route path="/auditorias-activas/:auditId/comite" element={<ProtectedRoute><CommitteeDossier /></ProtectedRoute>} />
          <Route
            path="/auditorias-activas/:auditId"
            element={
              <ProtectedRoute>
                <AuditoriasActivas />
              </ProtectedRoute>
            }
          />

          <Route path="/riesgos" element={<ProtectedRoute><Riesgos /></ProtectedRoute>} />
          <Route path="/biblioteca-riesgos" element={<ProtectedRoute><BibliotecaRiesgos /></ProtectedRoute>} />
          <Route
            path="/metodos-riesgo"
            element={
              <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
                <MetodosRiesgo />
              </ProtectedRoute>
            }
          />
          <Route path="/mapa-negocio" element={<ProtectedRoute><BusinessContext /></ProtectedRoute>} />
          <Route path="/controles" element={<ProtectedRoute><Controles /></ProtectedRoute>} />
          <Route path="/notificaciones" element={<ProtectedRoute><Notificaciones /></ProtectedRoute>} />
          <Route path="/actividad" element={<ProtectedRoute><ActividadReciente /></ProtectedRoute>} />
          <Route path="/asistente" element={<ProtectedRoute><Asistente /></ProtectedRoute>} />
          <Route path="/calidad-ia" element={<ProtectedRoute allowedRoles={["SUPER_ADMIN"]}><AiQuality /></ProtectedRoute>} />
          <Route path="/evidencias" element={<ProtectedRoute><Evidencias /></ProtectedRoute>} />
          <Route path="/sin-conexion" element={<ProtectedRoute><OfflineWorkspace /></ProtectedRoute>} />
          <Route path="/sin-conexion/informe" element={<ProtectedRoute><OfflineReport /></ProtectedRoute>} />

          <Route
            path="/trimestres/:quarterId"
            element={
              <ProtectedRoute>
                <TrimestreDetalle />
              </ProtectedRoute>
            }
          />

        </Routes>
        </Suspense>
      </AssistantConversationProvider>
    </BrowserRouter>
  );
}

export default App;
