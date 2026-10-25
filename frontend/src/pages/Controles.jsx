import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Activity, Bot, CheckCircle2, ClipboardCheck, Pencil, Plus, Shield, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import AssistantDrawer from "../components/AssistantDrawer";
import ControlFindings from "../components/ControlFindings";
import { RISK_CONTROL_MANAGE_ROLES } from "../constants/planning";
import { createControl, evaluateControl, getControls, updateControl } from "../services/controlService";
import { getRisks, getRiskOwners } from "../services/riskService";
import "./Controles.css";

const EMPTY = { title: "", description: "", type: "PREVENTIVE", frequency: "Monthly", ownerId: "", riskIds: [], rating: 3, note: "" };
const TYPES = { PREVENTIVE: "Preventivo", DETECTIVE: "Detectivo", CORRECTIVE: "Correctivo" };
const RATING_LABELS = ["Muy débil", "Débil", "Parcial", "Favorable", "Muy favorable"];

function Controles() {
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const canManage = RISK_CONTROL_MANAGE_ROLES.includes(user?.role);
  const [controls, setControls] = useState([]);
  const [risks, setRisks] = useState([]);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [evaluating, setEvaluating] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [assistantFocus, setAssistantFocus] = useState(null);

  const load = async () => {
    const [allControls, allRisks] = await Promise.all([getControls(), getRisks()]);
    setControls(allControls);
    setRisks(allRisks);
  };
  useEffect(() => {
    Promise.all([getControls(), getRisks(), canManage ? getRiskOwners() : Promise.resolve([])])
      .then(([allControls, allRisks, activeOwners]) => { setControls(allControls); setRisks(allRisks); setOwners(activeOwners); })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, [canManage]);
  useEffect(() => {
    try {
      const target = decodeURIComponent(location.hash.slice(1));
      if (target.startsWith("control-")) document.getElementById(target)?.scrollIntoView({ block: "center" });
    } catch { /* Un fragmento inválido no altera los controles. */ }
  }, [location.hash, controls]);

  const linkedRiskIds = useMemo(() => new Set(controls.flatMap((control) => control.riskIds)), [controls]);
  const coveredRisks = risks.filter((risk) => linkedRiskIds.has(risk.id)).length;
  const assessments = controls.reduce((sum, control) => sum + control.evaluations.length, 0);

  const openCreate = () => { setEditing(null); setEvaluating(null); setForm({ ...EMPTY, riskIds: risks.slice(0, 1).map((risk) => risk.id) }); setError(""); setModal(true); };
  const openEdit = (control) => { setEditing(control); setEvaluating(null); setForm({ title: control.title, description: control.description, type: control.type, frequency: control.frequency, ownerId: String(control.ownerId), riskIds: control.riskIds, rating: control.effectiveness, note: "" }); setError(""); setModal(true); };
  const openEvaluation = (control) => { setEvaluating(control); setEditing(null); setForm({ rating: control.effectiveness, note: "" }); setError(""); setModal(true); };
  const closeModal = () => { setModal(false); setEditing(null); setEvaluating(null); setError(""); };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (evaluating) await evaluateControl(evaluating.id, form);
      else if (editing) await updateControl(editing.id, form);
      else await createControl(form);
      await load(); setMessage(evaluating ? "Evaluación añadida al historial." : editing ? "Control actualizado." : "Control registrado."); closeModal();
    } catch (submitError) { setError(submitError.message); }
    finally { setSaving(false); }
  };
  const toggleRisk = (riskId) => setForm((current) => ({ ...current, riskIds: current.riskIds.includes(riskId) ? current.riskIds.filter((id) => id !== riskId) : [...current.riskIds, riskId] }));

  return <div className="dashboard-layout">
    <Sidebar active="controles" />
    <main className="dashboard-main"><section className="dashboard-content controls-page">
      <header className="dashboard-header"><div><span className="eyebrow">RELACIONES Y VALORACIONES</span><h1>Mapa de controles</h1><p>Consulta qué controles se vinculan a los riesgos y su historial de valoraciones preliminares.</p></div>{canManage && <button className="primary-action" onClick={openCreate} disabled={!risks.length}><Plus size={18} /> Nuevo control</button>}</header>
      {message && <p className="control-feedback success">{message}</p>}{error && !modal && <p className="control-feedback error">{error}</p>}
      <div className="control-kpis"><article><span>Controles registrados</span><strong>{controls.length}</strong><small>en los expedientes visibles</small></article><article><span>Riesgos con vínculo</span><strong>{coveredRisks} / {risks.length}</strong><small>vínculo declarado con al menos un control</small></article><article><span>Valoraciones registradas</span><strong>{assessments}</strong><small>incluye la valoración inicial de cada control</small></article></div>
      <section className="coverage-panel"><div className="control-section-heading"><div><span className="eyebrow">RELACIONES VISIBLES</span><h2>Matriz de vínculos</h2></div><span>{risks.length} riesgos · {controls.length} controles</span></div>
        <p className="coverage-qualification">Un vínculo y una calificación preliminar no demuestran que el control opere, reduzca el riesgo o cumpla una obligación. Eso requiere una prueba documentada.</p>
        {loading ? <p className="control-empty">Cargando matriz...</p> : !risks.length ? <div className="control-empty"><Shield size={22} /><div><b>Primero registra un riesgo</b><p>La matriz se construye con los riesgos y controles visibles. Un vínculo no demuestra eficacia.</p></div></div> : !controls.length ? <div className="control-empty"><Shield size={22} /><div><b>Aún no hay controles vinculados</b><p>Agrega un control para empezar a visualizar las relaciones con riesgos.</p></div></div> : <div className="coverage-scroll"><table className="coverage-matrix"><thead><tr><th>Riesgo</th>{controls.map((control) => <th key={control.id}><span>{control.id}</span>{control.title}</th>)}</tr></thead><tbody>{risks.map((risk) => <tr key={risk.id}><th><span className={`risk-badge risk-${risk.level.toLowerCase()}`}>{risk.level}</span><b>{risk.title}</b><small>{risk.area}</small></th>{controls.map((control) => { const linked = control.riskIds.includes(risk.id); const rating = linked ? control.effectiveness : null; return <td key={control.id} className={linked ? "coverage-linked" : "coverage-none"}>{rating === null ? "—" : <><strong>{rating}/5</strong><small>Valoración</small></>}</td>; })}</tr>)}</tbody></table><p className="coverage-legend"><span className="coverage-linked">1–5 · valoración preliminar</span><span className="coverage-none">— sin vínculo</span></p></div>}
      </section>
      <div className="control-section-heading control-list-heading"><div><span className="eyebrow">DETALLE OPERATIVO</span><h2>Controles registrados</h2></div><span>{controls.length} controles</span></div>
      {loading ? null : controls.length === 0 ? <div className="control-empty">Los controles registrados aparecerán aquí.</div> : <div className="control-list">{controls.map((control) => <article className="control-card" id={`control-${control.id}`} key={control.id}><div className="control-card-icon"><ClipboardCheck size={21} /></div><div className="control-card-content"><div className="control-card-top"><span className="control-id">{control.id}</span><span className="control-type">{TYPES[control.type]}</span><span className="effectiveness-pill">{RATING_LABELS[control.effectiveness - 1]} · {control.effectiveness}/5</span></div><h3>{control.title}</h3><p>{control.description}</p><div className="control-card-meta"><span><b>Responsable:</b> {control.ownerName}</span><span><b>Frecuencia:</b> {control.frequency}</span><span><b>Riesgos vinculados:</b> {control.riskIds.length}</span><span><b>Valoraciones:</b> {control.evaluations.length}</span></div><details className="control-history"><summary><Activity size={15} /> Historial de valoraciones</summary><ol>{[...control.evaluations].reverse().map((evaluation) => <li key={evaluation.version}><b>Versión {evaluation.version} · calificación {evaluation.rating}/5</b><p>{evaluation.note}</p><small>{evaluation.assessedBy.username} · {new Date(evaluation.assessedAt).toLocaleString("es-MX")}</small></li>)}</ol></details></div><div className="control-actions"><button type="button" onClick={() => setAssistantFocus({ type: "control", id: control.id, title: control.title })}><Bot size={15} /> Analizar con IA</button>{canManage && <><button onClick={() => openEdit(control)}><Pencil size={15} /> Editar</button><button onClick={() => openEvaluation(control)}><CheckCircle2 size={15} /> Evaluar</button></>}</div></article>)}</div>}
      <ControlFindings controls={controls} risks={risks} role={user?.role} />
    </section></main>
    {assistantFocus && <AssistantDrawer key={assistantFocus.id} focus={assistantFocus} onClose={() => setAssistantFocus(null)} />}
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><form className="proposal-modal control-modal" onSubmit={submit}><div className="modal-header"><div><span className="eyebrow">{evaluating ? `EVALUACIÓN ${evaluating.id}` : editing ? `EDITAR ${editing.id}` : "NUEVO CONTROL"}</span><h2>{evaluating ? "Añadir valoración" : editing ? "Editar control" : "Registrar control"}</h2><p>{evaluating ? "La valoración preliminar se agrega al historial sin reemplazar las anteriores. No sustituye una prueba de diseño u operación." : "Define su tipo, responsable y los riesgos que ayuda a tratar."}</p></div><button type="button" className="modal-close" onClick={closeModal} aria-label="Cerrar"><X size={20} /></button></div>{error && <p className="control-feedback error">{error}</p>}<div className="proposal-form-grid">
      {!evaluating && <><label className="full-width">Nombre del control<input required minLength="3" maxLength="120" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="full-width">Descripción<textarea required minLength="10" maxLength="1000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label>Tipo<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{Object.entries(TYPES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Frecuencia<select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}>{["Daily", "Weekly", "Monthly", "Quarterly", "Annually"].map((frequency) => <option key={frequency}>{frequency}</option>)}</select></label><label className="full-width">Responsable<select required value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })}><option value="">Seleccionar responsable</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.role}</option>)}</select></label><fieldset className="risk-link-picker full-width"><legend>Riesgos relacionados</legend>{risks.map((risk) => <label key={risk.id}><input type="checkbox" checked={form.riskIds.includes(risk.id)} onChange={() => toggleRisk(risk.id)} /><span className={`risk-badge risk-${risk.level.toLowerCase()}`}>{risk.level}</span>{risk.title}</label>)}{risks.length === 0 && <small>Registra riesgos antes de crear controles.</small>}</fieldset></>}
      {!editing && <><label className="full-width">Calificación preliminar<select value={form.rating} onChange={(event) => setForm({ ...form, rating: Number(event.target.value) })}>{RATING_LABELS.map((label, index) => <option value={index + 1} key={label}>{index + 1} · {label}</option>)}</select></label><label className="full-width">Justificación<textarea required minLength="10" maxLength="500" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Resume la evidencia usada para esta evaluación." /></label></>}
    </div><div className="modal-actions"><button type="button" className="secondary-action" onClick={closeModal}>Cancelar</button><button type="submit" className="primary-action" disabled={saving || (!evaluating && form.riskIds.length === 0)}>{saving ? "Guardando..." : evaluating ? "Guardar evaluación" : editing ? "Guardar cambios" : "Crear control"}</button></div></form></div>}
  </div>;
}

export default Controles;
