import { useState } from "react";
import { createRiskCategory, publishRiskTemplate, reviseRiskTemplate } from "../services/riskLibraryService";

const EMPTY_CATEGORY = { code: "", name: "", description: "", parentId: "" };
const EMPTY_TEMPLATE = { categoryId: "", title: "", scenario: "", causes: "", consequences: "", sourceNote: "", revisionReason: "" };
const toLines = (value) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const templatePayload = (form) => ({
  categoryId: form.categoryId, title: form.title, scenario: form.scenario,
  causes: toLines(form.causes), consequences: toLines(form.consequences), sourceNote: form.sourceNote || null
});

function RiskLibraryAdmin({ categories, templates, onChanged }) {
  const [mode, setMode] = useState("category");
  const [category, setCategory] = useState(EMPTY_CATEGORY);
  const [template, setTemplate] = useState(EMPTY_TEMPLATE);
  const [selectedId, setSelectedId] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const original = templates.find((item) => item.templateId === selectedId);
  const setField = (name) => (event) => setTemplate((current) => ({ ...current, [name]: event.target.value }));
  const switchMode = (next) => { setMode(next); setError(""); setMessage(""); setAcknowledged(false); };
  const selectTemplate = (id) => {
    const current = templates.find((item) => item.templateId === id);
    setSelectedId(id); setAcknowledged(false); setError("");
    setTemplate(current ? {
      categoryId: current.categoryId, title: current.title, scenario: current.scenario,
      causes: current.causes.join("\n"), consequences: current.consequences.join("\n"),
      sourceNote: current.sourceNote || "", revisionReason: ""
    } : EMPTY_TEMPLATE);
  };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      if (mode === "category") {
        await createRiskCategory({ ...category, parentId: category.parentId || null });
        setCategory(EMPTY_CATEGORY); setMessage("Categoría creada. Ya aparece en la biblioteca.");
      } else if (mode === "publish") {
        await publishRiskTemplate(templatePayload(template));
        setTemplate(EMPTY_TEMPLATE); setMessage("Plantilla publicada como versión 1.");
      } else {
        if (!original || !acknowledged) throw new Error("Selecciona una plantilla y confirma la revisión.");
        await reviseRiskTemplate(selectedId, { ...templatePayload(template), revisionReason: template.revisionReason });
        setSelectedId(""); setTemplate(EMPTY_TEMPLATE); setAcknowledged(false);
        setMessage("Nueva versión publicada. La versión anterior permanece en el historial.");
      }
      await onChanged();
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };

  return <section className="risk-library-admin" aria-labelledby="risk-library-admin-heading">
    <h2 id="risk-library-admin-heading">Administrar biblioteca</h2>
    <p>Publica solo contenido revisado. Cada versión queda registrada; las plantillas no modifican riesgos existentes.</p>
    <div className="risk-library-admin-modes" role="group" aria-label="Tipo de publicación">
      <button type="button" aria-pressed={mode === "category"} onClick={() => switchMode("category")}>Nueva categoría</button>
      <button type="button" aria-pressed={mode === "publish"} onClick={() => switchMode("publish")}>Nueva plantilla</button>
      <button type="button" aria-pressed={mode === "revise"} onClick={() => switchMode("revise")}>Nueva versión</button>
    </div>
    {error && <p role="alert" className="risk-library-admin-error">{error}</p>}
    {message && <p role="status" className="risk-library-admin-success">{message}</p>}
    <form onSubmit={submit} className="risk-library-admin-form">
      {mode === "category" ? <>
        <label>Código único<input required pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,31}" maxLength="32" value={category.code}
          onChange={(event) => setCategory({ ...category, code: event.target.value })} /></label>
        <label>Nombre<input required minLength="3" maxLength="120" value={category.name}
          onChange={(event) => setCategory({ ...category, name: event.target.value })} /></label>
        <label className="wide">Descripción<textarea required minLength="10" maxLength="1000" value={category.description}
          onChange={(event) => setCategory({ ...category, description: event.target.value })} /></label>
        <label className="wide">Categoría superior (opcional)<select value={category.parentId}
          onChange={(event) => setCategory({ ...category, parentId: event.target.value })}>
          <option value="">Sin categoría superior</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}
        </select></label>
      </> : <>
        {mode === "revise" && <label className="wide">Plantilla a revisar<select required value={selectedId}
          onChange={(event) => selectTemplate(event.target.value)}><option value="">Seleccionar plantilla</option>
          {templates.map((item) => <option key={item.templateId} value={item.templateId}>{item.title} · versión {item.revision}</option>)}
        </select></label>}
        <label className="wide">Categoría<select required value={template.categoryId} onChange={setField("categoryId")}>
          <option value="">Seleccionar categoría</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="wide">Título<input required minLength="5" maxLength="160" value={template.title} onChange={setField("title")} /></label>
        <label className="wide">Escenario<textarea required minLength="20" maxLength="2000" value={template.scenario} onChange={setField("scenario")} /></label>
        <label>Causas (una por línea, máximo 8)<textarea required value={template.causes} onChange={setField("causes")} /></label>
        <label>Consecuencias (una por línea, máximo 8)<textarea required value={template.consequences} onChange={setField("consequences")} /></label>
        <label className="wide">Referencia o fuente (opcional)<input maxLength="500" value={template.sourceNote} onChange={setField("sourceNote")} /></label>
        {mode === "revise" && <>
          <label className="wide">Motivo de revisión<textarea required minLength="10" maxLength="500" value={template.revisionReason} onChange={setField("revisionReason")} /></label>
          {original && <div className="risk-library-comparison wide" aria-label="Comparación antes de publicar">
            <h3>Comparar con versión {original.revision}</h3>
            <div><section><h4>Publicada</h4><p><b>Categoría:</b> {categories.find((item) => item.id === original.categoryId)?.name || original.categoryId}</p><p>{original.title}</p><p>{original.scenario}</p><p><b>Causas:</b> {original.causes.join(" · ")}</p><p><b>Consecuencias:</b> {original.consequences.join(" · ")}</p><p><b>Referencia:</b> {original.sourceNote || "Sin referencia"}</p></section>
              <section><h4>Propuesta</h4><p><b>Categoría:</b> {categories.find((item) => item.id === template.categoryId)?.name || template.categoryId}</p><p>{template.title}</p><p>{template.scenario}</p><p><b>Causas:</b> {toLines(template.causes).join(" · ")}</p><p><b>Consecuencias:</b> {toLines(template.consequences).join(" · ")}</p><p><b>Referencia:</b> {template.sourceNote || "Sin referencia"}</p></section></div>
          </div>}
          <label className="risk-library-confirm wide"><input type="checkbox" required checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)} /> Confirmo la publicación de una nueva versión inmutable; la anterior seguirá disponible.</label>
        </>}
      </>}
      <button className="primary-action wide" type="submit" disabled={saving || (mode === "revise" && !selectedId)}>
        {saving ? "Guardando…" : mode === "category" ? "Crear categoría" : mode === "publish" ? "Publicar plantilla" : "Publicar nueva versión"}
      </button>
    </form>
  </section>;
}

export default RiskLibraryAdmin;
