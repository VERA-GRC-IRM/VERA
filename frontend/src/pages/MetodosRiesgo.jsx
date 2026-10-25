import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { getMethodDrafts, getMethodRevisions, previewMethod, saveMethodDraft } from "../services/riskMethodService";
import "./MetodosRiesgo.css";

const empty = () => ({ name: "", version: "", likelihoodText: "", impactText: "", levelsText: "",
  matrix: [], revisionReason: "" });
const lines = (value) => value.split("\n").map((part) => part.trim()).filter(Boolean);
const fromRecord = (record) => ({ name: record.name, version: "", likelihoodText: record.likelihood.join("\n"),
  impactText: record.impact.join("\n"), levelsText: record.levels.join("\n"),
  matrix: record.matrix.map((row) => [...row]), revisionReason: "" });
const draftFor = (form) => ({ name: form.name, version: form.version, likelihood: lines(form.likelihoodText),
  impact: lines(form.impactText), levels: lines(form.levelsText), matrix: form.matrix,
  ...(form.revisionReason ? { revisionReason: form.revisionReason } : {}) });
const dateFor = (value) => new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

function MetodosRiesgo() {
  const [methods, setMethods] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [revisions, setRevisions] = useState([]);
  const [form, setForm] = useState(empty);
  const [previewForm, setPreviewForm] = useState({ stage: "INHERENT", likelihoodIndex: 1, impactIndex: 1,
    assumptionNote: "", controlEvidenceNote: "", treatmentAssumption: "" });
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const likelihood = lines(form.likelihoodText);
  const impact = lines(form.impactText);
  const levels = lines(form.levelsText);

  useEffect(() => {
    getMethodDrafts().then(setMethods).catch((cause) => setError(cause.message)).finally(() => setLoading(false));
  }, []);
  const selectMethod = async (record) => {
    setSelectedId(record.methodId); setForm(fromRecord(record)); setPreview(null); setError(""); setMessage("");
    try { setRevisions(await getMethodRevisions(record.methodId)); }
    catch (cause) { setError(cause.message); }
  };
  const startNew = () => {
    setSelectedId(""); setRevisions([]); setForm(empty()); setPreview(null); setError(""); setMessage("");
  };
  const setCell = (row, column, value) => setForm((current) => {
    const matrix = current.matrix.map((items) => [...items]);
    if (!matrix[row]) matrix[row] = [];
    matrix[row][column] = value;
    return { ...current, matrix };
  });
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const saved = await saveMethodDraft(draftFor(form), selectedId || null);
      setMethods(await getMethodDrafts());
      setSelectedId(saved.methodId); setRevisions(await getMethodRevisions(saved.methodId));
      setForm(fromRecord(saved)); setPreview(null);
      setMessage(`Borrador v${saved.revision} guardado. No está aprobado ni disponible para evaluar riesgos.`);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const runPreview = async () => {
    setBusy(true); setError(""); setPreview(null);
    try { setPreview(await previewMethod({ method: draftFor(form), ...previewForm })); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  return <div className="dashboard-layout">
    <Sidebar active="metodos-riesgo" />
    <main className="dashboard-main"><section className="dashboard-content method-page">
      <header className="dashboard-header"><div><span className="eyebrow">DECISIONES DE RIESGO</span>
        <h1>Métodos de evaluación</h1><p>Diseña matrices cualitativas y conserva cada revisión para deliberación.</p></div></header>
      <p className="method-caution">Estos métodos son borradores. Ninguno sustituye la matriz histórica ni se aplica a riesgos registrados hasta que exista una política aprobada.</p>
      {error && <p className="method-error" role="alert">{error}</p>}
      {message && <p className="method-success" role="status">{message}</p>}
      <div className="method-layout">
        <aside className="method-catalog" aria-label="Borradores de métodos"><div className="method-section-title"><h2>Catálogo</h2><button type="button" onClick={startNew}>Nuevo método</button></div>
          {loading ? <p>Cargando métodos…</p> : methods.length === 0 ? <p>Aún no hay borradores guardados.</p> :
            <ul>{methods.map((record) => <li key={record.methodId}><button type="button" aria-current={selectedId === record.methodId ? "true" : undefined}
              onClick={() => selectMethod(record)}><strong>{record.name}</strong><span>{record.version} · revisión {record.revision}</span></button></li>)}</ul>}
        </aside>
        <div className="method-editor"><form onSubmit={submit}>
          <div className="method-section-title"><h2>{selectedId ? "Nueva revisión" : "Nuevo borrador"}</h2><span>Sin efectos en evaluaciones</span></div>
          <div className="method-fields"><label>Nombre del método<input required minLength="4" maxLength="120" value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Identificador de versión<input required maxLength="32" value={form.version} placeholder="Por ejemplo, borrador-2"
            onChange={(event) => setForm({ ...form, version: event.target.value })} /></label>
          <label>Probabilidad, de menor a mayor<textarea required rows="4" value={form.likelihoodText} placeholder={"Una categoría por línea\nRara\nPosible"}
            onChange={(event) => setForm({ ...form, likelihoodText: event.target.value })} /></label>
          <label>Impacto, de menor a mayor<textarea required rows="4" value={form.impactText} placeholder={"Una categoría por línea\nMenor\nGrave"}
            onChange={(event) => setForm({ ...form, impactText: event.target.value })} /></label>
          <label>Niveles, de menor a mayor<textarea required rows="4" value={form.levelsText} placeholder={"Una categoría por línea\nBajo\nAlto"}
            onChange={(event) => setForm({ ...form, levelsText: event.target.value })} /></label>
          {selectedId && <label>Motivo de la nueva revisión<textarea required minLength="10" maxLength="500" value={form.revisionReason}
            onChange={(event) => setForm({ ...form, revisionReason: event.target.value })} /></label>}</div>
          <div className="method-matrix"><h3>Matriz</h3><p>Filas: probabilidad. Columnas: impacto. Cada celda debe usar uno de los niveles y la severidad no puede disminuir al aumentar un eje.</p>
            {likelihood.length > 0 && impact.length > 0 && levels.length > 0 &&
              <div className="method-table-scroll"><table><thead><tr><th scope="col">Probabilidad / Impacto</th>{impact.map((name, column) => <th scope="col" key={`${column}-${name}`}>{name}</th>)}</tr></thead>
                <tbody>{likelihood.map((name, row) => <tr key={`${row}-${name}`}><th scope="row">{name}</th>{impact.map((_, column) => <td key={column}>
                  <select aria-label={`${name} y ${impact[column]}`} required value={form.matrix[row]?.[column] || ""} onChange={(event) => setCell(row, column, event.target.value)}>
                    <option value="">Seleccionar</option>{levels.map((level) => <option key={level} value={level}>{level}</option>)}
                  </select></td>)}</tr>)}</tbody></table></div>}
          </div>
          <button className="primary-action" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar borrador"}</button>
        </form>
        <section className="method-preview" aria-label="Simulación de evaluación"><h2>Simular un caso</h2><p>Esta simulación no se guarda ni verifica la eficacia de controles.</p>
          <div className="method-fields"><label>Tipo de evaluación<select value={previewForm.stage} onChange={(event) => setPreviewForm({ ...previewForm, stage: event.target.value })}>
            <option value="INHERENT">Inherente</option><option value="RESIDUAL">Residual</option><option value="TARGET">Objetivo</option></select></label>
          <label>Probabilidad<select value={previewForm.likelihoodIndex} onChange={(event) => setPreviewForm({ ...previewForm, likelihoodIndex: Number(event.target.value) })}>
            {likelihood.map((name, index) => <option key={index} value={index + 1}>{name}</option>)}</select></label>
          <label>Impacto<select value={previewForm.impactIndex} onChange={(event) => setPreviewForm({ ...previewForm, impactIndex: Number(event.target.value) })}>
            {impact.map((name, index) => <option key={index} value={index + 1}>{name}</option>)}</select></label>
          <label>Supuestos<textarea value={previewForm.assumptionNote} onChange={(event) => setPreviewForm({ ...previewForm, assumptionNote: event.target.value })} /></label>
          {previewForm.stage === "RESIDUAL" && <label>Evidencia de controles declarada<textarea value={previewForm.controlEvidenceNote} onChange={(event) => setPreviewForm({ ...previewForm, controlEvidenceNote: event.target.value })} /></label>}
          {previewForm.stage === "TARGET" && <label>Supuesto de tratamiento<textarea value={previewForm.treatmentAssumption} onChange={(event) => setPreviewForm({ ...previewForm, treatmentAssumption: event.target.value })} /></label>}</div>
          <button type="button" onClick={runPreview} disabled={busy}>Calcular vista previa</button>
          {preview && <p role="status"><b>Resultado: {preview.level}</b> · {preview.likelihood} × {preview.impact}. No aprobado ni persistido.</p>}
        </section>
        {revisions.length > 0 && <section className="method-revisions"><h2>Historial inmutable</h2><ol>{[...revisions].reverse().map((record) => <li key={record.id}>
          <b>Revisión {record.revision} · {record.version}</b><span>{dateFor(record.createdAt)} · {record.createdBy?.username}</span>
          <p>{record.revisionReason}</p></li>)}</ol></section>}
        </div>
      </div>
    </section></main>
  </div>;
}

export default MetodosRiesgo;
