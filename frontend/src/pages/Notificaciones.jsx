import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, BellRing, CalendarClock, CheckCircle2, ClipboardList, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import ActionQueue from "../components/ActionQueue";
import useAutomaticRefresh from "../hooks/useAutomaticRefresh";
import { getNotifications, setNotificationRead } from "../services/notificationService";
import { desktopAlertsAvailable, desktopAlertsEnabled, enableDesktopAlerts, setDesktopAlertsEnabled } from "../services/desktopAlerts";
import { currentPushSubscription, disablePush, enablePush, pushAvailable } from "../services/pushService";
import "./Notificaciones.css";

const TYPES = {
  PROPOSAL_REVIEW: "Decisión requerida",
  PROPOSAL_TRACK: "Seguimiento de propuesta",
  AUDIT_START: "Lista para iniciar",
  AUDIT_FOLLOW_UP: "Seguimiento de ejecución",
  ACTION_OVERDUE: "Compromiso vencido",
  ACTION_DUE_SOON: "Compromiso próximo",
  ACTION_ASSIGNED: "Nueva asignación",
  PROPOSAL_DECIDED: "Decisión registrada",
  FINDING_CREATED: "Nuevo hallazgo",
  EVIDENCE_CREATED: "Nueva evidencia",
  PLAN_VALIDATION_REQUESTED: "Validación solicitada"
};
const PRIORITY = { HIGH: "Prioridad alta", MEDIUM: "Prioridad media", LOW: "Seguimiento" };
const dateLabel = (value) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : null;

const currentUser = JSON.parse(
  localStorage.getItem("user") || "null"
);

const canModifyNotifications =
  currentUser?.role !== "DIRECTOR";

function Notificaciones() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionAlertsAvailable, setActionAlertsAvailable] = useState(true);
  const [actionRevision, setActionRevision] = useState(0);
  const [desktopAlerts, setDesktopAlerts] = useState(() => desktopAlertsEnabled(currentUser?.id));
  const [desktopAlertError, setDesktopAlertError] = useState("");
  const [backgroundPush, setBackgroundPush] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  useEffect(() => {
    if (import.meta.env.VITE_VERA_PUSH_ENABLED !== "true") return undefined;
    let active = true;
    currentPushSubscription().then((subscription) => { if (active) setBackgroundPush(Boolean(subscription)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const toggleBackgroundPush = async () => {
    setPushBusy(true);
    try {
      if (backgroundPush) { await disablePush(); setBackgroundPush(false); }
      else { await enablePush(); setBackgroundPush(true); }
      setPushError("");
    } catch (cause) { setPushError(cause.message); }
    finally { setPushBusy(false); }
  };

  const toggleDesktopAlerts = async () => {
    try {
      if (desktopAlerts) { setDesktopAlertsEnabled(currentUser?.id, false); setDesktopAlerts(false); }
      else { await enableDesktopAlerts(currentUser?.id); setDesktopAlerts(true); }
      setDesktopAlertError("");
    } catch (cause) { setDesktopAlertError(cause.message); }
  };

  const toggleRead = async (item) => {
    try {
      const result = await setNotificationRead(item.id, !item.readAt);
      setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: result.readAt } : entry));
      setError("");
    } catch (cause) { setError(cause.message); }
  };

  const load = async () => {
    setLoading(true);
    try { const data = await getNotifications(); setNotifications(data.notifications); setActionAlertsAvailable(data.actionAlertsAvailable !== false); setError(""); setActionRevision((current) => current + 1); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  };
  const reloadFromAction = async () => {
    try { const data = await getNotifications(); setNotifications(data.notifications); setActionAlertsAvailable(data.actionAlertsAvailable !== false); setError(""); setActionRevision((current) => current + 1); }
    catch (loadError) { setError(loadError.message); }
  };
  useAutomaticRefresh(reloadFromAction);
  useEffect(() => {
    let cancelled = false;
    getNotifications()
      .then((data) => { if (!cancelled) { setNotifications(data.notifications); setActionAlertsAvailable(data.actionAlertsAvailable !== false); setError(""); } })
      .catch((loadError) => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => notifications.filter((item) => filter === "ALL" || (filter === "UNREAD" ? !item.readAt : filter === "DECISIONS" ? ["PROPOSAL_REVIEW", "PROPOSAL_TRACK", "PROPOSAL_DECIDED", "PLAN_VALIDATION_REQUESTED"].includes(item.type) : ["AUDIT_START", "AUDIT_FOLLOW_UP", "ACTION_OVERDUE", "ACTION_DUE_SOON", "ACTION_ASSIGNED", "FINDING_CREATED", "EVIDENCE_CREATED"].includes(item.type))), [notifications, filter]);
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const highCount = notifications.filter((item) => item.priority === "HIGH").length;
  const decisionCount = notifications.filter((item) => ["PROPOSAL_REVIEW", "PROPOSAL_TRACK", "PROPOSAL_DECIDED", "PLAN_VALIDATION_REQUESTED"].includes(item.type)).length;

  return <div className="dashboard-layout"><Sidebar active="notificaciones" /><main className="dashboard-main"><section className="dashboard-content notifications-page">
    <header className="dashboard-header"><div><span className="eyebrow">CENTRO DE ACCIÓN</span><h1>Pendientes</h1><p>Decisiones y seguimientos que requieren atención según tu rol.</p></div><button className="secondary-action" onClick={load} disabled={loading}><RefreshCw size={16} />Actualizar</button></header>
    <div className="notification-desktop-option"><div><strong>Avisos de escritorio</strong><span>Opcionales y sin detalles privados. Funcionan mientras VERA está abierta en este navegador.</span></div><button type="button" className="secondary-action" onClick={toggleDesktopAlerts} disabled={!desktopAlertsAvailable() || !currentUser?.id} aria-pressed={desktopAlerts}>{desktopAlerts ? "Desactivar avisos" : "Activar avisos"}</button></div>
    {import.meta.env.VITE_VERA_PUSH_ENABLED === "true" && !currentUser?.roleTour &&
      <div className="notification-desktop-option"><div><strong>Avisos con VERA cerrada</strong>
        <span>Opcionales en este dispositivo. Solo muestran un mensaje genérico; abre VERA para ver detalles.</span></div>
        <button type="button" className="secondary-action" onClick={toggleBackgroundPush}
          disabled={!pushAvailable() || pushBusy} aria-pressed={backgroundPush}>
          {backgroundPush ? "Desactivar en este dispositivo" : "Activar en este dispositivo"}</button></div>}
    {pushError && <p className="notification-error" role="alert">{pushError}</p>}
    {desktopAlertError && <p className="notification-error" role="status">{desktopAlertError}</p>}
    <div className="notification-kpis"><article className="notification-kpi-high"><AlertCircle size={19} /><div><strong>{actionAlertsAvailable ? highCount : "—"}</strong><span>Prioridad alta{!actionAlertsAvailable ? " · parcial" : ""}</span></div></article><article><ClipboardList size={19} /><div><strong>{decisionCount}</strong><span>Decisiones y seguimiento</span></div></article><article><BellRing size={19} /><div><strong>{actionAlertsAvailable ? unreadCount : "—"}</strong><span>{actionAlertsAvailable ? `Sin leer de ${notifications.length}` : "Sin leer · parcial"}</span></div></article></div>
    <ActionQueue revision={actionRevision} onActionChanged={reloadFromAction} />
    {error && <p className="notification-error">{error}</p>}
    {!actionAlertsAvailable && !loading && <p role="status" className="notification-partial">Los avisos de compromisos no están disponibles. Puedes consultar los avisos de propuestas y auditorías; los conteos generales están incompletos.</p>}
    <div className="notification-toolbar"><div><span className="eyebrow">TU COLA DE TRABAJO</span><h2>{filter === "ALL" ? "Todas las actividades" : filter === "UNREAD" ? "Sin leer" : filter === "DECISIONS" ? "Decisiones y propuestas" : "Ejecución y compromisos"}</h2></div><div className="notification-filters"><button className={filter === "ALL" ? "selected" : ""} onClick={() => setFilter("ALL")}>Todas</button><button className={filter === "UNREAD" ? "selected" : ""} onClick={() => setFilter("UNREAD")}>Sin leer</button><button className={filter === "DECISIONS" ? "selected" : ""} onClick={() => setFilter("DECISIONS")}>Decisiones</button><button className={filter === "EXECUTION" ? "selected" : ""} onClick={() => setFilter("EXECUTION")}>Ejecución</button></div></div>
    {loading ? <div className="notification-empty">Actualizando pendientes...</div> : visible.length === 0 ? <div className="notification-empty"><CheckCircle2 size={23} /><div><b>{actionAlertsAvailable ? "Tu bandeja está al día" : "Sin avisos disponibles para este filtro"}</b><p>{actionAlertsAvailable ? "No hay actividades para este filtro entre los registros visibles." : "La consulta de compromisos está pendiente; actualiza para volver a intentarlo."}</p></div></div> : <div className="notification-list">{visible.map((item) => <article className={`notification-card priority-${item.priority.toLowerCase()} ${item.readAt ? "notification-read" : ""}`} key={item.id}><div className="notification-icon">{["AUDIT_FOLLOW_UP", "ACTION_OVERDUE", "ACTION_DUE_SOON"].includes(item.type) ? <CalendarClock size={20} /> : item.type === "PROPOSAL_REVIEW" ? <AlertCircle size={20} /> : <ClipboardList size={20} />}</div><div className="notification-body"><div className="notification-card-meta"><span>{TYPES[item.type]}</span><strong>{PRIORITY[item.priority]}</strong><span>{item.readAt ? "Leída" : "Sin leer"}</span></div><h3>{item.title}</h3><p>{item.description}</p><div className="notification-date">{item.dueAt ? <span><CalendarClock size={14} /> Fecha objetivo: {dateLabel(item.dueAt)}</span> : <span>Generada desde el registro relacionado</span>}<span>{item.entityId}</span></div></div><div className="notification-card-actions">{canModifyNotifications && (<button className="notification-action" type="button" aria-pressed={Boolean(item.readAt)} onClick={() => toggleRead(item)}>{item.readAt ? "Marcar sin leer" : "Marcar leída"}</button>)}<button className="notification-action" type="button" onClick={() => navigate(item.path)}>Abrir tarea <ArrowRight size={16} /></button></div></article>)}</div>}
    <p className="notification-footnote">Los avisos provienen de propuestas, auditorías, acciones, hallazgos y evidencias visibles. Cada aviso y su lectura se guardan por persona cuando está activo el almacén de Supabase. Marcarlo como leído no completa la tarea. {import.meta.env.VITE_VERA_PUSH_ENABLED === "true" ? "Los avisos con la app cerrada requieren permiso por dispositivo." : "No se envían correos ni notificaciones push con VERA cerrada."}</p>
  </section></main></div>;
}

export default Notificaciones;
