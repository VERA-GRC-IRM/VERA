import { useEffect, useState } from "react";
import { ArrowRight, Clock3, Inbox, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { getAuditLog, getRecentAuditActivity } from "../services/auditService";
import { ROLE_LABELS } from "../constants/roles";
import { displayAuditId } from "../utils/auditId";
import { isActivityWithinWindow } from "../utils/activityWindow";
import "./Dashboard.css";
import "./ActividadReciente.css";
import "./Usuarios.css";
import "./Auditoria.css";

const ACTION_LABELS = {
  AUDIT_PROPOSAL_CREATED: "Propuesta creada",
  AUDIT_PROPOSAL_UPDATED: "Propuesta actualizada",
  AUDIT_PROPOSAL_APPROVED: "Auditoría aprobada",
  AUDIT_PROPOSAL_REJECTED: "Propuesta rechazada",
  AUDIT_PROPOSAL_DELETED: "Propuesta eliminada",
  AUDIT_COMMENT_ADDED: "Comentario agregado",
  AUDIT_STARTED: "Auditoría iniciada",
  AUDIT_CLOSED: "Auditoría cerrada",
  AUDIT_UPDATED: "Auditoría actualizada",
  FINDING_REGISTERED: "Hallazgo registrado",
  FINDING_UPDATED: "Hallazgo actualizado",
  EVIDENCE_REGISTERED: "Evidencia registrada",
  EVIDENCE_FILE_UPLOADED: "Archivo de evidencia cargado"
};

const ADMIN_ACTION_LABELS = {
  LOGIN_SUCCESS: "Inicio de sesión",
  LOGIN_FAILED: "Intento de acceso fallido",
  LOGIN_BLOCKED: "Acceso bloqueado",
  TWO_FACTOR_FAILED: "Código 2FA incorrecto",
  TWO_FACTOR_ENABLED: "2FA activado",
  ACCOUNT_REQUESTED: "Solicitud de cuenta",
  ACCOUNT_REGISTERED: "Cuenta creada",
  REQUEST_APPROVED: "Solicitud aprobada",
  REQUEST_REJECTED: "Solicitud rechazada",
  ROLE_CHANGED: "Cambio de rol",
  USER_ENABLED: "Cuenta habilitada",
  USER_DISABLED: "Cuenta deshabilitada",
  AUDIT_PROPOSAL_CREATED: "Propuesta creada",
  AUDIT_PROPOSAL_UPDATED: "Propuesta editada",
  AUDIT_PROPOSAL_APPROVED: "Propuesta aprobada",
  AUDIT_PROPOSAL_REJECTED: "Propuesta rechazada",
  AUDIT_PROPOSAL_DELETED: "Propuesta eliminada",
  AUDIT_STARTED: "Auditoría iniciada",
  AUDIT_CLOSED: "Auditoría cerrada",
  RISK_REGISTERED: "Riesgo registrado",
  RISK_UPDATED: "Riesgo actualizado",
  RISK_EVALUATED: "Riesgo reevaluado",
  CONTROL_REGISTERED: "Control registrado",
  CONTROL_UPDATED: "Control actualizado",
  CONTROL_EVALUATED: "Control evaluado",
  FINDING_REGISTERED: "Hallazgo registrado",
  FINDING_UPDATED: "Hallazgo actualizado",
  EVIDENCE_REGISTERED: "Evidencia registrada"
};

const formatDate = (date) => new Date(date).toLocaleString("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function ActividadReciente() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const canSeeAuditLog = user?.role === "SUPER_ADMIN";
  const [activities, setActivities] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [activityAction, setActivityAction] = useState("");
  const [activityActor, setActivityActor] = useState("");
  const [recentCutoff, setRecentCutoff] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const result = await getRecentAuditActivity();
      setRecentCutoff(Date.now() - 7 * 24 * 60 * 60 * 1000);
      setActivities(result);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    getRecentAuditActivity()
      .then((entries) => {
        if (cancelled) return;
        setRecentCutoff(Date.now() - 7 * 24 * 60 * 60 * 1000);
        setActivities(entries);
        setError("");
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!canSeeAuditLog) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      setAuditLoading(true);
      getAuditLog({ action, actor })
        .then((data) => {
          if (!cancelled) {
            setEntries(data);
            setAuditError("");
          }
        })
        .catch((loadError) => !cancelled && setAuditError(loadError.message))
        .finally(() => !cancelled && setAuditLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [action, actor, canSeeAuditLog]);

  const openAudit = (audit) => {
    const auditId = encodeURIComponent(audit.id);
    navigate(audit.status === "ACTIVE"
      ? `/auditorias-activas/${auditId}`
      : `/auditorias-activas/${auditId}`);
  };
  const visibleActivities = activities.filter((entry) => isActivityWithinWindow(entry.date, recentCutoff)
    && (!activityAction || entry.action === activityAction)
    && (!activityActor || (entry.actor?.username || "").toLocaleLowerCase("es-MX").includes(activityActor.trim().toLocaleLowerCase("es-MX"))));

  return (
    <div className="dashboard-layout">
      <Sidebar active="actividad" />
      <main className="dashboard-main">
        <section className="dashboard-content recent-activity-page">
          <header className="dashboard-header">
            <div>
              <span className="eyebrow">SEGUIMIENTO DE AUDITORÍAS</span>
              <h1>Bitácora</h1>
              <p>Eventos recientes de auditorías visibles para tu cuenta.</p>
            </div>
            <button type="button" className="recent-activity-refresh" onClick={load} disabled={loading}>
              <RefreshCw size={16} aria-hidden="true" />
              Actualizar
            </button>
          </header>

          {canSeeAuditLog && (
            <section className="users-card unified-audit-log" aria-labelledby="audit-log-title">
              <div className="dashboard-header">
                <div>
                  <span className="eyebrow">GOBIERNO DE ACCESOS</span>
                  <h2 id="audit-log-title">Bitácora administrativa</h2>
                  <p>Accesos, usuarios y cambios de configuración.</p>
                </div>
              </div>
              <div className="audit-filters">
                <input type="search" placeholder="Buscar por usuario..." value={actor}
                  onChange={(event) => setActor(event.target.value)} aria-label="Buscar por usuario" />
                <select value={action} onChange={(event) => setAction(event.target.value)} aria-label="Filtrar por acción">
                  <option value="">Todas las acciones</option>
                  {Object.entries(ADMIN_ACTION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              {auditError && <p className="users-msg error">{auditError}</p>}
              {auditLoading && !entries.length && <p className="users-muted">Cargando bitácora...</p>}
              {!auditLoading && !auditError && !entries.length && <div className="users-empty"><Inbox size={20} />No hay actividad administrativa.</div>}
              {entries.length > 0 && <div className="audit-table-wrap"><table className="audit-table">
                <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Detalle</th></tr></thead>
                <tbody>{entries.map((entry) => <tr key={entry.id}>
                  <td className="nowrap">{formatDate(entry.date)}</td>
                  <td>{entry.actor.username || "—"}</td>
                  <td>{ROLE_LABELS[entry.actor.role] || entry.actor.role || "—"}</td>
                  <td><span className="audit-tag">{ADMIN_ACTION_LABELS[entry.action] || entry.action}</span></td>
                  <td>{entry.details?.title || entry.details?.username || entry.details?.proposalId || "—"}</td>
                </tr>)}</tbody>
              </table></div>}
            </section>
          )}

          {error && <p className="recent-activity-error" role="alert">{error}</p>}
          <section className="recent-activity-filters" aria-label="Filtros de bitácora">
            <label>Buscar persona<input type="search" value={activityActor} onChange={(event) => setActivityActor(event.target.value)} placeholder="Nombre de usuario" /></label>
            <label>Tipo de evento<select value={activityAction} onChange={(event) => setActivityAction(event.target.value)}>
              <option value="">Todos</option>{Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <small>Vista de actividad de los últimos 7 días · el historial formal se conserva.</small>
          </section>
          {loading && <p className="recent-activity-state" role="status">Cargando bitácora…</p>}
          {!loading && !error && visibleActivities.length === 0 && (
            <div className="recent-activity-empty">
              <Inbox size={22} aria-hidden="true" />
              <p>{activities.length ? "No hay eventos que coincidan con los filtros." : "No hay actividad en auditorías visibles durante los últimos 7 días."}</p>
            </div>
          )}
          {!loading && visibleActivities.length > 0 && (
            <ol className="recent-activity-list">
              {visibleActivities.map((entry) => (
                <li key={entry.id}>
                  <article className="recent-activity-card">
                    <div className="recent-activity-card-icon"><Clock3 size={19} aria-hidden="true" /></div>
                    <div className="recent-activity-card-content">
                      <span className="recent-activity-action">{ACTION_LABELS[entry.action] || entry.action}</span>
                      <h2 title={entry.audit.id}>{displayAuditId(entry.audit.id, entry.audit.auditFolio || entry.audit.folio)} · {entry.audit.title}</h2>
                      <p>{entry.actor.username || "Sistema"} · {formatDate(entry.date)}</p>
                    </div>
                    <button type="button" className="recent-activity-open" onClick={() => openAudit(entry.audit)}>
                      Abrir auditoría <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </article>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}

export default ActividadReciente;
