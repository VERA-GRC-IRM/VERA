import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, CalendarDays, Network, Plus, Search } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { createOrgUnit, getAvailableOrgUnits } from "../services/orgUnitService";
import { createBusinessContext, getBusinessContext, getBusinessContextRevisions,
  publishBusinessContextRevision } from "../services/businessContextService";
import "./BusinessContext.css";

const KIND_LABELS = { PROCESS: "Procesos", SERVICE: "Servicios", OBJECTIVE: "Objetivos" };
const RELATION_RULES = { PROCESS: [{ type: "DELIVERS_SERVICE", target: "SERVICE", label: "Entrega servicio" },
  { type: "SUPPORTS_OBJECTIVE", target: "OBJECTIVE", label: "Apoya objetivo" }],
SERVICE: [{ type: "SUPPORTS_OBJECTIVE", target: "OBJECTIVE", label: "Apoya objetivo" }], OBJECTIVE: [] };
const RELATION_LABELS = { DELIVERS_SERVICE: "Entrega servicio", SUPPORTS_OBJECTIVE: "Apoya objetivo" };
const UNIT_LABELS = { GROUP: "Grupo", LEGAL_ENTITY: "Empresa", BUSINESS_UNIT: "Unidad", SITE: "Sitio" };
const PARENTS = { GROUP: [], LEGAL_ENTITY: ["GROUP", "LEGAL_ENTITY"], BUSINESS_UNIT: ["LEGAL_ENTITY", "BUSINESS_UNIT"], SITE: ["LEGAL_ENTITY", "BUSINESS_UNIT"] };
const today = () => new Date().toISOString().slice(0, 10);
const newRecord = () => ({ kind: "PROCESS", code: "", name: "", description: "", sourceNote: "", effectiveFrom: today(), effectiveTo: "", unitIds: [], relationships: [] });
const newUnit = () => ({ kind: "GROUP", code: "", name: "", parentId: "", effectiveFrom: today(), externalReference: "" });

function BusinessContext() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get("context");
  const requestedRevision = Number(searchParams.get("revision"));
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const canPublish = user?.role === "SUPER_ADMIN";
  const [records, setRecords] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState("PROCESS");
  const [search, setSearch] = useState("");
  const [recordForm, setRecordForm] = useState(newRecord);
  const [revisionTarget, setRevisionTarget] = useState(null);
  const [histories, setHistories] = useState({});
  const [focusedVersion, setFocusedVersion] = useState(null);
  const [focusError, setFocusError] = useState(null);
  const revisionHeading = useRef(null);
  const [unitForm, setUnitForm] = useState(newUnit);
  const [saving, setSaving] = useState(false);
  const [openForm, setOpenForm] = useState("");

  const refresh = async () => {
    const [nextRecords, nextUnits] = await Promise.all([getBusinessContext(), getAvailableOrgUnits()]);
    setRecords(nextRecords);
    setUnits(nextUnits);
  };
  useEffect(() => {
    Promise.all([getBusinessContext(), getAvailableOrgUnits()])
      .then(([nextRecords, nextUnits]) => { setRecords(nextRecords); setUnits(nextUnits); })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (openForm === "revision") revisionHeading.current?.focus();
  }, [openForm]);
  useEffect(() => {
    if (!focusId) return;
    getBusinessContextRevisions(focusId)
      .then((versions) => {
        const record = versions.find((item) => item.revision === requestedRevision) ||
          (!Number.isSafeInteger(requestedRevision) || requestedRevision < 1 ? versions[0] : null);
        if (record) { setFocusedVersion({ contextId: focusId, requestedRevision, record }); setFocusError(null); }
        else setFocusError({ contextId: focusId, requestedRevision, message: "La versión solicitada no está disponible para este ámbito." });
      })
      .catch((cause) => setFocusError({ contextId: focusId, requestedRevision, message: cause.message }));
  }, [focusId, requestedRevision]);

  const selectedHistorical = focusedVersion?.contextId === focusId &&
    focusedVersion?.requestedRevision === requestedRevision ? focusedVersion.record : null;
  const focusedRecord = selectedHistorical || records.find((record) => record.contextId === focusId);
  const activeKind = focusedRecord?.kind || kind;
  const visible = (selectedHistorical ? [selectedHistorical] : records).filter((record) => record.kind === activeKind && (!focusId || record.contextId === focusId) &&
    `${record.code} ${record.name} ${record.description}`.toLocaleLowerCase("es")
      .includes(search.trim().toLocaleLowerCase("es")));
  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]));
  const relationshipChoices = (RELATION_RULES[recordForm.kind] || []).flatMap((rule) => records
    .filter((target) => target.kind === rule.target && target.contextId !== revisionTarget?.contextId &&
      target.unitIds.some((id) => recordForm.unitIds.includes(id)))
    .map((target) => ({ relationType: rule.type, targetContextId: target.contextId,
      targetRevision: target.revision, targetName: target.name, targetCode: target.code })));
  const otherSelectedRelationships = (recordForm.relationships || []).filter((link) =>
    !relationshipChoices.some((choice) => choice.relationType === link.relationType &&
      choice.targetContextId === link.targetContextId && choice.targetRevision === link.targetRevision));
  const parentChoices = units.filter((unit) => PARENTS[unitForm.kind].includes(unit.kind));
  const changeRecord = (field, value) => setRecordForm((current) => ({ ...current, [field]: value }));
  const changeUnit = (field, value) => setUnitForm((current) => ({ ...current, [field]: value }));
  const toggleUnit = (id) => setRecordForm((current) => ({ ...current,
    unitIds: current.unitIds.includes(id) ? current.unitIds.filter((value) => value !== id) : [...current.unitIds, id] }));
  const toggleRelationship = (choice) => setRecordForm((current) => {
    const selected = current.relationships || [];
    const already = selected.some((link) => link.relationType === choice.relationType &&
      link.targetContextId === choice.targetContextId && link.targetRevision === choice.targetRevision);
    return { ...current, relationships: already
      ? selected.filter((link) => !(link.relationType === choice.relationType && link.targetContextId === choice.targetContextId))
      : [...selected.filter((link) => !(link.relationType === choice.relationType && link.targetContextId === choice.targetContextId)), { ...choice, rationale: "" }] };
  });
  const changeRelationshipReason = (choice, value) => setRecordForm((current) => ({ ...current,
    relationships: (current.relationships || []).map((link) =>
      link.relationType === choice.relationType && link.targetContextId === choice.targetContextId &&
      link.targetRevision === choice.targetRevision ? { ...link, rationale: value } : link) }));
  const startRevision = (record) => {
    setRevisionTarget(record);
    setRecordForm({ kind: record.kind, code: record.code, name: record.name,
      description: record.description, sourceNote: record.sourceNote || "",
      effectiveFrom: record.effectiveFrom, effectiveTo: record.effectiveTo || "",
      unitIds: [...record.unitIds], relationships: [...(record.relationships || [])], changeReason: "" });
    setOpenForm("revision"); setError(""); setNotice("");
  };
  const loadHistory = async (contextId) => {
    if (histories[contextId]?.items || histories[contextId]?.loading) return;
    setHistories((current) => ({ ...current, [contextId]: { loading: true } }));
    try {
      const items = await getBusinessContextRevisions(contextId);
      setHistories((current) => ({ ...current, [contextId]: { items } }));
    } catch (cause) {
      setHistories((current) => ({ ...current, [contextId]: { error: cause.message } }));
    }
  };
  const submitRecord = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      if (revisionTarget) {
        const published = await publishBusinessContextRevision(revisionTarget.contextId,
          { ...recordForm, expectedRevision: revisionTarget.revision });
        setHistories((current) => { const next = { ...current }; delete next[revisionTarget.contextId]; return next; });
        if (focusId === revisionTarget.contextId) setSearchParams({ context: focusId, revision: String(published.revision) });
      } else await createBusinessContext(recordForm);
      await refresh();
      setRecordForm(newRecord()); setOpenForm(""); setRevisionTarget(null);
      setNotice(revisionTarget ? "Nueva versión publicada; las referencias anteriores se conservan." : "Registro publicado en el mapa del negocio.");
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  const submitUnit = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await createOrgUnit({ ...unitForm, parentId: unitForm.parentId || null,
        externalReference: unitForm.externalReference || null });
      await refresh();
      setUnitForm(newUnit()); setOpenForm("");
      setNotice("Ámbito registrado. Ya puede vincularse con procesos, servicios y objetivos.");
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };

  return <div className="dashboard-layout">
    <Sidebar active="business-context" />
    <main className="dashboard-main">
      <section className="dashboard-content business-context-page">
        <header className="dashboard-header">
          <div><span className="eyebrow">CONTEXTO EMPRESARIAL</span><h1>Mapa del negocio</h1>
            <p>Ubica los procesos, servicios y objetivos en las unidades donde se gestionan riesgos y auditorías.</p></div>
        </header>
        <p className="business-context-guidance">Este catálogo registra contexto de trabajo. Una relación con una unidad no asigna automáticamente riesgos históricos ni demuestra que un objetivo se haya cumplido.</p>
        {error && <p className="business-context-error" role="alert">{error}</p>}
        {focusError?.contextId === focusId && focusError?.requestedRevision === requestedRevision &&
          <p className="business-context-error" role="alert">{focusError.message}</p>}
        {notice && <p className="business-context-notice" role="status">{notice}</p>}

        {canPublish && <div className="business-context-actions">
          <button type="button" aria-expanded={openForm === "unit"} onClick={() => { setOpenForm(openForm === "unit" ? "" : "unit"); setError(""); }}><Building2 size={18} /> Registrar ámbito</button>
          <button type="button" aria-expanded={openForm === "record"} onClick={() => { setRevisionTarget(null); setRecordForm(newRecord()); setOpenForm(openForm === "record" ? "" : "record"); setError(""); }}><Plus size={18} /> Añadir al mapa</button>
        </div>}

        {canPublish && openForm === "unit" && <form className="business-context-form" onSubmit={submitUnit}>
          <h2>Nuevo ámbito empresarial</h2>
          <p>Usa nombres y códigos aprobados para el catálogo real. Puedes comenzar con un grupo y después vincular empresas, unidades y sitios.</p>
          <div className="business-context-fields">
            <label>Tipo<select value={unitForm.kind} onChange={(event) => setUnitForm({ ...unitForm, kind: event.target.value, parentId: "" })}>
              {Object.entries(UNIT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Código<input required maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,31}" value={unitForm.code} onChange={(event) => changeUnit("code", event.target.value)} /></label>
            <label className="wide">Nombre<input required minLength={3} maxLength={120} value={unitForm.name} onChange={(event) => changeUnit("name", event.target.value)} /></label>
            {unitForm.kind !== "GROUP" && <label className="wide">Ámbito superior<select required value={unitForm.parentId} onChange={(event) => changeUnit("parentId", event.target.value)}>
              <option value="">Seleccionar ámbito</option>
              {parentChoices.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {UNIT_LABELS[unit.kind]}</option>)}
            </select></label>}
            <label>Vigente desde<input required type="date" value={unitForm.effectiveFrom} onChange={(event) => changeUnit("effectiveFrom", event.target.value)} /></label>
            <label>Referencia externa (opcional)<input maxLength={80} value={unitForm.externalReference} onChange={(event) => changeUnit("externalReference", event.target.value)} /></label>
          </div>
          <button type="submit" className="primary-action" disabled={saving || (unitForm.kind !== "GROUP" && parentChoices.length === 0)}>{saving ? "Guardando…" : "Registrar ámbito"}</button>
        </form>}

        {canPublish && ["record", "revision"].includes(openForm) && <form className="business-context-form" onSubmit={submitRecord}>
          <h2 ref={revisionHeading} tabIndex={openForm === "revision" ? -1 : undefined}>{revisionTarget ? `Nueva versión de ${revisionTarget.name}` : "Nuevo proceso, servicio u objetivo"}</h2>
          <p>{revisionTarget ? "Publicar conserva la ficha anterior y las referencias que ya la utilizan. El código y el tipo permanecen iguales." : "La primera versión quedará conservada. Los vínculos de esta pantalla describen dónde aplica; no cambian los permisos de un expediente existente."}</p>
          <div className="business-context-fields">
            <label>Tipo<select value={recordForm.kind} disabled={Boolean(revisionTarget)} onChange={(event) => setRecordForm({ ...recordForm, kind: event.target.value, relationships: [] })}>
              {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label.slice(0, -1)}</option>)}
            </select></label>
            <label>Código<input required maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,31}" readOnly={Boolean(revisionTarget)} value={recordForm.code} onChange={(event) => changeRecord("code", event.target.value)} /></label>
            <label className="wide">Nombre<input required minLength={3} maxLength={120} value={recordForm.name} onChange={(event) => changeRecord("name", event.target.value)} /></label>
            <label className="wide">Descripción<textarea required minLength={10} maxLength={2000} value={recordForm.description} onChange={(event) => changeRecord("description", event.target.value)} /></label>
            <label>Vigente desde<input required type="date" value={recordForm.effectiveFrom} onChange={(event) => changeRecord("effectiveFrom", event.target.value)} /></label>
            <label>Vigente hasta (opcional)<input type="date" min={recordForm.effectiveFrom} value={recordForm.effectiveTo} onChange={(event) => changeRecord("effectiveTo", event.target.value)} /></label>
            <label className="wide">Fuente o referencia (opcional)<input maxLength={500} value={recordForm.sourceNote} onChange={(event) => changeRecord("sourceNote", event.target.value)} /></label>
            {revisionTarget && <label className="wide">Motivo de la nueva versión<textarea required minLength={10} maxLength={500} value={recordForm.changeReason || ""} onChange={(event) => changeRecord("changeReason", event.target.value)} /></label>}
            <fieldset className="wide"><legend>Unidades vinculadas</legend>
              {units.length === 0 ? <p>Registra primero un ámbito empresarial.</p> : units.map((unit) => <label key={unit.id} className="business-context-check">
                <input type="checkbox" checked={recordForm.unitIds.includes(unit.id)} onChange={() => toggleUnit(unit.id)} /> {unit.name} · {UNIT_LABELS[unit.kind]}
              </label>)}
            </fieldset>
            {RELATION_RULES[recordForm.kind]?.length > 0 && <fieldset className="wide"><legend>Relaciones con el mapa (opcional)</legend>
              {[...relationshipChoices, ...otherSelectedRelationships].length === 0 ? <p>Registra primero conceptos compatibles en una unidad compartida.</p>
                : [...relationshipChoices, ...otherSelectedRelationships].map((choice) => {
                  const selected = (recordForm.relationships || []).find((link) => link.relationType === choice.relationType &&
                    link.targetContextId === choice.targetContextId && link.targetRevision === choice.targetRevision);
                  return <div key={`${choice.relationType}:${choice.targetContextId}:${choice.targetRevision}`} className="business-context-relationship-choice">
                    <label className="business-context-check"><input type="checkbox" checked={Boolean(selected)}
                      disabled={!selected && (recordForm.relationships || []).length >= 12} onChange={() => toggleRelationship(choice)} />
                      {RELATION_LABELS[choice.relationType]}: {choice.targetName || "Versión anterior"} · v{choice.targetRevision}</label>
                    {selected && <label>Justificación de esta relación<input required minLength={10} maxLength={500}
                      value={selected.rationale || ""} onChange={(event) => changeRelationshipReason(choice, event.target.value)} /></label>}
                  </div>;
                })}
              <p>Las relaciones requieren una unidad compartida. Si cambias unidades, revisa los enlaces seleccionados.</p>
            </fieldset>}
          </div>
          <button type="submit" className="primary-action" disabled={saving || recordForm.unitIds.length === 0}>{saving ? "Guardando…" : revisionTarget ? "Publicar nueva versión" : "Publicar en el mapa"}</button>
          {revisionTarget && <button type="button" className="business-context-cancel" onClick={() => { setRevisionTarget(null); setRecordForm(newRecord()); setOpenForm(""); }}>Cancelar</button>}
        </form>}

        <div className="business-context-toolbar">
          {focusId && <button type="button" onClick={() => { setSearchParams({}); setSearch(""); }}>Ver todo el mapa</button>}
          <div className="business-context-tabs" role="group" aria-label="Tipo de contexto">
            {Object.entries(KIND_LABELS).map(([value, label]) => <button key={value} type="button" aria-pressed={activeKind === value} onClick={() => { setKind(value); if (focusId) setSearchParams({}); }}>{label}</button>)}
          </div>
          <label><Search size={17} aria-hidden="true" /> Buscar<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código, nombre o descripción" /></label>
        </div>
        {loading ? <p className="business-context-empty" role="status">Cargando mapa del negocio…</p> : visible.length === 0
          ? <p className="business-context-empty">No hay {KIND_LABELS[activeKind].toLowerCase()} visibles que coincidan con la búsqueda.</p>
          : <div className="business-context-list">{visible.map((record) => <article key={record.contextId} className="business-context-card">
            <div className="business-context-card-head"><Network size={20} aria-hidden="true" /><span>{record.code} · {KIND_LABELS[record.kind].slice(0, -1)} · versión {record.revision}</span></div>
            <h2>{record.name}</h2><p>{record.description}</p>
            <div className="business-context-unit-list" aria-label="Ámbitos visibles">
              {record.unitIds.map((id) => <span key={id}>{unitNames.get(id) || "Unidad disponible"}</span>)}
            </div>
            {record.relationships?.length > 0 && <div className="business-context-links"><strong>Relaciones</strong>
              {record.relationships.map((link) => <span key={`${link.relationType}:${link.targetContextId}`}>
                <a href={`/mapa-negocio?context=${encodeURIComponent(link.targetContextId)}&revision=${link.targetRevision}`}>
                  {RELATION_LABELS[link.relationType]}: {link.targetName} · v{link.targetRevision}</a>
                <small>{link.rationale}</small></span>)}
            </div>}
            <small><CalendarDays size={15} aria-hidden="true" /> Vigente desde {record.effectiveFrom}{record.effectiveTo ? ` hasta ${record.effectiveTo}` : ""}{record.sourceNote ? ` · Fuente: ${record.sourceNote}` : " · Fuente no indicada"}</small>
            <div className="business-context-card-actions">
              <details onToggle={(event) => { if (event.currentTarget.open) loadHistory(record.contextId); }}><summary>Ver historial de versiones</summary>
                {histories[record.contextId]?.loading && <p role="status">Consultando historial…</p>}
                {histories[record.contextId]?.error && <p role="alert">{histories[record.contextId].error}</p>}
                {histories[record.contextId]?.items && <ol>{histories[record.contextId].items.map((revision) => <li key={revision.id}>
                  <strong>Versión {revision.revision}</strong> · {revision.name} · {revision.effectiveFrom}
                  {revision.changeReason ? ` · Motivo: ${revision.changeReason}` : " · Publicación inicial"}
                  {revision.publishedBy ? ` · Publicó: ${revision.publishedBy}` : ""}
                </li>)}</ol>}
              </details>
              {canPublish && records.some((current) => current.contextId === record.contextId && current.revision === record.revision) &&
                <button type="button" onClick={() => startRevision(record)}>Publicar nueva versión</button>}
            </div>
          </article>)}</div>}
      </section>
    </main>
  </div>;
}

export default BusinessContext;
