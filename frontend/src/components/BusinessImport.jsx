import { useState } from "react";
import { FileUp } from "lucide-react";
import { applyBusinessImport, downloadBusinessImportTemplate, previewBusinessImport } from "../services/businessContextService";

const STATUS = { CREATE: "Lista para publicar", UNCHANGED: "Sin cambios", CONFLICT: "Conflicto", INVALID: "Dato inválido" };

export default function BusinessImport({ onApplied }) {
  const [sourceName, setSourceName] = useState("");
  const [file, setFile] = useState(null);
  const [prepared, setPrepared] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reset = () => { setPrepared(null); setPreview(null); setResult(null); setError(""); };
  const prepare = async (event) => {
    event.preventDefault(); setBusy(true); reset();
    try {
      if (!file || file.size > 55_000) throw new Error("Selecciona un archivo CSV, JSON o Excel de hasta 55 KB.");
      const format = file.name.toLowerCase().endsWith(".json") ? "json" :
        file.name.toLowerCase().endsWith(".csv") ? "csv" :
          file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : null;
      if (!format) throw new Error("El archivo debe terminar en .csv, .json o .xlsx.");
      let content;
      if (format === "xlsx") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 8192) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
        }
        content = btoa(binary);
      } else content = await file.text();
      const candidate = { format, sourceName, content };
      const next = await previewBusinessImport(candidate);
      setPrepared({ ...candidate, expectedDigest: next.previewDigest });
      setPreview(next);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!prepared) return;
    setBusy(true); setError("");
    try {
      const next = await applyBusinessImport(prepared);
      setResult(next);
      setPrepared(null);
      if (next.summary.created) {
        try { await onApplied(); }
        catch { setError("Las fichas se publicaron, pero la vista no se actualizó. Recarga la página para verlas."); }
      }
    } catch (cause) {
      setError(cause.message);
      if (cause.preview) setPreview(cause.preview);
      setPrepared(null);
    } finally { setBusy(false); }
  };
  return <section className="business-import" aria-label="Conector de archivos del mapa del negocio">
    <div className="business-import-heading"><FileUp aria-hidden="true" size={21} />
      <div><h2>Importar catálogo del negocio</h2>
        <p>Revisa antes de publicar. El archivo no modifica fichas existentes ni asigna permisos.</p></div></div>
    <form onSubmit={prepare} className="business-import-form">
      <label>Fuente declarada<input required minLength={3} maxLength={120} value={sourceName}
        onChange={(event) => { setSourceName(event.target.value); reset(); }}
        placeholder="Nombre del sistema o archivo de origen" /></label>
      <label>Archivo CSV, JSON o Excel<input required type="file" accept=".csv,.json,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => { setFile(event.target.files?.[0] || null); reset(); }} /></label>
      <button type="submit" disabled={busy}>{busy ? "Revisando…" : "Revisar archivo"}</button>
      <a href="/plantillas/mapa-negocio.csv" download>Descargar plantilla CSV</a>
      <button type="button" className="secondary-action" onClick={() => downloadBusinessImportTemplate().catch((cause) => setError(cause.message))}>Descargar plantilla Excel</button>
    </form>
    {error && <p className="business-context-error" role="alert">{error}</p>}
    {preview && <div className="business-import-preview">
      <h3>Vista previa · {preview.rows.length} filas</h3>
      <p>{preview.counts.CREATE} nuevas · {preview.counts.UNCHANGED} sin cambios · {preview.counts.CONFLICT} conflictos · {preview.counts.INVALID} inválidas</p>
      <div className="business-import-table-wrap"><table><thead><tr><th>Fila</th><th>Tipo</th><th>Código</th><th>Nombre</th><th>Estado</th><th>Detalle</th></tr></thead>
        <tbody>{preview.rows.map((row) => <tr key={row.line}><td>{row.line}</td><td>{row.kind}</td><td>{row.code}</td>
          <td>{row.name}</td><td>{STATUS[row.status]}</td><td>{row.message}</td></tr>)}</tbody></table></div>
      <p className="business-import-digest">SHA-256 del archivo: <code>{preview.fileDigest}</code></p>
      {prepared && <button type="button" className="primary-action" disabled={busy || Boolean(preview.counts.CONFLICT || preview.counts.INVALID)}
        onClick={apply}>{busy ? "Publicando…" : `Publicar ${preview.counts.CREATE} fichas nuevas`}</button>}
    </div>}
    {result && <p role="status" className={result.summary.failed ? "business-context-error" : "business-context-notice"}>
      {result.summary.created} fichas publicadas, {result.summary.unchanged} sin cambios, {result.summary.failed} fallidas y {result.summary.notApplied} sin aplicar.
      {result.summary.failed ? " Revisa el resultado y vuelve a preparar el archivo antes de reintentar." : ""}</p>}
    {result?.summary.failed > 0 && <div className="business-import-preview">
      <h3>Detalle de la publicación</h3>
      <div className="business-import-table-wrap"><table><thead><tr><th>Fila</th><th>Código</th><th>Estado</th><th>Detalle</th></tr></thead>
        <tbody>{result.results.map((row) => <tr key={row.line}><td>{row.line}</td><td>{row.code}</td>
          <td>{row.status === "CREATED" ? "Publicada" : row.status === "UNCHANGED" ? "Sin cambios" : "Fallida"}</td>
          <td>{row.message || "—"}</td></tr>)}</tbody></table></div>
      <p>{result.summary.notApplied} filas posteriores quedaron sin aplicar; prepara de nuevo el archivo para revisarlas antes de reintentar.</p>
    </div>}
    <p className="business-import-note">La fuente es declarada por quien importa; el hash identifica el archivo, pero no certifica su origen. Usa solo información autorizada y confirma las estructuras empresariales antes de publicarlas.</p>
  </section>;
}
