import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { closeFinding, createFinding, getFindings } from "../services/findingService";
import { getActions } from "../services/actionService";
import { RISK_CONTROL_MANAGE_ROLES } from "../constants/planning";
import "./ControlFindings.css";

function ControlFindings({ controls, risks, role }) {
  const location = useLocation();
  const [findings, setFindings] = useState([]);
  const [control, setControl] = useState(null);
  const [riskId, setRiskId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [actions, setActions] = useState(null);
  const [actionsError, setActionsError] = useState("");
  const [closing, setClosing] = useState(null);
  const [closureNote, setClosureNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    getFindings().then((items) => { if (!cancelled) setFindings(items); })
      .catch((cause) => { if (!cancelled) setError(cause.message); });
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

  const canCreate = RISK_CONTROL_MANAGE_ROLES.includes(role) || role === "AUDITOR";
  const open = (item) => {
    setControl(item);
    setRiskId(risks.find((risk) => item.riskIds.includes(risk.id))?.id || "");
    setTitle(""); setDescription(""); setError("");
  };
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const finding = await createFinding({ controlId: control.id, riskId, title, description });
      setFindings((current) => [finding, ...current]);
      setControl(null);
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  const submitClosure = async (event) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const updated = await closeFinding(closing.id, closing.storageVersion, closureNote);
      if (!updated?.id) throw new Error("La API no confirmó el cierre. Actualiza el hallazgo antes de intentarlo de nuevo.");
      setFindings((current) => current.map((item) => item.id === updated.id ? updated : item));
      setClosing(null); setClosureNote("");
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };

  return <section className="control-findings" aria-labelledby="control-findings-title">
    <div className="control-section-heading"><div><span className="eyebrow">SEGUIMIENTO</span><h2 id="control-findings-title">Hallazgos de controles</h2></div><span>{findings.length} registrados</span></div>
    <p>La regla histórica permite registrar un hallazgo cuando la última calificación del control es de 1 a 3. Esa calificación no sustituye una prueba documentada de diseño u operación.</p>
    {error && !control && <p className="control-feedback error" role="alert">{error}</p>}
    {canCreate && controls.filter((item) => item.effectiveness < 4 && item.riskIds.some((id) => risks.some((risk) => risk.id === id))).map((item) =>
      <button key={item.id} type="button" className="secondary-action finding-create" onClick={() => open(item)}>
        Registrar hallazgo · {item.id} {item.title}
      </button>)}
    {findings.length === 0 ? <p className="control-empty">No hay hallazgos registrados para los controles visibles.</p> :
      <div className="finding-list">{findings.map((item) => {
        const plan = actions?.filter((action) => action.sourceType === "FINDING" && action.sourceId === item.id) || [];
        const ready = plan.length > 0 && plan.every((action) => action.status === "DONE");
        return <article key={item.id} id={`finding-${item.id}`} className="finding-card">
          <strong>{item.id} · {item.title}</strong><span>{item.status === "OPEN" ? "Abierto" : "Cerrado"}</span>
          <p>{item.description}</p><small>Control {item.controlId}: {item.controlTitle} · Riesgo {item.riskId}: {item.riskTitle}</small>
          <small>Evaluación v{item.evaluationVersion} · {new Date(item.createdAt).toLocaleString("es-MX")}</small>
          {item.status === "CLOSED" ? <small>Cerrado por {item.closedBy?.username || "Usuario registrado"} el {new Date(item.closedAt).toLocaleString("es-MX")}. Motivo: {item.closureNote}</small>
            : <div className="finding-followup">
              <small>{actionsError ? "No se pudo consultar el plan de acción; actualiza para volver a intentar." : actions === null ? "Consultando plan de acción…" : `${plan.filter((action) => action.status === "DONE").length}/${plan.length} acciones terminadas`}</small>
              <Link to={`/notificaciones?sourceType=FINDING&sourceId=${encodeURIComponent(item.id)}`}>Ver plan de acción</Link>
              {canCreate && ready && <button className="secondary-action" type="button" onClick={() => { setClosing(item); setClosureNote(""); setError(""); }}>Cerrar hallazgo</button>}
            </div>}
        </article>;
      })}</div>}
    {closing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClosing(null); }}>
      <form className="proposal-modal control-modal finding-modal" onSubmit={submitClosure} aria-label="Cerrar hallazgo">
        <h2>Cerrar {closing.id}</h2>
        <p>Confirma el resultado de las acciones terminadas. El cierre quedará en la bitácora.</p>
        {error && <p className="control-feedback error" role="alert">{error}</p>}
        <label>Conclusión del cierre<textarea required minLength={10} maxLength={1000} value={closureNote} onChange={(event) => setClosureNote(event.target.value)} /></label>
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setClosing(null)}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando…" : "Confirmar cierre"}</button></div>
      </form>
    </div>}
    {control && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setControl(null); }}>
      <form className="proposal-modal control-modal finding-modal" onSubmit={submit} aria-label="Registrar hallazgo">
        <h2>Hallazgo de {control.id}</h2><p>Evalúa la observación y selecciona el riesgo relacionado.</p>
        {error && <p className="control-feedback error" role="alert">{error}</p>}
        <label>Riesgo<select required value={riskId} onChange={(event) => setRiskId(event.target.value)}>
          <option value="">Seleccionar riesgo</option>{risks.filter((risk) => control.riskIds.includes(risk.id)).map((risk) =>
            <option key={risk.id} value={risk.id}>{risk.id} · {risk.title}</option>)}
        </select></label>
        <label>Título<input required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Descripción<textarea required minLength={10} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setControl(null)}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando..." : "Registrar hallazgo"}</button></div>
      </form>
    </div>}
  </section>;
}

export default ControlFindings;
