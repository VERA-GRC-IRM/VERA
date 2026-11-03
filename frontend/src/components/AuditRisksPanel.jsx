import { useEffect, useMemo, useState } from "react";
import { Link2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { RISK_CONTROL_MANAGE_ROLES } from "../constants/planning";
import {
  createAuditRisk,
  evaluateAuditRisk,
  getAuditRisks,
  getRisks,
  getRiskOwners,
  unlinkAuditRisk,
  updateAuditRisk
} from "../services/riskService";

const EMPTY = {
  title: "", description: "", category: "", area: "", causes: "", consequences: "",
  ownerId: "", likelihood: 2, impact: 2, note: ""
};
const levelFor = (score) => score <= 2 ? "Bajo" : score <= 4 ? "Medio" : "Alto";

function AuditRisksPanel({ auditId, onChanged }) {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const canManage = RISK_CONTROL_MANAGE_ROLES.includes(user?.role) || user?.role === "AUDITOR";
  const [risks, setRisks] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [owners, setOwners] = useState([]);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selectedCatalogRisk, setSelectedCatalogRisk] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const [linked, all] = await Promise.all([getAuditRisks(auditId), getRisks()]);
    setRisks(linked);
    setCatalog(all);
  };

  useEffect(() => {
    Promise.all([getAuditRisks(auditId), getRisks(), canManage ? getRiskOwners() : Promise.resolve([])])
      .then(([linked, all, activeOwners]) => {
        setRisks(linked);
        setCatalog(all);
        setOwners(activeOwners);
        setError("");
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [auditId, canManage]);

  const filtered = useMemo(() => risks.filter((risk) => {
    const haystack = `${risk.id} ${risk.title} ${risk.category || ""} ${risk.area || ""} ${risk.ownerName || ""}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) &&
      (!level || risk.level === level) &&
      (!status || (risk.status || "OPEN") === status);
  }), [risks, query, level, status]);

  const openCreate = () => {
    setMode("create");
    setSelected(null);
    setForm({ ...EMPTY, ownerId: user?.role === "AUDITOR" ? String(user.id) : "" });
    setError("");
  };
  const openEvaluate = (risk) => {
    setMode("evaluate");
    setSelected(risk);
    setForm({ likelihood: risk.likelihood, impact: risk.impact, note: risk.note || "" });
    setError("");
  };
  const openEdit = (risk) => {
    setMode("edit");
    setSelected(risk);
    setForm({
      title: risk.title, description: risk.description, category: risk.category || "",
      area: risk.area || "", causes: risk.causes || "", consequences: risk.consequences || "",
      ownerId: String(risk.ownerId || ""), likelihood: risk.likelihood, impact: risk.impact,
      note: risk.note || ""
    });
    setError("");
  };
  const closeModal = () => { if (!saving) { setMode(null); setSelected(null); } };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (mode === "link") {
        await createAuditRisk(auditId, { mode: "link", riskId: selectedCatalogRisk });
        setMessage("Riesgo vinculado a la auditoría.");
      } else if (mode === "evaluate") {
        await evaluateAuditRisk(auditId, selected.id, {
          likelihood: Number(form.likelihood),
          impact: Number(form.impact),
          note: form.note
        });
        setMessage("Evaluación guardada para esta auditoría.");
      } else if (mode === "edit") {
        await updateAuditRisk(auditId, selected.id, {
          ...form,
          ownerId: Number(form.ownerId),
          linkedAuditId: auditId,
          likelihood: Number(form.likelihood),
          impact: Number(form.impact)
        });
        setMessage("Riesgo actualizado.");
      } else {
        await createAuditRisk(auditId, {
          ...form,
          ownerId: Number(form.ownerId),
          likelihood: Number(form.likelihood),
          impact: Number(form.impact)
        });
        setMessage("Riesgo registrado en la auditoría.");
      }
      await refresh();
      await onChanged();
      closeModal();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  };

  const unlink = async (risk) => {
    if (!window.confirm(`¿Desvincular ${risk.id} de esta auditoría? El riesgo maestro no se eliminará.`)) return;
    setError("");
    try {
      await unlinkAuditRisk(auditId, risk.id);
      await refresh();
      await onChanged();
      setMessage("Riesgo desvinculado; el registro maestro se conservó.");
    } catch (cause) {
      setError(cause.message);
    }
  };

  const availableCatalog = catalog.filter((risk) => !risks.some((linked) => linked.id === risk.id));
  const summary = ["Alto", "Medio", "Bajo"].map((item) => [item, risks.filter((risk) => risk.level === item).length]);

  return (
    <section className="audit-risks-module" aria-labelledby="audit-risks-title">
      <div className="governance-panel-heading">
        <div><h3 id="audit-risks-title">Riesgos vinculados</h3><p>Administra el riesgo dentro de este expediente sin modificar otras auditorías.</p></div>
        {canManage && <button type="button" className="primary-action" onClick={openCreate}><Plus size={16} /> Agregar riesgo</button>}
      </div>
      <div className="audit-risk-summary">
        {summary.map(([item, count]) => <div key={item}><strong>{count}</strong><span>Riesgo {item}</span></div>)}
        <div><strong>{risks.length}</strong><span>Total vinculados</span></div>
      </div>
      {message && <p className="planning-message success" role="status">{message}</p>}
      {error && <p className="planning-message error" role="alert">{error}</p>}
      <div className="audit-risk-filters">
        <label><Search size={15} /> Buscar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID, nombre o responsable" /></label>
        <label>Nivel<select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">Todos</option><option>Bajo</option><option>Medio</option><option>Alto</option></select></label>
        <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="OPEN">Abierto</option></select></label>
      </div>
      {loading ? <p role="status">Cargando riesgos...</p> : filtered.length === 0 ? <p>No hay riesgos que coincidan con los filtros.</p> : (
        <div className="audit-risk-table-wrap">
          <table className="audit-risk-table">
            <thead><tr><th>ID</th><th>Nombre</th><th>Categoría / proceso</th><th>Responsable</th><th>P</th><th>I</th><th>Nivel</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>{filtered.map((risk) => <tr key={risk.id}>
              <td>{risk.id}</td><td><button type="button" className="audit-risk-link" onClick={() => setSelected(risk)}>{risk.id} · {risk.title}</button></td>
              <td>{risk.category || "—"}{risk.area ? ` · ${risk.area}` : ""}</td><td>{risk.ownerName || "—"}</td>
              <td>{risk.likelihood}</td><td>{risk.impact}</td><td><strong>{risk.level}</strong> ({risk.score}/9)</td><td>{risk.status || "OPEN"}</td>
              <td className="audit-risk-actions">{canManage && <><button type="button" title="Editar riesgo" onClick={() => openEdit(risk)}><Pencil size={15} /></button><button type="button" title="Evaluar riesgo" onClick={() => openEvaluate(risk)}>Evaluar</button><button type="button" title="Desvincular riesgo" onClick={() => unlink(risk)}><Trash2 size={15} /></button></>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {canManage && <div className="audit-risk-link-action"><button type="button" className="secondary-action" onClick={() => { setMode("link"); setSelectedCatalogRisk(""); setError(""); }} disabled={!availableCatalog.length}><Link2 size={15} /> Vincular riesgo existente</button></div>}

      {mode && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
        <form className="modal-card audit-risk-form" onSubmit={submit}>
          <div className="modal-header"><div><span className="eyebrow">RIESGOS · {auditId}</span><h2>{mode === "link" ? "Vincular riesgo existente" : mode === "evaluate" ? "Evaluar riesgo" : mode === "edit" ? "Editar riesgo" : "Crear nuevo riesgo"}</h2></div><button type="button" className="modal-close" onClick={closeModal} aria-label="Cerrar"><X size={20} /></button></div>
          {mode === "link" ? <label>Riesgo del catálogo<select required value={selectedCatalogRisk} onChange={(event) => setSelectedCatalogRisk(event.target.value)}><option value="">Selecciona un riesgo</option>{availableCatalog.map((risk) => <option key={risk.id} value={risk.id}>{risk.id} · {risk.title}</option>)}</select></label> : mode === "evaluate" ? <><label>Probabilidad (1–3)<select value={form.likelihood} onChange={(event) => setForm({ ...form, likelihood: event.target.value })}><option value="1">1 · Baja</option><option value="2">2 · Media</option><option value="3">3 · Alta</option></select></label><label>Impacto (1–3)<select value={form.impact} onChange={(event) => setForm({ ...form, impact: event.target.value })}><option value="1">1 · Bajo</option><option value="2">2 · Medio</option><option value="3">3 · Alto</option></select></label><label className="full-width">Justificación<textarea required minLength="10" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><strong>Nivel calculado: {levelFor(Number(form.likelihood) * Number(form.impact))}</strong></> : <><label>Nombre<input required minLength="3" maxLength="140" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>Categoría<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label><label className="full-width">Descripción<textarea required minLength="10" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label>Proceso o área<input required maxLength="100" value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} /></label><label>Responsable<select required value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })} disabled={user?.role === "AUDITOR"}><option value="">Selecciona</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label><label className="full-width">Causas<textarea value={form.causes} onChange={(event) => setForm({ ...form, causes: event.target.value })} /></label><label className="full-width">Consecuencias<textarea value={form.consequences} onChange={(event) => setForm({ ...form, consequences: event.target.value })} /></label><label>Probabilidad (1–3)<select value={form.likelihood} onChange={(event) => setForm({ ...form, likelihood: event.target.value })}><option value="1">1 · Baja</option><option value="2">2 · Media</option><option value="3">3 · Alta</option></select></label><label>Impacto (1–3)<select value={form.impact} onChange={(event) => setForm({ ...form, impact: event.target.value })}><option value="1">1 · Bajo</option><option value="2">2 · Medio</option><option value="3">3 · Alto</option></select></label><label className="full-width">Justificación<textarea required minLength="10" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><strong>Nivel calculado: {levelFor(Number(form.likelihood) * Number(form.impact))}</strong></>}
          <div className="modal-actions"><button type="button" className="secondary-action" onClick={closeModal}>Cancelar</button><button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button></div>
        </form>
      </div>}
      {!mode && selected && <div className="risk-detail-card"><button type="button" className="modal-close" onClick={() => setSelected(null)} aria-label="Cerrar detalle"><X size={18} /></button><h4>{selected.id} · {selected.title}</h4><p>{selected.description}</p><p><strong>Causas:</strong> {selected.causes || "—"} · <strong>Consecuencias:</strong> {selected.consequences || "—"}</p><p>Evaluación: {selected.likelihood} × {selected.impact} = {selected.score} · {selected.level}. {selected.note}</p></div>}
    </section>
  );
}

export default AuditRisksPanel;
