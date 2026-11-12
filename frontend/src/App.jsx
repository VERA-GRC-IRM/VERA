import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route
} from "react-router-dom";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const MiRol = lazy(() => import("./pages/MiRol"));
const Registro = lazy(() => import("./pages/Registro"));
const BuscarAuditorias = lazy(() => import("./pages/BuscarAuditorias"));
const PublicOverview = lazy(() => import("./pages/PublicOverview"));
const PublicSolutions = lazy(() => import("./pages/PublicSolutions"));
const PublicTrust = lazy(() => import("./pages/PublicTrust"));
const PublicTechnology = lazy(() => import("./pages/PublicTechnology"));
const PrivacyNotice = lazy(() => import("./pages/PrivacyNotice"));
const Planificacion = lazy(() => import("./pages/Planificacion"));
const AuditoriasActivas = lazy(() => import("./pages/AuditoriasActivas"));
const CommitteeDossier = lazy(() => import("./pages/CommitteeDossier"));
const Riesgos = lazy(() => import("./pages/Riesgos"));
const BibliotecaRiesgos = lazy(() => import("./pages/BibliotecaRiesgos"));
const BusinessContext = lazy(() => import("./pages/BusinessContext"));
const Controles = lazy(() => import("./pages/Controles"));
const Notificaciones = lazy(() => import("./pages/Notificaciones"));
const ActividadReciente = lazy(() => import("./pages/ActividadReciente"));
const Asistente = lazy(() => import("./pages/Asistente"));
const AiQuality = lazy(() => import("./pages/AiQuality"));
const Evidencias = lazy(() => import("./pages/Evidencias"));
const MetodosRiesgo = lazy(() => import("./pages/MetodosRiesgo"));
const OfflineWorkspace = lazy(() => import("./pages/OfflineWorkspace"));
const OfflineReport = lazy(() => import("./pages/OfflineReport"));
const loadTrimestres = () => import("./pages/Trimestres");
const Trimestres = lazy(loadTrimestres);
const TrimestreDetalle = lazy(() => loadTrimestres().then(({ TrimestreDetalle: detail }) => ({ default: detail })));
import ProtectedRoute from "./components/ProtectedRoute";
import AssistantConversationProvider from "./contexts/AssistantConversationProvider";
import ConnectivityStatus from "./components/ConnectivityStatus";
import PwaUpdateNotice from "./components/PwaUpdateNotice";
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
      <AssistantConversationProvider>
        <Suspense fallback={null}>
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
