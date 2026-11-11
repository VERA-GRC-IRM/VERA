import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { EDITABLE_FIELDS_BY_STATUS, QUARTERS, RISK_FACTORS } from "../constants/planning";
import { editAudit, getAuditors } from "../services/planningService";

const toForm = (audit) => ({
  objective: audit.objective || "",
  responsibleId: audit.responsibleId ?? "",
  quarter: audit.quarter || "",
  startDate: audit.startDate || "",
  endDate: audit.endDate || "",
  plannedHours: audit.plannedHours ?? "",
  executedHours: audit.executedHours ?? "",
  likelihood: audit.likelihood ?? 2,
  impact: audit.impact ?? 2
});

function EditAuditModal({ audit, onClose, onSaved }) {
  const editable = EDITABLE_FIELDS_BY_STATUS[audit.status] || [];
  const can = (field) => editable.includes(field);
  const [form, setForm] = useState(() => toForm(audit));
  const [auditors, setAuditors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getAuditors().then(setAuditors).catch(() => setAuditors([]));
  }, []);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const original = toForm(audit);
    const changes = {};
    for (const field of editable) {
      if (String(form[field]) !== String(original[field])) changes[field] = form[field];
    }
    if (Object.keys(changes).length === 0) {
      setError("No hiciste ningún cambio.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await editAudit(audit.id, changes);
      onSaved("Auditoría actualizada.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="proposal-modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">EDITAR {audit.id}</span>
            <h2>{audit.title}</h2>
            <p>
              {audit.status === "ACTIVE"
                ? "Auditoría en curso: puedes actualizar objetivo, responsable, fecha de fin y horas registradas."
                : "Auditoría aprobada: puedes ajustar la planificación y las horas planeadas; el título, el área, el tipo y el año quedan fijos."}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {error && <p className="planning-message error" role="alert">{error}</p>}

        <div className="proposal-form-grid">
          {can("responsibleId") && (
            <label>Responsable
              <select value={form.responsibleId} onChange={(e) => update("responsibleId", e.target.value)}>
                <option value="">Sin asignar</option>
                {auditors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          {can("quarter") && (
            <label>Trimestre
              <select required value={form.quarter} onChange={(e) => update("quarter", e.target.value)}>
                {QUARTERS.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
              </select>
            </label>
          )}
          {can("likelihood") && (
            <label>Probabilidad del riesgo
              <select value={form.likelihood} onChange={(e) => update("likelihood", Number(e.target.value))}>
                {RISK_FACTORS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
          )}
          {can("impact") && (
            <label>Impacto del riesgo
              <select value={form.impact} onChange={(e) => update("impact", Number(e.target.value))}>
                {RISK_FACTORS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
          )}
          {can("startDate") && (
            <label>Fecha de inicio
              <input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} />
            </label>
          )}
          {can("endDate") && (
            <label>Fecha de fin
              <input type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => update("endDate", e.target.value)} />
            </label>
          )}
          {can("plannedHours") && (
            <label>Horas planeadas
              <input type="number" min="0" max="100000" step="0.01" value={form.plannedHours}
                onChange={(e) => update("plannedHours", e.target.value)} placeholder="Sin registrar" />
            </label>
          )}
          {can("executedHours") && (
            <label>Horas ejecutadas
              <input type="number" min="0" max="100000" step="0.01" value={form.executedHours}
                onChange={(e) => update("executedHours", e.target.value)} placeholder="Sin registrar" />
            </label>
          )}
          {can("objective") && (
            <label className="full-width">Objetivo
              <textarea required value={form.objective} onChange={(e) => update("objective", e.target.value)} />
            </label>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={saving}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default EditAuditModal;
