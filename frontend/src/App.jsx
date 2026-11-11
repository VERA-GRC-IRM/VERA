import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route
} from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Usuarios from "./pages/Usuarios";
import MiRol from "./pages/MiRol";
import Registro from "./pages/Registro";
import BuscarAuditorias from "./pages/BuscarAuditorias";
import PublicOverview from "./pages/PublicOverview";
import PublicSolutions from "./pages/PublicSolutions";
import PublicTrust from "./pages/PublicTrust";
import PublicTechnology from "./pages/PublicTechnology";
import PrivacyNotice from "./pages/PrivacyNotice";
import Planificacion from "./pages/Planificacion";
import AuditoriasActivas from "./pages/AuditoriasActivas";
import CommitteeDossier from "./pages/CommitteeDossier";
import Riesgos from "./pages/Riesgos";
import BibliotecaRiesgos from "./pages/BibliotecaRiesgos";
import BusinessContext from "./pages/BusinessContext";
import Controles from "./pages/Controles";
import Notificaciones from "./pages/Notificaciones";
import ActividadReciente from "./pages/ActividadReciente";
import Asistente from "./pages/Asistente";
import AiQuality from "./pages/AiQuality";
import Evidencias from "./pages/Evidencias";
import MetodosRiesgo from "./pages/MetodosRiesgo";
import OfflineWorkspace from "./pages/OfflineWorkspace";
import Trimestres, { TrimestreDetalle } from "./pages/Trimestres";
import ProtectedRoute from "./components/ProtectedRoute";
import AssistantConversationProvider from "./contexts/AssistantConversationProvider";
import ConnectivityStatus from "./components/ConnectivityStatus";
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
      <AssistantConversationProvider>
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

          <Route
            path="/trimestres/:quarterId"
            element={
              <ProtectedRoute>
                <TrimestreDetalle />
              </ProtectedRoute>
            }
          />

        </Routes>
      </AssistantConversationProvider>
    </BrowserRouter>
  );
}

export default App;
