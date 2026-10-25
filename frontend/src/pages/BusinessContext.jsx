import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, Network, Plus, Search } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { createOrgUnit, getAvailableOrgUnits } from "../services/orgUnitService";
import { createBusinessContext, getBusinessContext } from "../services/businessContextService";
import "./BusinessContext.css";

const KIND_LABELS = { PROCESS: "Procesos", SERVICE: "Servicios", OBJECTIVE: "Objetivos" };
const UNIT_LABELS = { GROUP: "Grupo", LEGAL_ENTITY: "Empresa", BUSINESS_UNIT: "Unidad", SITE: "Sitio" };
const PARENTS = { GROUP: [], LEGAL_ENTITY: ["GROUP", "LEGAL_ENTITY"], BUSINESS_UNIT: ["LEGAL_ENTITY", "BUSINESS_UNIT"], SITE: ["LEGAL_ENTITY", "BUSINESS_UNIT"] };
const today = () => new Date().toISOString().slice(0, 10);
const newRecord = () => ({ kind: "PROCESS", code: "", name: "", description: "", sourceNote: "", effectiveFrom: today(), effectiveTo: "", unitIds: [] });
const newUnit = () => ({ kind: "GROUP", code: "", name: "", parentId: "", effectiveFrom: today(), externalReference: "" });

function BusinessContext() {
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

  const visible = useMemo(() => records.filter((record) => record.kind === kind &&
    `${record.code} ${record.name} ${record.description}`.toLocaleLowerCase("es")
      .includes(search.trim().toLocaleLowerCase("es"))), [records, kind, search]);
  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]));
  const parentChoices = units.filter((unit) => PARENTS[unitForm.kind].includes(unit.kind));
  const changeRecord = (field, value) => setRecordForm((current) => ({ ...current, [field]: value }));
  const changeUnit = (field, value) => setUnitForm((current) => ({ ...current, [field]: value }));
  const toggleUnit = (id) => setRecordForm((current) => ({ ...current,
    unitIds: current.unitIds.includes(id) ? current.unitIds.filter((value) => value !== id) : [...current.unitIds, id] }));
  const submitRecord = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await createBusinessContext(recordForm);
      await refresh();
      setRecordForm(newRecord()); setOpenForm("");
      setNotice("Registro publicado en el mapa del negocio.");
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
        {notice && <p className="business-context-notice" role="status">{notice}</p>}

        {canPublish && <div className="business-context-actions">
          <button type="button" aria-expanded={openForm === "unit"} onClick={() => { setOpenForm(openForm === "unit" ? "" : "unit"); setError(""); }}><Building2 size={18} /> Registrar ámbito</button>
          <button type="button" aria-expanded={openForm === "record"} onClick={() => { setOpenForm(openForm === "record" ? "" : "record"); setError(""); }}><Plus size={18} /> Añadir al mapa</button>
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

        {canPublish && openForm === "record" && <form className="business-context-form" onSubmit={submitRecord}>
          <h2>Nuevo proceso, servicio u objetivo</h2>
          <p>La primera versión quedará conservada. Los vínculos de esta pantalla describen dónde aplica; no cambian los permisos de un expediente existente.</p>
          <div className="business-context-fields">
            <label>Tipo<select value={recordForm.kind} onChange={(event) => changeRecord("kind", event.target.value)}>
              {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label.slice(0, -1)}</option>)}
            </select></label>
            <label>Código<input required maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,31}" value={recordForm.code} onChange={(event) => changeRecord("code", event.target.value)} /></label>
            <label className="wide">Nombre<input required minLength={3} maxLength={120} value={recordForm.name} onChange={(event) => changeRecord("name", event.target.value)} /></label>
            <label className="wide">Descripción<textarea required minLength={10} maxLength={2000} value={recordForm.description} onChange={(event) => changeRecord("description", event.target.value)} /></label>
            <label>Vigente desde<input required type="date" value={recordForm.effectiveFrom} onChange={(event) => changeRecord("effectiveFrom", event.target.value)} /></label>
            <label>Vigente hasta (opcional)<input type="date" min={recordForm.effectiveFrom} value={recordForm.effectiveTo} onChange={(event) => changeRecord("effectiveTo", event.target.value)} /></label>
            <label className="wide">Fuente o referencia (opcional)<input maxLength={500} value={recordForm.sourceNote} onChange={(event) => changeRecord("sourceNote", event.target.value)} /></label>
            <fieldset className="wide"><legend>Unidades vinculadas</legend>
              {units.length === 0 ? <p>Registra primero un ámbito empresarial.</p> : units.map((unit) => <label key={unit.id} className="business-context-check">
                <input type="checkbox" checked={recordForm.unitIds.includes(unit.id)} onChange={() => toggleUnit(unit.id)} /> {unit.name} · {UNIT_LABELS[unit.kind]}
              </label>)}
            </fieldset>
          </div>
          <button type="submit" className="primary-action" disabled={saving || recordForm.unitIds.length === 0}>{saving ? "Guardando…" : "Publicar en el mapa"}</button>
        </form>}

        <div className="business-context-toolbar">
          <div className="business-context-tabs" role="group" aria-label="Tipo de contexto">
            {Object.entries(KIND_LABELS).map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}
          </div>
          <label><Search size={17} aria-hidden="true" /> Buscar<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código, nombre o descripción" /></label>
        </div>
        {loading ? <p className="business-context-empty" role="status">Cargando mapa del negocio…</p> : visible.length === 0
          ? <p className="business-context-empty">No hay {KIND_LABELS[kind].toLowerCase()} visibles que coincidan con la búsqueda.</p>
          : <div className="business-context-list">{visible.map((record) => <article key={record.contextId} className="business-context-card">
            <div className="business-context-card-head"><Network size={20} aria-hidden="true" /><span>{record.code} · {KIND_LABELS[record.kind].slice(0, -1)} · versión {record.revision}</span></div>
            <h2>{record.name}</h2><p>{record.description}</p>
            <div className="business-context-unit-list" aria-label="Ámbitos visibles">
              {record.unitIds.map((id) => <span key={id}>{unitNames.get(id) || "Unidad disponible"}</span>)}
            </div>
            <small><CalendarDays size={15} aria-hidden="true" /> Vigente desde {record.effectiveFrom}{record.effectiveTo ? ` hasta ${record.effectiveTo}` : ""}{record.sourceNote ? ` · Fuente: ${record.sourceNote}` : " · Fuente no indicada"}</small>
          </article>)}</div>}
      </section>
    </main>
  </div>;
}

export default BusinessContext;
