import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ExternalLink, FileCheck2, FileImage, FileText, Plus, Search, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import useAutomaticRefresh from "../hooks/useAutomaticRefresh";
import ShareLinkButton from "../components/ShareLinkButton";
import { BookmarkButton, SaveViewButton } from "../components/WorkspaceActions";
import EvidenceAssistantDialog from "../components/EvidenceAssistantDialog";
import { createEvidence, getEvidence, getEvidenceDownloadUrl, uploadEvidenceFile } from "../services/evidenceService";
import { evidenceFileKey, uploadEvidenceBatch } from "../services/evidenceBatchUpload";
import { getRisks } from "../services/riskService";
import { getControls } from "../services/controlService";
import { getPlanningAudits } from "../services/planningService";
import "./Evidencias.css";
import { PLANNING_APPROVE_ROLES } from "../constants/planning";
import { evidenceViewQuery, parseEvidenceView } from "../services/evidenceView";

const EMPTY = { title: "", description: "", evidenceType: "DOCUMENT", reference: "", entityType: "RISK", entityId: "" };
const ENTITY_LABELS = { RISK: "Riesgo", CONTROL: "Control", AUDIT: "Auditoría" };
const TYPE_LABELS = { DOCUMENT: "Documento", SCREENSHOT: "Captura", REPORT: "Informe", OTHER: "Otro" };
const safeLink = (value) => /^https:\/\//i.test(value);
const formatDate = (value) => new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
const labelForEntity = (entity) => `${entity.id} · ${entity.title}`;
const versionsEnabled = import.meta.env.VITE_VERA_EVIDENCE_VERSIONS_ENABLED === "true";
const indexLabel = (index, mime) => {
  if (index?.unavailable) return "Estado de lectura temporalmente no disponible";
  if (index?.status === "ready") return index.truncated
    ? `Texto indexado · lectura parcial (${index.chunks} fragmentos)`
    : `Texto indexado (${index.chunks} fragmentos); revisa el original`;
  if (index?.status === "pending" && mime?.startsWith("image/")) return "Extracción con IA disponible al solicitarla";
  return {
    "no-text": "Sin texto legible", pending: "Lectura pendiente",
    unsupported: "Extracción no disponible", unknown: "Cobertura no registrada"
  }[index?.status] ||
    "Cobertura no registrada";
};
const currentUser = JSON.parse(
  localStorage.getItem("user") || "null"
);

const canCreate = currentUser?.role !== "DIRECTOR";
const canAttachToAudit =
  PLANNING_APPROVE_ROLES.includes(currentUser?.role);

function Evidencias() {
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [risks, setRisks] = useState([]);
  const [controls, setControls] = useState([]);
  const [audits, setAudits] = useState([]);
  const { search, filter } = parseEvidenceView(location.search);
  const updateView = (next) => {
    const query = evidenceViewQuery(next);
    navigate({ pathname: location.pathname, search: query ? `?${query}` : "", hash: location.hash }, { replace: true });
  };
  const setSearch = (value) => updateView({ search: value, filter });
  const setFilter = (value) => updateView({ search, filter: value });
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [batchResults, setBatchResults] = useState([]);
  const [uploadPosition, setUploadPosition] = useState(null);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [dragging, setDragging] = useState(false);
  const uploadController = useRef(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [assistantEvidence, setAssistantEvidence] = useState(null);
  const [revisingId, setRevisingId] = useState(null);

  const load = async () => {
    const [allEvidence, allRisks, allControls, allAudits] = await Promise.all([getEvidence(), getRisks(), getControls(), getPlanningAudits()]);
    setItems(allEvidence); setRisks(allRisks); setControls(allControls); setAudits(allAudits);
  };
  useAutomaticRefresh(load, !modal && !saving);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getEvidence(), getRisks(), getControls(), getPlanningAudits()])
      .then(([allEvidence, allRisks, allControls, allAudits]) => { if (!cancelled) { setItems(allEvidence); setRisks(allRisks); setControls(allControls); setAudits(allAudits); } })
      .catch((loadError) => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    try {
      const target = decodeURIComponent(location.hash.slice(1));
      if (target.startsWith("evidence-")) document.getElementById(target)?.scrollIntoView({ block: "center" });
    } catch { /* Un fragmento inválido no altera la lista. */ }
  }, [location.hash, items]);

  const entities = useMemo(() => ({ RISK: risks, CONTROL: controls, AUDIT: audits }[form.entityType] || []), [form.entityType, risks, controls, audits]);
  const supersededIds = new Set(items.map((item) => item.previousVersionId).filter(Boolean));
  const currentVersions = items.filter((item) => !supersededIds.has(item.id));
  const visible = currentVersions.filter((item) => (filter === "ALL" || item.entityType === filter) && (!search || `${item.title} ${item.description} ${item.reference} ${item.entityTitle}`.toLowerCase().includes(search.toLowerCase())));
  const counts = ["RISK", "CONTROL", "AUDIT"].map((entityType) => ({ entityType, count: currentVersions.filter((item) => item.entityType === entityType).length }));

  const chooseFiles = (selected) => {
    const candidates = [...(selected || [])];
    if (candidates.length > 10) { setError("Selecciona como máximo 10 archivos por lote."); return false; }
    const keys = new Set();
    for (const file of candidates) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "xls", "xlsx", "doc", "docx", "png", "jpg", "jpeg", "webp", "csv", "txt"].includes(extension)) {
        setError("Selecciona PDF, Excel, Word, CSV, TXT o una imagen compatible."); return false;
      }
      if (file.size > 3 * 1024 * 1024) { setError(`${file.name} supera el límite de 3 MB.`); return false; }
      if (keys.has(evidenceFileKey(file))) { setError("Hay archivos repetidos en el lote."); return false; }
      keys.add(evidenceFileKey(file));
    }
    setError(""); setFiles(candidates); setBatchResults([]); setUploadProgress(null); return true;
  };
  const openCreate = () => { setForm({ ...EMPTY, entityId: risks[0]?.id || "" }); setFiles([]); setBatchResults([]); setUploadProgress(null); setError(""); setModal(true); };
  const closeModal = () => { if (saving) return; setModal(false); setFiles([]); setBatchResults([]); setUploadProgress(null); setError(""); };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (files.length) {
        uploadController.current = new AbortController();
        setUploadProgress(0);
        const results = await uploadEvidenceBatch(files, form, uploadEvidenceFile, {
          signal: uploadController.current.signal, previous: batchResults,
          onProgress: ({ index, count, percent }) => { setUploadPosition({ index, count }); setUploadProgress(percent); },
          onResult: (result) => setBatchResults((current) => [...current.filter((item) => item.key !== result.key), result])
        });
        await load();
        const saved = results.filter((result) => result.status === "saved").length;
        if (saved === files.length) {
          closeModal(); setMessage(files.length === 1 ? "Archivo cargado y vinculado. Revisa su cobertura de lectura en la lista."
            : `${saved} archivos cargados y vinculados. Revisa su cobertura de lectura en la lista.`);
        } else {
          setMessage(`${saved} de ${files.length} archivos confirmados. Revisa los pendientes antes de reintentar.`);
          setError(results.some((result) => result.status === "uncertain")
            ? "La respuesta de algún archivo quedó sin confirmar. Comprueba la lista y vuelve a seleccionar solo los que falten."
            : "Algunos archivos fueron rechazados. Puedes reintentar únicamente los fallidos.");
        }
      } else {
        await createEvidence(form);
        await load(); closeModal(); setMessage("Referencia de evidencia registrada y vinculada.");
      }
    } catch (submitError) { setError(submitError.message); }
    finally { uploadController.current = null; setSaving(false); setUploadPosition(null); }
  };

  const download = async (item) => {
    try { window.location.assign(await getEvidenceDownloadUrl(item.id)); }
    catch (cause) { setError(cause.message); }
  };
  const revise = async (item, file) => {
    if (!file) return;
    if (file.size === 0 || file.size > 3 * 1024 * 1024) { setError("El archivo debe tener entre 1 byte y 3 MB."); return; }
    setRevisingId(item.id); setError("");
    try {
      await uploadEvidenceFile({ title: item.title, description: item.description,
        evidenceType: item.evidenceType, entityType: item.entityType,
        entityId: item.entityId, revisionOf: item.id }, file);
      await load(); setMessage("Nueva versión guardada; las anteriores siguen disponibles.");
    } catch (cause) { setError(cause.message); }
    finally { setRevisingId(null); }
  };

  return <div className="dashboard-layout"><Sidebar active="evidencias" /><main className="dashboard-main"><section className="dashboard-content evidence-page">
    <header className="dashboard-header"><div><span className="eyebrow">EXPEDIENTE DIGITAL</span><h1>Evidencias</h1><p>Organiza archivos y referencias de respaldo vinculados con riesgos, controles o auditorías.</p></div>{canCreate && (<button className="primary-action" onClick={openCreate}><Plus size={18} /> Registrar evidencia</button>)}</header>
    {message && <p className="evidence-feedback success">{message}</p>}{error && !modal && <p className="evidence-feedback error">{error}</p>}
    <div className="evidence-summary"><article><strong>{currentVersions.length}</strong><span>referencias registradas</span></article>{counts.map(({ entityType, count }) => <article key={entityType}><strong>{count}</strong><span>vinculadas a {ENTITY_LABELS[entityType].toLowerCase()}s</span></article>)}</div>
    <div className="evidence-notice"><FileCheck2 size={19} /><p><b>Expediente privado.</b> Puedes registrar una referencia externa o cargar hasta 10 archivos PDF, DOCX, imagen, TXT, Excel o CSV de 3 MB cada uno. {import.meta.env.VITE_VERA_RESUMABLE_UPLOADS_ENABLED === "true" && "Si se interrumpe una carga, vuelve a seleccionar el mismo archivo y entidad para continuar desde las partes confirmadas. "}La consulta con IA lee texto de PDF, DOCX, TXT y CSV. Para imágenes, puedes iniciar la extracción con IA de forma explícita; los PDF escaneados aún requieren OCR de páginas. Los archivos requieren Supabase Storage configurado en el backend.</p></div>
    {form.entityType === "AUDIT" && !canAttachToAudit && (
      <small>
        Tu cuenta puede consultar esta auditoría, pero no tiene
        permisos para adjuntar archivos.
      </small>
    )}
    <div className="evidence-toolbar"><label className="evidence-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar evidencia, entidad o referencia" /></label><div className="evidence-filter">{["ALL", "RISK", "CONTROL", "AUDIT"].map((value) => <button key={value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{value === "ALL" ? "Todas" : ENTITY_LABELS[value]}</button>)}</div></div>
    <div className="evidence-view-actions"><small>La búsqueda escrita aparece en el enlace.</small><ShareLinkButton path={`${location.pathname}${location.search}`} label="Copiar vista" /><SaveViewButton userId={currentUser?.roleTour ? null : currentUser?.id} path={`${location.pathname}${location.search}`} defaultName="Evidencias" /></div>
    {loading ? <div className="evidence-empty">Cargando expediente...</div> : visible.length === 0 ? <div className="evidence-empty"><FileCheck2 size={22} /><div><b>No hay evidencias para mostrar</b><p>Registra una referencia o carga un archivo y asígnalo a una entidad.</p></div></div> : <div className="evidence-list">{visible.map((item) =>
      <article id={`evidence-${item.id}`} className="evidence-card" key={item.id}>
        <div className="evidence-icon">{item.evidenceType === "SCREENSHOT" ? <FileImage size={21} /> : <FileText size={21} />}</div>
        <div className="evidence-card-main">
          <div className="evidence-card-tags"><span className="evidence-type">{TYPE_LABELS[item.evidenceType]}</span><span className="evidence-entity-type">{ENTITY_LABELS[item.entityType]} · {item.entityId}</span></div>
          <h2>{item.title}</h2><p>{item.description}</p>
          <div className="evidence-meta"><span><b>Relacionada con:</b> {item.entityTitle}</span><span><b>Registró:</b> {item.author.name}</span><span>{formatDate(item.createdAt)}</span></div>
          <div className="evidence-reference"><b>{item.file ? `Archivo · versión ${item.versionNumber || 1}:` : "Referencia:"}</b> {item.file ? <button type="button" className="secondary-action" onClick={() => download(item)}>Descargar archivo ({Math.ceil(item.file.size / 1024)} KB)</button> : safeLink(item.reference) ? <a href={item.reference} target="_blank" rel="noreferrer">Abrir referencia <ExternalLink size={13} /></a> : <span>{item.reference}</span>}</div>
          {versionsEnabled && item.file && canCreate && (item.entityType !== "AUDIT" || canAttachToAudit) && <label className="evidence-revision-upload">{revisingId === item.id ? "Guardando versión…" : "Subir nueva versión"}<input type="file" accept=".pdf,.xls,.xlsx,.doc,.docx,.png,.jpg,.jpeg,.webp,.csv,.txt" disabled={Boolean(revisingId)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; revise(item, file); }} /></label>}
          {item.file && item.versionNumber > 1 && <details className="evidence-version-history"><summary>Versiones anteriores</summary><ol>{items.filter((candidate) => candidate.id === (item.versionRootId || item.id) || candidate.versionRootId === item.versionRootId).filter((candidate) => candidate.id !== item.id).sort((a, b) => (b.versionNumber || 1) - (a.versionNumber || 1)).map((candidate) => <li key={candidate.id}>Versión {candidate.versionNumber || 1} · {formatDate(candidate.createdAt)} · <button type="button" className="secondary-action" onClick={() => download(candidate)}>Descargar</button></li>)}</ol></details>}
          {item.file && <small className="evidence-index-coverage">{indexLabel(item.contentIndex, item.file.mime)}</small>}
          {item.file && ["application/pdf", "text/plain", "text/csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg", "image/webp"].includes(item.file.mime) && <button type="button" className="secondary-action evidence-ai-open" onClick={() => setAssistantEvidence(item)}><FileText size={15} aria-hidden="true" /> Consultar contenido con IA</button>}
          <ShareLinkButton path={`/evidencias#evidence-${encodeURIComponent(item.id)}`} />
          <BookmarkButton userId={currentUser?.roleTour ? null : currentUser?.id} path={`/evidencias#evidence-${encodeURIComponent(item.id)}`} label={`Evidencia ${item.id}`} />
        </div>
      </article>)}</div>}
    <p className="evidence-footnote">La persistencia de metadatos depende de `VERA_EVIDENCE_COMMENT_STORE`; los archivos se guardan en un bucket privado de Supabase. La activación del despliegue debe verificarse por separado.</p>
  </section></main>
    {canCreate && modal && (<div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><form className="proposal-modal evidence-modal" onSubmit={submit}><div className="modal-header"><div><span className="eyebrow">NUEVA EVIDENCIA</span><h2>Registrar evidencia</h2><p>Vincula un archivo privado o una referencia externa con el portafolio.</p></div><button type="button" className="modal-close" onClick={closeModal} aria-label="Cerrar"><X size={20} /></button></div>{error && <p className="evidence-feedback error">{error}</p>}<div className="proposal-form-grid"><label className="full-width">Nombre<input required minLength="3" maxLength="120" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Informe de revisión trimestral" /></label><label className="full-width">Descripción<textarea required minLength="10" maxLength="1000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Qué demuestra y por qué respalda el expediente" /></label><label>Tipo<select value={form.evidenceType} onChange={(event) => setForm({ ...form, evidenceType: event.target.value })}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Vincular con<select value={form.entityType} onChange={(event) => { const nextType = event.target.value; const nextEntities = { RISK: risks, CONTROL: controls, AUDIT: audits }[nextType]; setForm({ ...form, entityType: nextType, entityId: nextEntities[0]?.id || "" }); }}>{Object.entries(ENTITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="full-width">Elemento relacionado<select required value={form.entityId} onChange={(event) => setForm({ ...form, entityId: event.target.value })}><option value="">Selecciona una entidad</option>{entities.map((entity) => <option value={entity.id} key={entity.id}>{labelForEntity(entity)}</option>)}</select></label>
      <label className={`full-width evidence-drop-zone ${dragging ? "dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (!saving) chooseFiles(event.dataTransfer.files); }}>
        Archivos privados (PDF, Excel, Word, CSV o imágenes; hasta 10 de 3 MB cada uno)
        <input
          type="file"
          multiple
          accept=".pdf,.xls,.xlsx,.doc,.docx,.png,.jpg,.jpeg,.webp,.csv,.txt"
          disabled={saving}
          onChange={(event) => {
            if (!chooseFiles(event.target.files)) event.target.value = "";
          }}
        />
        <small>{files.length ? `${files.length} archivo${files.length === 1 ? "" : "s"} seleccionado${files.length === 1 ? "" : "s"}` : "También puedes arrastrar varios archivos aquí."}</small>
      </label> {!files.length && <label className="full-width">Enlace HTTPS o identificador externo<input required minLength="3" maxLength="500" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="https://drive.google.com/... o archivo-expediente-042" /></label>}</div>
      {files.length > 0 && <ul className="evidence-batch-list" aria-label="Estado de archivos seleccionados">{files.map((selected) => {
        const result = batchResults.find((item) => item.key === evidenceFileKey(selected));
        return <li key={evidenceFileKey(selected)}><span>{selected.name} · {Math.ceil(selected.size / 1024)} KB</span><small>{result?.status === "saved" ? "Guardado" : result?.status === "uncertain" ? "Estado incierto: comprueba la lista" : result?.status === "error" ? `Error: ${result.message}` : "Pendiente"}</small></li>;
      })}</ul>}
      {saving && files.length > 0 && <div className="evidence-upload-status" role="status"><span>{uploadProgress === 100 ? "Archivo enviado; guardando registro…" : `Archivo ${uploadPosition ? uploadPosition.index + 1 : 1} de ${files.length} · ${uploadProgress ?? 0}%`}</span><progress value={uploadProgress ?? 0} max="100" aria-label="Progreso de carga" /></div>}
      <div className="modal-actions"><button type="button" className="secondary-action" onClick={saving && files.length ? () => uploadController.current?.abort() : closeModal} disabled={saving && !files.length}>{saving && files.length ? "Detener lote" : "Cancelar"}</button><button type="submit" className="primary-action" disabled={saving || batchResults.some((result) => result.status === "uncertain") || (form.entityType === "AUDIT" && !canAttachToAudit)}>{saving ? "Guardando..." : files.length ? batchResults.some((result) => result.status === "error") ? "Reintentar archivos fallidos" : `Cargar ${files.length} archivo${files.length === 1 ? "" : "s"}` : "Guardar referencia"}</button></div></form></div>)}
    {assistantEvidence && <EvidenceAssistantDialog evidence={assistantEvidence} onClose={() => setAssistantEvidence(null)} />}
  </div>;
}

export default Evidencias;
