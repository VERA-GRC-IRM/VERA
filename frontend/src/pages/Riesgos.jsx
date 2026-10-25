import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Bot, ClipboardCheck, Pencil, Plus, ShieldAlert, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import AssistantDrawer from "../components/AssistantDrawer";
import { RISK_CONTROL_MANAGE_ROLES } from "../constants/planning";
import { createRisk, evaluateRisk, getRiskOwners, getRisks, proposeRiskResponse, updateRisk } from "../services/riskService";
import { getPlanningAudits } from "../services/planningService";
import { getAvailableOrgUnits } from "../services/orgUnitService";
import { getRiskLibrary } from "../services/riskLibraryService";
import { getBusinessContext } from "../services/businessContextService";
import "./Riesgos.css";

const EMPTY = { title: "", description: "", area: "", orgUnitId: "", ownerId: "", responsePlan: "", linkedAuditId: "", templateId: "", templateRevision: null, businessContextReferences: [], likelihood: 2, impact: 2, note: "" };
const levelFor = (score) => score <= 2 ? "Bajo" : score <= 4 ? "Medio" : "Alto";
const RESPONSE_LABELS = { AVOID: "Evitar", REDUCE: "Reducir", TRANSFER: "Transferir", ACCEPT: "Aceptar" };
const EMPTY_RESPONSE = { strategy: "REDUCE", rationale: "", actions: "", ownerId: "", reviewDate: "" };
const dateLabel = (value) => new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
const RESPONSE_STATES = [
  { value: "NONE", label: "Sin propuesta" },
  { value: "OVERDUE", label: "Revisión vencida" },
  { value: "TODAY", label: "Revisión hoy" },
  { value: "UPCOMING", label: "Revisión futura" },
  { value: "UNSCHEDULED", label: "Sin fecha de revisión" }
];
const responseState = (risk, today) => {
  const latest = risk.responseDecisions?.at(-1);
  if (!latest) return "NONE";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(latest.reviewDate || "")) return "UNSCHEDULED";
  if (latest.reviewDate < today) return "OVERDUE";
  return latest.reviewDate === today ? "TODAY" : "UPCOMING";
};
const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const serverRiskFilters = ({ search, area, level }) => ({ search, area, level });
const filtersFromQuery = (query) => {
  const params = new URLSearchParams(query);
  const level = params.get("level") || "";
  return { level: ["Bajo", "Medio", "Alto"].includes(level) ? level : "",
    area: (params.get("area") || "").slice(0, 100), search: (params.get("search") || "").slice(0, 120),
    response: RESPONSE_STATES.some(({ value }) => value === params.get("response")) ? params.get("response") : "" };
};

function Riesgos() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const canManage = RISK_CONTROL_MANAGE_ROLES.includes(user?.role);
  const [risks, setRisks] = useState([]);
  const [owners, setOwners] = useState([]);
  const [audits, setAudits] = useState([]);
  const [orgUnits, setOrgUnits] = useState([]);
  const [orgUnitsLoading, setOrgUnitsLoading] = useState(canManage);
  const [orgUnitsError, setOrgUnitsError] = useState("");
  const [riskTemplates, setRiskTemplates] = useState([]);
  const [riskTemplatesError, setRiskTemplatesError] = useState("");
  const [businessContexts, setBusinessContexts] = useState([]);
  const [businessContextsError, setBusinessContextsError] = useState("");
  const requestedTemplate = useRef(location.state?.riskTemplateId
    ? { id: location.state.riskTemplateId, revision: location.state.riskTemplateRevision } : null);
  const templateReturnPath = useRef(`${location.pathname}${location.search}${location.hash}`);
  const filters = useMemo(() => filtersFromQuery(location.search), [location.search]);
  const setFilters = (next) => {
    const query = new URLSearchParams(Object.entries(next).filter(([, value]) => value)).toString();
    navigate({ pathname: location.pathname, search: query ? `?${query}` : "", hash: location.hash }, { replace: true });
  };
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [responding, setResponding] = useState(null);
  const [responseForm, setResponseForm] = useState(EMPTY_RESPONSE);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [assistantFocus, setAssistantFocus] = useState(null);

  const refresh = async () => setRisks(await getRisks(serverRiskFilters(filters)));
  const loadOrgUnits = () => {
    setOrgUnitsLoading(true);
    setOrgUnitsError("");
    return getAvailableOrgUnits()
      .then(setOrgUnits)
      .catch((err) => setOrgUnitsError(err.message))
      .finally(() => setOrgUnitsLoading(false));
  };
  useEffect(() => {
    Promise.all([getRisks(serverRiskFilters(filters)), canManage ? getRiskOwners() : Promise.resolve([]), getPlanningAudits()])
      .then(([allRisks, activeOwners, allAudits]) => { setRisks(allRisks); setOwners(activeOwners); setAudits(allAudits); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters, canManage]);
  useEffect(() => {
    if (!canManage) return;
    getAvailableOrgUnits()
      .then(setOrgUnits)
      .catch((err) => setOrgUnitsError(err.message))
      .finally(() => setOrgUnitsLoading(false));
  }, [canManage]);
  useEffect(() => {
    if (!canManage) return;
    getRiskLibrary()
      .then((library) => {
        setRiskTemplates(library.templates);
        const requested = requestedTemplate.current;
        if (!requested) return;
        requestedTemplate.current = null;
        const template = library.templates.find((item) =>
          item.templateId === requested.id && item.revision === requested.revision);
        if (!template) setError("La versión seleccionada no está disponible. Consulta de nuevo la biblioteca.");
        else {
          setEditing(null);
          setForm({ ...EMPTY, templateId: template.templateId, templateRevision: template.revision,
            description: template.scenario,
            ...(template.title.length <= 140 ? { title: template.title } : {}) });
          setError("");
          setModal(true);
        }
        navigate(templateReturnPath.current, { replace: true, state: null });
      })
      .catch((cause) => setRiskTemplatesError(cause.message));
  }, [canManage, navigate]);
  useEffect(() => {
    if (!canManage) return;
    getBusinessContext().then(setBusinessContexts).catch((cause) => setBusinessContextsError(cause.message));
  }, [canManage]);
  useEffect(() => {
    try {
      const target = decodeURIComponent(location.hash.slice(1));
      if (target.startsWith("risk-")) document.getElementById(target)?.scrollIntoView({ block: "center" });
    } catch { /* Un fragmento inválido no altera el registro. */ }
  }, [location.hash, risks]);

  const summary = ["Alto", "Medio", "Bajo"].map((level) => ({ level, count: risks.filter((risk) => risk.level === level).length }));
  const today = localDate();
  const responseSummary = RESPONSE_STATES.map((state) => ({ ...state,
    count: risks.filter((risk) => responseState(risk, today) === state.value).length }));
  const visibleRisks = filters.response ? risks.filter((risk) => responseState(risk, today) === filters.response) : risks;
  const orgUnitName = (id) => orgUnits.find((unit) => unit.id === id)?.name || "Entidad asignada";
  const manageableUnits = orgUnits.filter((unit) => unit.accessLevel === "MANAGE");
  const linkedAudit = audits.find((audit) => audit.id === form.linkedAuditId);
  const selectedUnitId = editing ? form.orgUnitId : form.linkedAuditId ? linkedAudit?.orgUnitId : form.orgUnitId;
  const applicableContexts = businessContexts.filter((record) => selectedUnitId && record.unitIds.includes(selectedUnitId));
  const contextChoices = [...applicableContexts, ...(form.businessContextReferences || []).filter((reference) =>
    !applicableContexts.some((record) => record.contextId === reference.contextId && record.revision === reference.revision))];
  const toggleContext = (record) => setForm((current) => {
    const references = current.businessContextReferences || [];
    const alreadySelected = references.some((reference) => reference.contextId === record.contextId && reference.revision === record.revision);
    return { ...current, businessContextReferences: alreadySelected
      ? references.filter((reference) => reference.contextId !== record.contextId)
      : [...references.filter((reference) => reference.contextId !== record.contextId),
        { contextId: record.contextId, revision: record.revision }] };
  });
  const startCreate = () => { setEditing(null); setForm(EMPTY); setError(""); setModal(true); };
  const selectTemplate = (templateId) => {
    const template = riskTemplates.find((item) => item.templateId === templateId);
    setForm((current) => ({ ...current, templateId: template?.templateId || "",
      templateRevision: template?.revision || null,
      ...(template ? { description: template.scenario,
        ...(template.title.length <= 140 ? { title: template.title } : {}) } : {}) }));
  };
  const startEdit = (risk) => {
    setEditing(risk);
    setForm({ title: risk.title, description: risk.description, area: risk.area, orgUnitId: risk.orgUnitId || "", ownerId: String(risk.ownerId), responsePlan: risk.responsePlan || "", linkedAuditId: risk.linkedAuditId || "",
      businessContextReferences: (risk.businessContextReferences || []).map(({ contextId, revision, kind, code, name }) => ({ contextId, revision, kind, code, name })) });
    setError(""); setModal(true);
  };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (assessing) await evaluateRisk(assessing.id, form);
      else if (editing) {
        const changes = { ...form };
        delete changes.orgUnitId;
        await updateRisk(editing.id, changes);
      } else {
        const changes = { ...form };
        if (form.linkedAuditId) delete changes.orgUnitId;
        await createRisk(changes);
      }
      await refresh(); setModal(false); setAssessing(null); setMessage(assessing ? "Evaluación registrada en el historial." : editing ? "Riesgo actualizado." : "Riesgo registrado.");
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const startAssessment = (risk) => { setAssessing(risk); setEditing(null); setForm({ likelihood: risk.likelihood, impact: risk.impact, note: "" }); setError(""); setModal(true); };
  const startResponse = (risk) => {
    setResponding(risk); setResponseForm({ ...EMPTY_RESPONSE, ownerId: String(risk.ownerId) }); setError("");
  };
  const submitResponse = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await proposeRiskResponse(responding.id, { ...responseForm, expectedRevision: responding.responseDecisions?.length || 0 });
      await refresh(); setResponding(null); setMessage("Estrategia propuesta y registrada en el historial.");
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  const closeModal = () => { setModal(false); setAssessing(null); setEditing(null); setError(""); };

  return <div className="dashboard-layout">
    <Sidebar active="riesgos" />
    <main className="dashboard-main">
      <section className="dashboard-content risk-register-page">
        <header className="dashboard-header">
          <div><span className="eyebrow">GESTIÓN Y PRIORIZACIÓN</span><h1>Registro de riesgos</h1><p>Identifica, evalúa y da seguimiento a los riesgos del portafolio.</p></div>
          {canManage && <button className="primary-action" onClick={startCreate}><Plus size={18} /> Registrar riesgo</button>}
        </header>
        {message && <p className="risk-feedback success">{message}</p>}
        {error && !modal && <p className="risk-feedback error">{error}</p>}
        <div className="risk-summary">
          {summary.map(({ level, count }) => <article key={level} className={`risk-summary-card risk-summary-${level.toLowerCase()}`}><span>Riesgo {level.toLowerCase()}</span><strong>{count}</strong><small>registros visibles</small></article>)}
        </div>
        <section className="risk-response-overview" aria-labelledby="risk-response-overview-title">
          <div className="risk-response-overview-heading"><h2 id="risk-response-overview-title">Seguimiento de estrategias</h2><p>Propuestas sobre los riesgos visibles. La fecha corresponde a la revisión prevista, no a una aprobación formal.</p></div>
          <div className="risk-response-overview-grid">
            {responseSummary.map(({ value, label, count }) => <button key={value} type="button"
              className={`risk-response-overview-card${filters.response === value ? " is-selected" : ""}`}
              aria-pressed={filters.response === value}
              onClick={() => setFilters({ ...filters, response: filters.response === value ? "" : value })}>
              <span>{label}</span><strong>{count}</strong><small>Ver riesgos</small>
            </button>)}
          </div>
        </section>
        <section className="risk-filters" aria-label="Filtros de riesgos">
          <label>Buscar<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Nombre, área, responsable..." /></label>
          <label>Área exacta<input value={filters.area} onChange={(event) => setFilters({ ...filters, area: event.target.value })} maxLength={100} placeholder="Todas las áreas" /></label>
          <label>Nivel<select value={filters.level} onChange={(event) => setFilters({ ...filters, level: event.target.value })}><option value="">Todos los niveles</option><option>Bajo</option><option>Medio</option><option>Alto</option></select></label>
          <label>Seguimiento<select value={filters.response} onChange={(event) => setFilters({ ...filters, response: event.target.value })}><option value="">Todas las estrategias</option>{RESPONSE_STATES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
        </section>
        {!loading && <p className="risk-response-result-count" role="status">Mostrando {visibleRisks.length} de {risks.length} riesgos visibles con los filtros de búsqueda, área y nivel.</p>}
        {loading ? <div className="risk-empty">Cargando registro...</div> : visibleRisks.length === 0 ? <div className="risk-empty">No hay riesgos que coincidan con estos filtros.</div> :
          <div className="risk-list">{visibleRisks.map((risk) => <article className="risk-record" id={`risk-${risk.id}`} key={risk.id}>
            <div className="risk-record-icon"><ShieldAlert size={22} /></div>
            <div className="risk-record-main">
              <div className="risk-record-heading"><span className="risk-record-id">{risk.id}</span><span className={`risk-badge risk-${risk.level.toLowerCase()}`}>{risk.level}</span><span className="risk-score">P×I {risk.score} / 9</span></div>
              <h2>{risk.title}</h2><p>{risk.description}</p>
              <div className="risk-record-meta"><span><b>Área:</b> {risk.area}</span>{risk.orgUnitId && <span><b>Entidad:</b> {orgUnitName(risk.orgUnitId)}</span>}<span><b>Responsable:</b> {risk.ownerName}</span><span><b>Estado:</b> Abierto</span><span><b>Evaluaciones:</b> {risk.evaluations.length}</span>{risk.templateReference && <span><b>Escenario de origen:</b> {risk.templateReference.title} · versión {risk.templateReference.revision}</span>}{risk.linkedAuditId && <span><b>Auditoría vinculada:</b> {audits.some((audit) => audit.id === risk.linkedAuditId && audit.status === "ACTIVE") ? <a href={`/auditorias-activas#audit-${encodeURIComponent(risk.linkedAuditId)}`}>{risk.linkedAuditId}</a> : risk.linkedAuditId}</span>}</div>
              {risk.businessContextReferences?.length > 0 && <div className="risk-context-references"><b>Contexto del negocio:</b> {risk.businessContextReferences.map((reference) => <a key={reference.contextId} href={`/mapa-negocio?context=${encodeURIComponent(reference.contextId)}&revision=${reference.revision}`}>{reference.name} · v{reference.revision}</a>)}</div>}
              {risk.responsePlan && <p className="risk-plan"><b>Plan de respuesta:</b> {risk.responsePlan}</p>}
              {risk.responseDecisions?.length > 0 && <div className="risk-response-summary">
                <p><b>Estrategia propuesta:</b> {RESPONSE_LABELS[risk.responseDecisions.at(-1).strategy]} · {risk.responseDecisions.at(-1).ownerName} · revisión {risk.responseDecisions.at(-1).reviewDate}</p>
                <p>{risk.responseDecisions.at(-1).actions}</p>
                <small>Propuesta pendiente de decisión formal. No equivale a aceptar riesgo ni a medir riesgo residual.</small>
                <details><summary>Historial de estrategias ({risk.responseDecisions.length})</summary><ol>{[...risk.responseDecisions].reverse().map((decision) => <li key={decision.revision}>
                  <b>Revisión {decision.revision} · {RESPONSE_LABELS[decision.strategy]}</b><p>{decision.rationale}</p><p>{decision.actions}</p>
                  <small>{decision.proposedBy?.name || "Usuario"} · {dateLabel(decision.proposedAt)} · Responsable: {decision.ownerName} · Revisión: {decision.reviewDate}</small>
                </li>)}</ol></details>
              </div>}
              <details className="risk-history"><summary><Activity size={15} /> Historial de evaluación ({risk.evaluations.length})</summary><ol>{[...risk.evaluations].reverse().map((evaluation) => <li key={evaluation.version}><div><b>Versión {evaluation.version}</b><span className={`risk-badge risk-${evaluation.level.toLowerCase()}`}>{evaluation.level} · {evaluation.score}/9</span></div><p>{evaluation.note}</p><small>{evaluation.assessedBy?.name || "Usuario"} · {dateLabel(evaluation.assessedAt)} · Probabilidad {evaluation.likelihood}, impacto {evaluation.impact}</small></li>)}</ol></details>
            </div>
            <div className="risk-record-actions"><button type="button" onClick={() => setAssistantFocus({ type: "risk", id: risk.id, title: risk.title })}><Bot size={15} /> Analizar con IA</button>{canManage && <><button onClick={() => startEdit(risk)}><Pencil size={15} /> Editar</button><button onClick={() => startAssessment(risk)}><ClipboardCheck size={15} /> Reevaluar</button><button onClick={() => startResponse(risk)}>Definir estrategia</button></>}</div>
          </article>)}</div>}
      </section>
    </main>
    {assistantFocus && <AssistantDrawer key={assistantFocus.id} focus={assistantFocus} onClose={() => setAssistantFocus(null)} />}
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><form className="proposal-modal risk-modal" onSubmit={submit}>
      <div className="modal-header"><div><span className="eyebrow">{assessing ? `EVALUACIÓN ${assessing.id}` : editing ? `EDITAR ${editing.id}` : "NUEVO REGISTRO"}</span><h2>{assessing ? "Reevaluar riesgo" : editing ? "Editar riesgo" : "Registrar riesgo"}</h2><p>{assessing ? "Cada evaluación conserva sus valores, motivo, autor y fecha." : "Documenta el riesgo, su responsable y la primera evaluación."}</p></div><button type="button" className="modal-close" onClick={closeModal} aria-label="Cerrar"><X size={20} /></button></div>
      {error && <p className="risk-feedback error">{error}</p>}
      <div className="proposal-form-grid">
        {!assessing && <>
          {!editing && <label className="full-width">Escenario de biblioteca (opcional)
            <select value={form.templateId} onChange={(event) => selectTemplate(event.target.value)} disabled={Boolean(riskTemplatesError)}>
              <option value="">Registrar sin plantilla</option>
              {riskTemplates.map((template) => <option key={template.templateId} value={template.templateId}>{template.title} · versión {template.revision}</option>)}
            </select>
          </label>}
          {!editing && <div className="full-width"><small>El escenario propone nombre y descripción; puedes adaptarlos. VERA conservará la versión usada.</small>
            {riskTemplatesError && <small role="status">Biblioteca no disponible: {riskTemplatesError}. Puedes registrar el riesgo sin plantilla.</small>}</div>}
          <label className="full-width">Nombre del riesgo<input required minLength="3" maxLength="140" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label className="full-width">Descripción<textarea required minLength="10" maxLength="2000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label>Área<input required maxLength="100" value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} /></label>
          <label>Ámbito empresarial
            {editing ? <input readOnly value={form.orgUnitId ? orgUnitName(form.orgUnitId) : "Sin asignar"} /> : form.linkedAuditId ? (
              <input readOnly value={linkedAudit?.orgUnitId ? orgUnitName(linkedAudit.orgUnitId) : "Sin asignar"} />
            ) : (
              <select value={form.orgUnitId} onChange={(event) => setForm({ ...form, orgUnitId: event.target.value, businessContextReferences: [] })}
                disabled={orgUnitsLoading || Boolean(orgUnitsError)}>
                <option value="">Sin asignar todavía</option>
                {manageableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {unit.code}</option>)}
              </select>
            )}
            {orgUnitsError && !editing && <small role="status">No se pudieron consultar las entidades. <button type="button" onClick={loadOrgUnits}>Reintentar</button></small>}
            {!editing && !orgUnitsError && <small>{form.linkedAuditId ? "El ámbito se hereda de la auditoría; la API comprueba el permiso." : "Solo aparecen entidades donde puedes gestionar riesgos. El área no asigna una entidad."}</small>}
          </label>
          <label>Responsable<select required value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })}><option value="">Seleccionar cuenta activa</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.role}</option>)}</select></label>
          <fieldset className="full-width risk-context-selector"><legend>Procesos, servicios u objetivos relacionados (opcional)</legend>
            {!selectedUnitId ? <p>Asigna un ámbito empresarial para ver sus elementos.</p> : businessContextsError ? <p role="status">No se pudo consultar el mapa; los vínculos ya guardados se conservan.</p> : contextChoices.length === 0 ? <p>No hay elementos del mapa para este ámbito.</p> : contextChoices.map((record) => {
              const checked = (form.businessContextReferences || []).some((reference) => reference.contextId === record.contextId && reference.revision === record.revision);
              return <label key={`${record.contextId}:${record.revision}`}><input type="checkbox" checked={checked}
                disabled={!checked && (form.businessContextReferences || []).length >= 12}
                onChange={() => toggleContext(record)} /> {record.name} · {record.code} · v{record.revision}</label>;
            })}
          </fieldset>
          <label className="full-width">Plan de respuesta (opcional)<textarea maxLength="2000" value={form.responsePlan} onChange={(event) => setForm({ ...form, responsePlan: event.target.value })} placeholder="Acciones para reducir probabilidad o impacto" /></label>
          <label className="full-width">Auditoría relacionada (opcional)<select value={form.linkedAuditId} onChange={(event) => setForm({ ...form, linkedAuditId: event.target.value, orgUnitId: editing ? form.orgUnitId : "", businessContextReferences: [] })}><option value="">Sin auditoría relacionada</option>{audits.map((audit) => <option key={audit.id} value={audit.id}>{audit.id} · {audit.title}</option>)}</select></label>
        </>}
        {!editing && <>
          <label>Probabilidad<select value={form.likelihood} onChange={(event) => setForm({ ...form, likelihood: Number(event.target.value) })}><option value={1}>Baja (1)</option><option value={2}>Media (2)</option><option value={3}>Alta (3)</option></select></label>
          <label>Impacto<select value={form.impact} onChange={(event) => setForm({ ...form, impact: Number(event.target.value) })}><option value={1}>Bajo (1)</option><option value={2}>Medio (2)</option><option value={3}>Alto (3)</option></select></label>
          <p className="risk-score-preview full-width">Resultado: <b>{Number(form.likelihood) * Number(form.impact)} / 9 · {levelFor(Number(form.likelihood) * Number(form.impact))}</b></p>
          <label className="full-width">Justificación de la evaluación<textarea required minLength="10" maxLength="1000" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Explica la evidencia que sustenta esta calificación." /></label>
        </>}
      </div>
      <div className="modal-actions"><button type="button" className="secondary-action" onClick={closeModal}>Cancelar</button><button type="submit" className="primary-action" disabled={saving || (!editing && !assessing && (orgUnitsLoading || Boolean(orgUnitsError)))}>{saving ? "Guardando..." : assessing ? "Guardar evaluación" : editing ? "Guardar cambios" : "Crear riesgo"}</button></div>
    </form></div>}
    {responding && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setResponding(null); }}>
      <form className="proposal-modal risk-modal" onSubmit={submitResponse}>
        <div className="modal-header"><div><span className="eyebrow">RESPUESTA AL RIESGO · {responding.id}</span><h2>Proponer estrategia</h2>
          <p>Documenta una propuesta; la aprobación formal y el cálculo residual se gestionan por separado.</p></div>
          <button type="button" className="modal-close" onClick={() => setResponding(null)} aria-label="Cerrar"><X size={20} /></button></div>
        {error && <p className="risk-feedback error" role="alert">{error}</p>}
        <div className="proposal-form-grid">
          <label>Estrategia<select value={responseForm.strategy} onChange={(event) => setResponseForm({ ...responseForm, strategy: event.target.value })}>
            {Object.entries(RESPONSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Responsable de la propuesta<select required value={responseForm.ownerId} onChange={(event) => setResponseForm({ ...responseForm, ownerId: event.target.value })}>
            <option value="">Seleccionar</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.role}</option>)}</select></label>
          <label>Fecha de revisión<input required type="date" min={new Date().toISOString().slice(0, 10)} value={responseForm.reviewDate}
            onChange={(event) => setResponseForm({ ...responseForm, reviewDate: event.target.value })} /></label>
          <label className="full-width">Motivo<textarea required minLength="20" maxLength="1000" value={responseForm.rationale}
            onChange={(event) => setResponseForm({ ...responseForm, rationale: event.target.value })} /></label>
          <label className="full-width">Acciones o condiciones<textarea required minLength="10" maxLength="2000" value={responseForm.actions}
            onChange={(event) => setResponseForm({ ...responseForm, actions: event.target.value })} /></label>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setResponding(null)}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando…" : "Guardar propuesta"}</button></div>
      </form>
    </div>}
  </div>;
}

export default Riesgos;
