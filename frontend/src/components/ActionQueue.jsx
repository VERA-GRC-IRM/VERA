import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarClock, ClipboardCheck, Plus, RefreshCw } from "lucide-react";
import { addPlanComment, changeActionStatus, createAction, getActionAssignees, getActionSources,
  getActions, getPlanEvidence, reassignAction, requestPlanValidation, updatePlanProgress } from "../services/actionService";
import { localDateAfter, localToday } from "../utils/localDate";
import "./ActionQueue.css";

const SOURCE = { AUDIT: "Auditoría", RISK: "Riesgo", CONTROL: "Control", FINDING: "Hallazgo" };
const STATUS = { OPEN: "Abierta", IN_PROGRESS: "En curso", DONE: "Terminada", CANCELLED: "Cancelada" };
const NEXT = { OPEN: ["IN_PROGRESS", "DONE", "CANCELLED"], IN_PROGRESS: ["OPEN", "DONE", "CANCELLED"], DONE: ["OPEN"], CANCELLED: ["OPEN"] };
const formatDate = (value) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "Sin fecha";
const formatMoment = (value) => value && !Number.isNaN(Date.parse(value))
  ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "Fecha no disponible";
const historyLabel = (entry) => entry.type === "CREATED" ? "Acción registrada"
  : entry.type === "STATUS_CHANGED" ? `Estado: ${STATUS[entry.from] || entry.from} → ${STATUS[entry.to] || entry.to}`
    : entry.type === "REASSIGNED" ? `Responsable: ${entry.fromName || `cuenta #${entry.fromId}`} → ${entry.toName || `cuenta #${entry.toId}`}`
      : entry.type === "PROGRESS_UPDATED" ? `Avance: ${entry.from} % → ${entry.to} %${entry.evidenceId ? ` · evidencia ${entry.evidenceId}` : ""}`
        : entry.type === "VALIDATION_REQUESTED" ? "Validación solicitada"
          : entry.type === "COMMENTED" ? "Comentario añadido"
      : "Cambio registrado";
const actorLabel = (action, entry) => entry.actorName ||
  (entry.type === "CREATED" && action.createdBy?.id === entry.actorId ? action.createdBy.name : null) ||
  `Cuenta #${entry.actorId}`;
const sourcePath = (action) => action.sourceType === "AUDIT"
  ? `/auditorias-activas/${encodeURIComponent(action.sourceId)}`
  : action.sourceType === "RISK" ? `/riesgos#risk-${encodeURIComponent(action.sourceId)}`
    : action.sourceType === "CONTROL" ? `/controles#control-${encodeURIComponent(action.sourceId)}`
      : `/controles#finding-${encodeURIComponent(action.sourceId)}`;
const initialForm = { sourceKey: "", title: "", rationale: "", dueDate: "", assigneeId: "" };

function ActionQueue({ revision = 0, onActionChanged }) {
  const [query] = useSearchParams();
  const focusedActionId = query.get("actionId");
  const [actions, setActions] = useState([]);
  const [sources, setSources] = useState([]);
  const [assigneeResult, setAssigneeResult] = useState({ key: "", items: [] });
  const [editAssignees, setEditAssignees] = useState([]);
  const [form, setForm] = useState(() => ({ ...initialForm, sourceKey: query.get("sourceType") && query.get("sourceId")
    ? `${query.get("sourceType")}:${query.get("sourceId")}` : "" }));
  const [createOpen, setCreateOpen] = useState(() => Boolean(query.get("sourceType") && query.get("sourceId")));
  const [viewSelection, setViewSelection] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editMode, setEditMode] = useState("STATUS");
  const [nextStatus, setNextStatus] = useState("");
  const [nextAssignee, setNextAssignee] = useState("");
  const [progress, setProgress] = useState("0");
  const [evidenceId, setEvidenceId] = useState("");
  const [planEvidence, setPlanEvidence] = useState([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const user = useMemo(() => { try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; } }, []);
  const manager = !user?.roleTour && ["SUPER_ADMIN", "GERENTE"].includes(user?.role);
  const canCreate = !user?.roleTour && ["SUPER_ADMIN", "GERENTE", "AUDITOR", "JEFATURA"].includes(user?.role);
  const setView = (value) => setViewSelection({ actionId: focusedActionId, value });

  const reload = async () => {
    const actionResult = await getActions();
    setActions(actionResult.actions);
    setLoadError("");
  };

  useEffect(() => {
    let cancelled = false;
    getActions()
      .then((result) => { if (!cancelled) { setActions(result.actions); setLoadError(""); } })
      .catch((cause) => { if (!cancelled) setLoadError(cause.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    getActionSources()
      .then((result) => { if (!cancelled) setSources(result.sources); })
      .catch((cause) => { if (!cancelled && canCreate) setError(`No se pudieron cargar los registros para nuevas acciones: ${cause.message}`); });
    return () => { cancelled = true; };
  }, [revision, canCreate]);

  useEffect(() => {
    if (loading || loadError || !focusedActionId) return undefined;
    const selected = actions.find((action) => action.id === focusedActionId);
    if (!selected) return undefined;
    const frame = requestAnimationFrame(() => {
      const card = document.getElementById(`action-${selected.id}`);
      card?.scrollIntoView({ block: "center" });
      card?.focus();
      const history = card?.querySelector(".action-history");
      if (history) history.open = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [actions, focusedActionId, loading, loadError]);

  useEffect(() => {
    const source = sources.find((item) => `${item.sourceType}:${item.sourceId}` === form.sourceKey);
    if (!source) return;
    let cancelled = false;
    getActionAssignees(source.sourceType, source.sourceId)
      .then((result) => { if (!cancelled) setAssigneeResult({ key: form.sourceKey, items: result.assignees }); })
      .catch((cause) => { if (!cancelled) { setAssigneeResult({ key: form.sourceKey, items: [] }); setError(cause.message); } });
    return () => { cancelled = true; };
  }, [form.sourceKey, sources]);

  const assignees = assigneeResult.key === form.sourceKey ? assigneeResult.items : [];
  const active = actions.filter((item) => !["DONE", "CANCELLED"].includes(item.status));
  const mine = active.filter((item) => item.assigneeId === user?.id);
  const today = localToday();
  const cutoff = localDateAfter(7);
  const overdue = mine.filter((item) => item.dueDate < today);
  const dueSoon = mine.filter((item) => item.dueDate >= today && item.dueDate <= cutoff);
  const dueActions = [...overdue, ...dueSoon].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
  const selectedAction = actions.find((item) => item.id === focusedActionId);
  const focusedView = selectedAction && (["DONE", "CANCELLED"].includes(selectedAction.status) ? "CLOSED"
    : selectedAction.assigneeId === user?.id ? "MINE" : "OPEN");
  const activeView = (viewSelection?.actionId === focusedActionId ? viewSelection.value : null) ?? focusedView ?? "MINE";
  const visible = activeView === "MINE" ? mine : activeView === "DUE" ? dueActions
    : activeView === "OPEN" ? active : actions.filter((item) => ["DONE", "CANCELLED"].includes(item.status));

  const submitCreate = async (event) => {
    event.preventDefault();
    const source = sources.find((item) => `${item.sourceType}:${item.sourceId}` === form.sourceKey);
    if (!source) { setError("Selecciona el registro relacionado."); return; }
    setSaving(true);
    try {
      await createAction({ sourceType: source.sourceType, sourceId: source.sourceId, title: form.title, rationale: form.rationale,
        dueDate: form.dueDate, assigneeId: Number(form.assigneeId) });
      await reload();
      setForm(initialForm);
      setCreateOpen(false);
      setError("");
      setView("OPEN");
      onActionChanged?.();
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };

  const openEdit = async (action, mode) => {
    setEditing(action.id);
    setEditMode(mode);
    setNote("");
    setNextStatus(NEXT[action.status]?.[0] || "");
    setNextAssignee("");
    setProgress(String(action.progressPercent ?? (action.status === "DONE" ? 100 : 0)));
    setEvidenceId("");
    setPlanEvidence([]);
    setEditAssignees([]);
    if (mode === "ASSIGNEE") {
      try {
        const result = await getActionAssignees(action.sourceType, action.sourceId);
        setEditAssignees(result.assignees.filter((person) => person.id !== action.assigneeId));
      } catch (cause) { setError(cause.message); setEditing(null); }
    }
    if (mode === "PROGRESS") {
      try { const result = await getPlanEvidence(action.id); setPlanEvidence(result.evidence); }
      catch (cause) { setError(cause.message); setEditing(null); }
    }
  };

  const submitEdit = async (event, action) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editMode === "STATUS") await changeActionStatus(action.id, { version: action.storageVersion, status: nextStatus, note });
      else if (editMode === "ASSIGNEE") await reassignAction(action.id, { version: action.storageVersion, assigneeId: Number(nextAssignee), note });
      else if (editMode === "PROGRESS") await updatePlanProgress(action.id, { version: action.storageVersion,
        progressPercent: Number(progress), note, ...(evidenceId ? { evidenceId } : {}) });
      else if (editMode === "VALIDATION") await requestPlanValidation(action.id, { version: action.storageVersion, note });
      else await addPlanComment(action.id, { version: action.storageVersion, note });
      await reload();
      setEditing(null);
      setError("");
      onActionChanged?.();
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };

  return <section className="action-queue" aria-labelledby="action-queue-title">
    <div className="action-queue-heading"><div><span className="eyebrow">SEGUIMIENTO CON RESPONSABLE</span><h2 id="action-queue-title">Acciones registradas</h2><p>Compromisos con fecha y estado propios. Leer un aviso no termina una acción.</p></div>
      {canCreate && <button type="button" className="primary-action" onClick={() => setCreateOpen((open) => !open)} aria-expanded={createOpen}><Plus size={16} /> Nueva acción</button>}
    </div>
    <div className="action-queue-summary"><span><b>{loadError ? "—" : mine.length}</b> Asignadas a mí</span><span><b>{loadError ? "—" : overdue.length}</b> Vencidas</span><span><b>{loadError ? "—" : dueSoon.length}</b> Próximos 7 días</span><span><b>{loadError ? "—" : active.length}</b> Abiertas visibles</span></div>
    {loadError && <p role="alert" className="notification-error">No se pudieron consultar las acciones: {loadError}. Los conteos no están disponibles.</p>}
    {error && <p role="alert" className="notification-error">{error}</p>}
    {!loading && !loadError && dueActions.length > 0 && <div className="action-due-alert" role="status">
      <CalendarClock size={19} aria-hidden="true" /><div><strong>Fechas que requieren atención</strong><p>{overdue.length} vencida{overdue.length === 1 ? "" : "s"} · {dueSoon.length} con fecha objetivo en los próximos 7 días, asignadas a tu cuenta.</p></div>
      <button type="button" onClick={() => setView("DUE")}>Ver vencimientos</button>
    </div>}
    {!loading && !loadError && focusedActionId && !actions.some((action) => action.id === focusedActionId) &&
      <p role="status" className="action-queue-empty">El compromiso solicitado no está disponible para esta cuenta.</p>}
    {canCreate && createOpen && <form className="action-form" onSubmit={submitCreate}>
      <h3>Registrar compromiso</h3><p>Elige un registro existente y una persona que pueda verlo. La acción quedará en la bitácora.</p>
      <label>Registro relacionado<select required value={form.sourceKey} onChange={(event) => setForm({ ...form, sourceKey: event.target.value, assigneeId: "" })}><option value="">Seleccionar registro</option>{sources.map((item) => <option key={`${item.sourceType}:${item.sourceId}`} value={`${item.sourceType}:${item.sourceId}`}>{SOURCE[item.sourceType]} · {item.title} ({item.sourceId})</option>)}</select></label>
      <label>{form.sourceKey.startsWith("FINDING:") ? "Acción correctiva" : "Título"}<input required minLength={3} maxLength={140} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
      <label>Responsable<select required value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}><option value="">Seleccionar responsable</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select></label>
      <label>Fecha objetivo<input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
      <label className="action-form-full">Motivo<textarea required minLength={10} maxLength={1000} rows={3} value={form.rationale} onChange={(event) => setForm({ ...form, rationale: event.target.value })} /></label>
      <div className="action-form-actions"><button type="button" className="secondary-action" onClick={() => setCreateOpen(false)}>Cancelar</button><button type="submit" className="primary-action" disabled={saving || !assignees.length}>{saving ? "Guardando…" : "Registrar acción"}</button></div>
    </form>}
    <div className="action-queue-tabs" role="group" aria-label="Filtrar acciones"><button type="button" aria-pressed={activeView === "MINE"} onClick={() => setView("MINE")}>Mis acciones</button><button type="button" aria-pressed={activeView === "DUE"} onClick={() => setView("DUE")}>Vencimientos</button><button type="button" aria-pressed={activeView === "OPEN"} onClick={() => setView("OPEN")}>Abiertas visibles</button><button type="button" aria-pressed={activeView === "CLOSED"} onClick={() => setView("CLOSED")}>Finalizadas</button></div>
    {loading ? <p className="action-queue-empty" role="status">Consultando acciones…</p> : loadError ? null : visible.length === 0 ? <p className="action-queue-empty">{activeView === "DUE" ? "No hay compromisos vencidos ni próximos a vencer asignados a tu cuenta." : "No hay acciones en esta vista."}</p> : <div className="action-queue-list">{visible.map((action) => <article className="action-card" id={`action-${action.id}`} tabIndex={-1} key={action.id}>
      <div className="action-card-top"><span><ClipboardCheck size={17} aria-hidden="true" /> {SOURCE[action.sourceType]} · {action.sourceTitle}</span><strong className={`action-status action-status-${action.status.toLowerCase()}`}>{STATUS[action.status]}</strong></div>
      <h3>{action.title}</h3><p>{action.rationale}</p>
      <div className="action-card-meta"><span>Responsable: <b>{action.assigneeName}</b></span><span><CalendarClock size={14} aria-hidden="true" /> Fecha objetivo: <b>{formatDate(action.dueDate)}</b></span>{!["DONE", "CANCELLED"].includes(action.status) && action.dueDate < today && <span className="action-due-label is-overdue">Vencida</span>}{!["DONE", "CANCELLED"].includes(action.status) && action.dueDate === today && <span className="action-due-label">Vence hoy</span>}{!["DONE", "CANCELLED"].includes(action.status) && action.dueDate > today && action.dueDate <= cutoff && <span className="action-due-label">Próxima</span>}<span>{action.history.length} evento{action.history.length === 1 ? "" : "s"}</span></div>
      {action.sourceType === "FINDING" && <div className="action-plan-progress"><label htmlFor={`progress-${action.id}`}>Plan de remediación · {action.progressPercent ?? (action.status === "DONE" ? 100 : 0)} %</label><progress id={`progress-${action.id}`} max="100" value={action.progressPercent ?? (action.status === "DONE" ? 100 : 0)} />{action.validationRequestedAt && <span>Validación solicitada el {formatMoment(action.validationRequestedAt)}</span>}{(action.evidenceIds || []).length > 0 && <span>{action.evidenceIds.length} evidencia(s) vinculadas · <Link to="/evidencias">Ver evidencias</Link></span>}</div>}
      <div className="action-card-actions"><Link to={sourcePath(action)}>{action.sourceType === "FINDING" ? "Ver hallazgo" : "Abrir registro"}</Link>{(manager || (canCreate && action.assigneeId === user?.id)) && <button type="button" onClick={() => openEdit(action, "STATUS")}>Cambiar estado</button>}{manager && <button type="button" onClick={() => openEdit(action, "ASSIGNEE")}>Reasignar</button>}{action.sourceType === "FINDING" && !["DONE", "CANCELLED"].includes(action.status) && (manager || (canCreate && action.assigneeId === user?.id)) && <><button type="button" onClick={() => openEdit(action, "PROGRESS")}>Actualizar avance</button><button type="button" onClick={() => openEdit(action, "COMMENT")}>Comentar</button></>}{action.sourceType === "FINDING" && action.assigneeId === user?.id && action.progressPercent === 100 && !action.validationRequestedAt && !["DONE", "CANCELLED"].includes(action.status) && <button type="button" onClick={() => openEdit(action, "VALIDATION")}>Solicitar validación</button>}</div>
      <details className="action-history"><summary>Ver bitácora · {action.history.length} evento{action.history.length === 1 ? "" : "s"}</summary>
        <ol>{[...action.history].reverse().map((entry, index) => <li key={`${entry.at}-${entry.type}-${index}`}>
          <div><strong>{historyLabel(entry)}</strong><time dateTime={entry.at}>{formatMoment(entry.at)}</time></div>
          <span>Por {actorLabel(action, entry)}</span>
          {entry.note && <p>{entry.note}</p>}
        </li>)}</ol>
      </details>
      {editing === action.id && <form className="action-edit" onSubmit={(event) => submitEdit(event, action)}><h4>{editMode === "STATUS" ? "Actualizar estado" : editMode === "ASSIGNEE" ? "Cambiar responsable" : editMode === "PROGRESS" ? "Actualizar avance del plan" : editMode === "VALIDATION" ? "Solicitar validación" : "Agregar comentario"}</h4>
        {editMode === "STATUS" ? <label>Nuevo estado<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>{NEXT[action.status]?.map((status) => <option key={status} value={status}>{STATUS[status]}</option>)}</select></label>
          : editMode === "ASSIGNEE" ? <label>Nuevo responsable<select required value={nextAssignee} onChange={(event) => setNextAssignee(event.target.value)}><option value="">Seleccionar responsable</option>{editAssignees.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select></label>
            : editMode === "PROGRESS" ? <><label>Avance (%)<input type="number" required min="0" max="100" step="1" value={progress} onChange={(event) => setProgress(event.target.value)} /></label><label>Evidencia registrada (opcional)<select value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}><option value="">Sin nueva evidencia</option>{planEvidence.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.id}</option>)}</select></label></> : null}
        <label>Explicación<textarea required minLength={10} maxLength={1000} rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <div><button type="button" className="secondary-action" onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="primary-action" disabled={saving || (editMode === "ASSIGNEE" && !nextAssignee)}>{saving ? "Guardando…" : "Guardar cambio"}</button></div>
      </form>}
    </article>)}</div>}
    <p className="action-queue-footnote"><RefreshCw size={13} aria-hidden="true" /> Los estados cambian solo al guardar una decisión humana; el historial conserva quién hizo cada cambio.</p>
  </section>;
}

export default ActionQueue;
