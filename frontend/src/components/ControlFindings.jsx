import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { closeFinding, createFinding, decideFindingClosure, getFindings } from "../services/findingService";
import { getActions } from "../services/actionService";
import { RISK_CONTROL_MANAGE_ROLES } from "../constants/planning";
import "./ControlFindings.css";

const EMPTY_FINDING = {
  title: "", description: "", rootCause: "", severity: "MEDIUM",
  assigneeId: "", auditId: "", riskId: "", controlId: ""
};
const SEVERITIES = [
  ["CRITICAL", "Crítica"], ["HIGH", "Alta"], ["MEDIUM", "Media"], ["LOW", "Baja"]
];
const STATUS_LABELS = {
  OPEN: "Abierto", PENDING_VALIDATION: "Pendiente de validación", CLOSED: "Cerrado"
};
const isManager = (role) => RISK_CONTROL_MANAGE_ROLES.includes(role);

function ControlFindings({ controls, risks, audits, owners, role, currentUser }) {
  const location = useLocation();
  const [findings, setFindings] = useState([]);
  const [draft, setDraft] = useState(null);
  const [findingsLoading, setFindingsLoading] = useState(true);
  const [findingsError, setFindingsError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [actions, setActions] = useState(null);
  const [actionsError, setActionsError] = useState("");
  const [closing, setClosing] = useState(null);
  const [closureNote, setClosureNote] = useState("");
  const [reviewing, setReviewing] = useState(null);
  const [decisionNote, setDecisionNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    getFindings().then((items) => { if (!cancelled) setFindings(items); })
      .catch((cause) => { if (!cancelled) setFindingsError(cause.message); })
      .finally(() => { if (!cancelled) setFindingsLoading(false); });
    getActions().then((result) => { if (!cancelled) { setActions(result.actions); setActionsError(""); } })
      .catch((cause) => { if (!cancelled) setActionsError(cause.message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    try {
      const target = decodeURIComponent(location.hash.slice(1));
      if (target.startsWith("finding-")) document.getElementById(target)?.scrollIntoView({ block: "center" });
    } catch { /* Un fragmento inválido no altera los hallazgos. */ }
  }, [location.hash, findings]);

  const canCreate = isManager(role) || role === "AUDITOR";
  const canReview = role === "SUPER_ADMIN";
  const openCreate = (control = null) => {
    setDraft({ ...EMPTY_FINDING,
      assigneeId: String(role === "AUDITOR" ? currentUser?.id ?? "" : owners[0]?.id ?? ""),
      controlId: control?.id || "",
      riskId: control ? String(risks.find((risk) => control.riskIds.includes(risk.id))?.id || "") : "",
      auditId: control ? String(risks.find((risk) => control.riskIds.includes(risk.id))?.linkedAuditId || "") : ""
    });
    setError("");
  };
  const updateFinding = (updated) => setFindings((current) =>
    current.map((item) => item.id === updated.id ? updated : item));
  const submitCreate = async (event) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const finding = await createFinding({ ...draft,
        assigneeId: role === "AUDITOR" ? currentUser?.id : Number(draft.assigneeId) });
      setFindings((current) => [finding, ...current]);
      setDraft(null);
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  const submitClosure = async (event) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const updated = await closeFinding(closing.id, closing.storageVersion, closureNote);
      if (!updated?.id) throw new Error("La API no confirmó la solicitud. Actualiza el hallazgo antes de intentarlo de nuevo.");
      updateFinding(updated);
      setClosing(null); setClosureNote("");
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  const submitDecision = async (event) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const updated = await decideFindingClosure(reviewing.id, reviewing.storageVersion,
        reviewing.decision, decisionNote);
      updateFinding(updated);
      setReviewing(null); setDecisionNote("");
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };

  return <section className="control-findings" aria-labelledby="control-findings-title">
    <div className="control-section-heading">
      <div><span className="eyebrow">SEGUIMIENTO</span><h2 id="control-findings-title">Hallazgos</h2></div>
      <span>{findings.length} registrados</span>
    </div>
    <p>Documenta la desviación, su causa raíz y severidad. El cierre requiere validación independiente de Super Admin.</p>
    <div className="finding-toolbar">
      {canCreate && <button className="primary-action" type="button" onClick={() => openCreate()}>Registrar hallazgo</button>}
      {findingsError && <p className="control-feedback error" role="alert">{findingsError}</p>}
      {error && !draft && !closing && !reviewing && <p className="control-feedback error" role="alert">{error}</p>}
    </div>
    {canCreate && controls.filter((item) => item.effectivenessResult === "INEFFECTIVE" &&
      item.riskIds.some((id) => risks.some((risk) => risk.id === id))).map((item) =>
      <button key={item.id} type="button" className="secondary-action finding-create" onClick={() => openCreate(item)}>
        Registrar desde el control · {item.id} {item.title}
      </button>)}
    {findingsLoading ? <p className="control-empty">Cargando hallazgos…</p> :
      findingsError ? null : findings.length === 0 ? <p className="control-empty">No hay hallazgos para los registros visibles.</p> :
      <div className="finding-list">{findings.map((item) => {
        const plan = actions?.filter((action) => action.sourceType === "FINDING" && action.sourceId === item.id) || [];
        const ready = plan.length > 0 && plan.every((action) => action.status === "DONE");
        const relations = [
          item.auditId && `Auditoría ${item.auditId}: ${item.auditTitle}`,
          item.riskId && `Riesgo ${item.riskId}: ${item.riskTitle}`,
          item.controlId && `Control ${item.controlId}: ${item.controlTitle}`
        ].filter(Boolean);
        return <article key={item.id} id={`finding-${item.id}`} className="finding-card">
          <div className="finding-card-heading">
            <strong>{item.id} · {item.title}</strong>
            <span className={`finding-status finding-status-${item.status.toLowerCase()}`}>{STATUS_LABELS[item.status] || item.status}</span>
          </div>
          <p>{item.description}</p>
          {item.rootCause && <small><b>Causa raíz:</b> {item.rootCause}</small>}
          {item.severity && <small><b>Severidad:</b> {SEVERITIES.find(([value]) => value === item.severity)?.[1] || item.severity}</small>}
          {item.assigneeName && <small><b>Responsable:</b> {item.assigneeName}</small>}
          {relations.map((relation) => <small key={relation}>{relation}</small>)}
          <small>Registrado {new Date(item.createdAt).toLocaleString("es-MX")} · por {item.createdBy?.username || "Usuario registrado"}</small>
          {item.status === "PENDING_VALIDATION" && <small>
            Cierre solicitado por {item.closureRequest?.requestedBy?.username || "Usuario registrado"} · {item.closureRequest?.note}
          </small>}
          {(item.closureHistory?.length ? item.closureHistory :
            item.closureDecision ? [item.closureDecision] : []).map((decision, index) => <small key={`${decision.decidedAt}-${index}`}>
              {decision.decision === "APPROVE" ? "Cierre aprobado" : "Cierre rechazado"} por {decision.decidedBy?.username || "Usuario registrado"} · {new Date(decision.decidedAt).toLocaleString("es-MX")}
              {decision.note && ` · ${decision.note}`}
            </small>)}
          {item.status === "CLOSED" && item.closedAt && <small>Cerrado el {new Date(item.closedAt).toLocaleString("es-MX")}</small>}
          <div className="finding-followup">
            {item.status === "OPEN" && <>
              <small>{actionsError ? "No se pudo consultar el plan de acción; actualiza para volver a intentar." : actions === null ? "Consultando plan de acción…" : `${plan.filter((action) => action.status === "DONE").length}/${plan.length} acciones terminadas`}</small>
              <Link to={`/notificaciones?sourceType=FINDING&sourceId=${encodeURIComponent(item.id)}`}>Ver plan de acción</Link>
              <Link to={`/evidencias?entityType=FINDING&entityId=${encodeURIComponent(item.id)}`}>Adjuntar evidencia</Link>
              {canCreate && ready && <button className="secondary-action" type="button" onClick={() => { setClosing(item); setClosureNote(""); setError(""); }}>Solicitar cierre</button>}
            </>}
            {item.status === "PENDING_VALIDATION" && canReview &&
              item.closureRequest?.requestedBy?.id !== currentUser?.id && item.assigneeId !== currentUser?.id && <>
                <button className="secondary-action" type="button" onClick={() => { setReviewing({ ...item, decision: "APPROVE" }); setDecisionNote(""); setError(""); }}>Aprobar cierre</button>
                <button className="secondary-action" type="button" onClick={() => { setReviewing({ ...item, decision: "REJECT" }); setDecisionNote(""); setError(""); }}>Rechazar cierre</button>
              </>}
          </div>
        </article>;
      })}</div>}
    {draft && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null); }}>
      <form className="proposal-modal control-modal finding-modal" onSubmit={submitCreate} aria-label="Registrar hallazgo">
        <h2>Registrar hallazgo</h2>
        <p>Relaciona el hallazgo con al menos una auditoría, un riesgo o un control.</p>
        {error && <p className="control-feedback error" role="alert">{error}</p>}
        <label>Título<input required minLength="3" maxLength="120" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>Descripción<textarea required minLength="10" maxLength="2000" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label>Causa raíz<textarea required minLength="10" maxLength="2000" value={draft.rootCause} onChange={(event) => setDraft({ ...draft, rootCause: event.target.value })} /></label>
        <label>Severidad<select required value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value })}>
          {SEVERITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {role === "AUDITOR" ? <p>Responsable: {currentUser?.name || currentUser?.username || "Tu cuenta"}</p> :
          <label>Responsable<select required value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}>
            <option value="">Selecciona un responsable</option>
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.role}</option>)}
          </select></label>}
        <label>Auditoría relacionada<select value={draft.auditId} onChange={(event) => setDraft({ ...draft, auditId: event.target.value })}>
          <option value="">Sin auditoría</option>{audits.map((audit) =>
            <option key={audit.id} value={audit.id}>{audit.id} · {audit.title}</option>)}
        </select></label>
        <label>Riesgo relacionado<select value={draft.riskId} onChange={(event) => setDraft({ ...draft, riskId: event.target.value })}>
          <option value="">Sin riesgo</option>{risks.map((risk) =>
            <option key={risk.id} value={risk.id}>{risk.id} · {risk.title}</option>)}
        </select></label>
        <label>Control relacionado<select value={draft.controlId} onChange={(event) => setDraft({ ...draft, controlId: event.target.value })}>
          <option value="">Sin control</option>{controls.map((control) =>
            <option key={control.id} value={control.id}>{control.id} · {control.title}</option>)}
        </select></label>
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={() => { setDraft(null); setError(""); }}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando…" : "Registrar hallazgo"}</button></div>
      </form>
    </div>}
    {closing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClosing(null); }}>
      <form className="proposal-modal control-modal finding-modal" onSubmit={submitClosure} aria-label="Solicitar cierre">
        <h2>Solicitar cierre de {closing.id}</h2>
        <p>La solicitud será revisada por una persona Super Admin distinta del solicitante y responsable.</p>
        {error && <p className="control-feedback error" role="alert">{error}</p>}
        <label>Conclusión y sustento<textarea required minLength="10" maxLength="1000" value={closureNote} onChange={(event) => setClosureNote(event.target.value)} /></label>
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setClosing(null)}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={saving}>{saving ? "Enviando…" : "Enviar a validación"}</button></div>
      </form>
    </div>}
    {reviewing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewing(null); }}>
      <form className="proposal-modal control-modal finding-modal" onSubmit={submitDecision} aria-label="Validar cierre">
        <h2>{reviewing.decision === "APPROVE" ? "Aprobar" : "Rechazar"} cierre de {reviewing.id}</h2>
        <p>La decisión, el usuario y la fecha quedarán registrados.</p>
        {error && <p className="control-feedback error" role="alert">{error}</p>}
        <label>{reviewing.decision === "REJECT" ? "Motivo del rechazo" : "Observación (opcional)"}
          <textarea required={reviewing.decision === "REJECT"} minLength={reviewing.decision === "REJECT" ? 10 : 0} maxLength="1000" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} />
        </label>
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setReviewing(null)}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando…" : reviewing.decision === "APPROVE" ? "Confirmar aprobación" : "Confirmar rechazo"}</button></div>
      </form>
    </div>}
  </section>;
}

export default ControlFindings;
