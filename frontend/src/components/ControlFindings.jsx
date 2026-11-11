import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { closeFinding, createFinding, getFindings, reviewFindingClosure } from "../services/findingService";
import { getActions } from "../services/actionService";
import { getEvidence } from "../services/evidenceService";
import { RISK_CONTROL_MANAGE_ROLES } from "../constants/planning";
import "./ControlFindings.css";

const SEVERITIES = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Crítica" };
const STATUS_LABELS = { OPEN: "Abierto", PENDING_CLOSURE: "Pendiente de revisión", CLOSED: "Cerrado" };

function ControlFindings({ controls, risks, audits = [], owners = [], user }) {
  const location = useLocation();
  const [findings, setFindings] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [actions, setActions] = useState(null);
  const [error, setError] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [actionsError, setActionsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [control, setControl] = useState(null);
  const [auditId, setAuditId] = useState("");
  const [controlId, setControlId] = useState("");
  const [riskId, setRiskId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [responsibleId, setResponsibleId] = useState("");
  const [evidenceIds, setEvidenceIds] = useState([]);
  const [closing, setClosing] = useState(null);
  const [closureNote, setClosureNote] = useState("");
  const [reviewing, setReviewing] = useState(null);
  const [reviewReason, setReviewReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    getFindings().then((items) => { if (!cancelled) setFindings(items); })
      .catch((cause) => { if (!cancelled) setError(cause.message); });
    getActions().then((result) => { if (!cancelled) setActions(result.actions); })
      .catch((cause) => { if (!cancelled) setActionsError(cause.message); });
    getEvidence().then((items) => { if (!cancelled) setEvidence(items); })
      .catch((cause) => { if (!cancelled) setEvidenceError(cause.message); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      const target = decodeURIComponent(location.hash.slice(1));
      if (target.startsWith("finding-")) document.getElementById(target)?.scrollIntoView({ block: "center" });
    } catch { /* Un fragmento inválido no altera los hallazgos. */ }
  }, [location.hash, findings]);

  const canCreate = RISK_CONTROL_MANAGE_ROLES.includes(user?.role) || user?.role === "AUDITOR";
  const canReview = RISK_CONTROL_MANAGE_ROLES.includes(user?.role);
  const availableEvidence = useMemo(() => evidence.filter((item) =>
    (auditId && item.entityType === "AUDIT" && item.entityId === auditId) ||
    (riskId && item.entityType === "RISK" && item.entityId === riskId) ||
    (controlId && item.entityType === "CONTROL" && item.entityId === controlId)), [evidence, auditId, riskId, controlId]);

  const open = (item = null) => {
    setControl(item || {});
    setControlId(item?.id || "");
    setRiskId(item ? risks.find((risk) => item.riskIds.includes(risk.id))?.id || "" : "");
    setAuditId("");
    setTitle(""); setDescription(""); setRootCause(""); setSeverity("MEDIUM");
    setResponsibleId(String(user?.id || "")); setEvidenceIds([]); setError("");
  };
  const setUpdatedFinding = (updated) => {
    if (!updated?.id) throw new Error("La API no confirmó el cambio. Actualiza el hallazgo antes de intentarlo de nuevo.");
    setFindings((current) => current.map((item) => item.id === updated.id ? updated : item));
  };
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const finding = await createFinding({
        auditId: auditId || null, controlId: controlId || null, riskId: riskId || null,
        title, description, rootCause, severity, responsibleId: Number(responsibleId), evidenceIds
      });
      setFindings((current) => [finding, ...current]);
      setControl(null);
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  const submitClosure = async (event) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      setUpdatedFinding(await closeFinding(closing.id, closing.storageVersion, closureNote));
      setClosing(null); setClosureNote("");
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  const submitReview = async (event) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      setUpdatedFinding(await reviewFindingClosure(reviewing.id, reviewing.decision,
        reviewing.storageVersion, reviewReason));
      setReviewing(null); setReviewReason("");
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  const responsibleOptions = owners.some((owner) => String(owner.id) === String(user?.id))
    ? owners : [...owners, { id: user?.id, name: user?.name || user?.username, role: user?.role }];

  return <section className="control-findings" aria-labelledby="control-findings-title">
    <div className="control-section-heading"><div><span className="eyebrow">SEGUIMIENTO</span><h2 id="control-findings-title">Hallazgos</h2></div><span>{findings.length} registrados</span></div>
    <p>Registra la desviación, su causa raíz, severidad, responsable y relaciones. Una solicitud de cierre requiere revisión de Super Admin o Gerencia.</p>
    {error && !control && !closing && !reviewing && <p className="control-feedback error" role="alert">{error}</p>}
    {canCreate && <button type="button" className="secondary-action finding-create" onClick={() => open()}>
      Registrar hallazgo
    </button>}
    {canCreate && controls.filter((item) => item.effectiveness < 4 &&
      item.riskIds.some((id) => risks.some((risk) => risk.id === id))).map((item) =>
      <button key={item.id} type="button" className="secondary-action finding-create" onClick={() => open(item)}>
        Registrar hallazgo · {item.id} {item.title}
      </button>)}
    {findings.length === 0 ? <p className="control-empty">No hay hallazgos registrados para los registros visibles.</p> :
      <div className="finding-list">{findings.map((item) => {
        const plan = actions?.filter((action) => action.sourceType === "FINDING" && action.sourceId === item.id) || [];
        const ready = plan.length > 0 && plan.every((action) => ["DONE", "CANCELLED"].includes(action.status));
        const latestRequest = item.closureHistory?.at(-1);
        const ownRequest = String(latestRequest?.requestedBy?.id) === String(user?.id);
        const linkedEvidence = item.evidenceIds || [];
        return <article key={item.id} id={`finding-${item.id}`} className="finding-card">
          <strong>{item.id} · {item.title}</strong><span>{STATUS_LABELS[item.status] || item.status}</span>
          <p>{item.description}</p>
          <small>Causa raíz: {item.rootCause || "No documentada"} · Severidad: {SEVERITIES[item.severity] || "Sin clasificar"} · Responsable: {item.responsibleName || (item.responsibleId ? `ID ${item.responsibleId}` : "Sin asignar")}</small>
          <small>{item.auditId && <>Auditoría {item.auditId}{item.auditTitle ? `: ${item.auditTitle}` : ""} · </>}
            {item.controlId && <>Control {item.controlId}{item.controlTitle ? `: ${item.controlTitle}` : ""} · </>}
            {item.riskId && <>Riesgo {item.riskId}{item.riskTitle ? `: ${item.riskTitle}` : ""}</>}
          </small>
          <small>Registrado por {item.createdBy?.username || "Usuario registrado"} · {new Date(item.createdAt).toLocaleString("es-MX")}</small>
          {linkedEvidence.length > 0 && <small>Evidencia: {linkedEvidence.map((id) =>
            evidence.find((entry) => entry.id === id)?.title || id).join(", ")}</small>}
          {item.closureHistory?.map((entry) => <small key={entry.version}>
            {entry.status === "PENDING" ? `Cierre solicitado por ${entry.requestedBy?.username || "usuario"} el ${new Date(entry.requestedAt).toLocaleString("es-MX")}: ${entry.note}`
              : `Cierre ${entry.status === "APPROVED" ? "aprobado" : "rechazado"} por ${entry.decidedBy?.username || "usuario"} el ${new Date(entry.decidedAt).toLocaleString("es-MX")}${entry.decisionReason ? `. Motivo: ${entry.decisionReason}` : ""}`}
          </small>)}
          {item.status === "CLOSED" ? <small>Cerrado el {item.closedAt && new Date(item.closedAt).toLocaleString("es-MX")}.</small>
            : <div className="finding-followup">
              <small>{actionsError ? "No se pudo consultar el plan de acción; actualiza para volver a intentar." : actions === null ? "Consultando plan de acción…" : `${plan.filter((action) => action.status === "DONE").length} terminadas · ${plan.filter((action) => action.status === "CANCELLED").length} canceladas · ${plan.length} acciones`}</small>
              <Link to={`/notificaciones?sourceType=FINDING&sourceId=${encodeURIComponent(item.id)}`}>Ver plan de acción</Link>
              {item.status === "OPEN" && canCreate && ready && <button className="secondary-action" type="button" onClick={() => { setClosing(item); setClosureNote(""); setError(""); }}>Solicitar cierre</button>}
              {item.status === "PENDING_CLOSURE" && canReview && !ownRequest && <>
                <button className="secondary-action" type="button" onClick={() => { setReviewing({ ...item, decision: "APPROVE" }); setReviewReason(""); setError(""); }}>Aprobar cierre</button>
                <button className="secondary-action" type="button" onClick={() => { setReviewing({ ...item, decision: "REJECT" }); setReviewReason(""); setError(""); }}>Rechazar cierre</button>
              </>}
            </div>}
        </article>;
      })}</div>}
    {closing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClosing(null); }}>
      <form className="proposal-modal control-modal finding-modal" onSubmit={submitClosure} aria-label="Solicitar cierre de hallazgo">
        <h2>Solicitar cierre de {closing.id}</h2>
        <p>La solicitud quedará pendiente de aprobación por Super Admin o Gerencia.</p>
        {error && <p className="control-feedback error" role="alert">{error}</p>}
        <label>Conclusión de la solicitud<textarea required minLength={10} maxLength={1000} value={closureNote} onChange={(event) => setClosureNote(event.target.value)} /></label>
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setClosing(null)}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando…" : "Enviar a revisión"}</button></div>
      </form>
    </div>}
    {reviewing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewing(null); }}>
      <form className="proposal-modal control-modal finding-modal" onSubmit={submitReview} aria-label={reviewing.decision === "REJECT" ? "Rechazar cierre" : "Aprobar cierre"}>
        <h2>{reviewing.decision === "REJECT" ? "Rechazar" : "Aprobar"} cierre de {reviewing.id}</h2>
        <p>La decisión, el usuario y la fecha se conservarán en el historial del hallazgo.</p>
        {error && <p className="control-feedback error" role="alert">{error}</p>}
        <label>{reviewing.decision === "REJECT" ? "Motivo del rechazo" : "Comentario de revisión (opcional)"}
          <textarea required={reviewing.decision === "REJECT"} maxLength={1000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} />
        </label>
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setReviewing(null)}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando…" : reviewing.decision === "REJECT" ? "Confirmar rechazo" : "Confirmar aprobación"}</button></div>
      </form>
    </div>}
    {control !== null && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setControl(null); }}>
      <form className="proposal-modal control-modal finding-modal" onSubmit={submit} aria-label="Registrar hallazgo">
        <h2>Registrar hallazgo</h2><p>Documenta la desviación y vincúlala con al menos una auditoría, un riesgo o un control.</p>
        {error && <p className="control-feedback error" role="alert">{error}</p>}
        <label>Auditoría<select value={auditId} onChange={(event) => { setAuditId(event.target.value); setEvidenceIds([]); }}>
          <option value="">Sin auditoría</option>{audits.map((audit) =>
            <option key={audit.id} value={audit.id}>{audit.id} · {audit.title}</option>)}
        </select></label>
        <label>Riesgo<select value={riskId} onChange={(event) => { setRiskId(event.target.value); setEvidenceIds([]); }}>
          <option value="">Sin riesgo</option>{risks.map((risk) =>
            <option key={risk.id} value={risk.id}>{risk.id} · {risk.title}</option>)}
        </select></label>
        <label>Control<select value={controlId} onChange={(event) => { setControlId(event.target.value); setEvidenceIds([]); }}>
          <option value="">Sin control</option>{controls.map((item) =>
            <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}
        </select></label>
        <label>Título<input required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Severidad<select required value={severity} onChange={(event) => setSeverity(event.target.value)}>
          {Object.entries(SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Responsable<select required value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)}>
          {responsibleOptions.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
        </select></label>
        <label className="full-width">Descripción<textarea required minLength={10} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="full-width">Causa raíz<textarea required minLength={10} maxLength={2000} value={rootCause} onChange={(event) => setRootCause(event.target.value)} /></label>
        <fieldset className="risk-link-picker full-width"><legend>Evidencia asociada (opcional)</legend>
          {evidenceError && <p className="control-feedback error" role="alert">{evidenceError}</p>}
          {availableEvidence.map((entry) => <label key={entry.id}><input type="checkbox" checked={evidenceIds.includes(entry.id)}
            onChange={(event) => setEvidenceIds((current) => event.target.checked
              ? [...current, entry.id] : current.filter((id) => id !== entry.id))} />{entry.title}</label>)}
          {!evidenceError && availableEvidence.length === 0 && <small>Selecciona una relación con evidencia registrada para mostrarla aquí.</small>}
        </fieldset>
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setControl(null)}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={saving || !auditId && !riskId && !controlId}>{saving ? "Guardando…" : "Registrar hallazgo"}</button></div>
      </form>
    </div>}
  </section>;
}

export default ControlFindings;
