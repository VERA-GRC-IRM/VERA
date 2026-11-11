import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { useDocumentTitle } from "../contexts/useDocumentTitle";
import { getOfflineSnapshot } from "../services/offlineSnapshots";
import { downloadOfflineReportCsv, filterOfflineReport, offlineReportIndicators } from "../services/offlineReport";
import "./OfflineReport.css";

const FIELDS = [
  { id: "year", label: "Año" }, { id: "quarter", label: "Trimestre" },
  { id: "orgUnitId", label: "Unidad" }, { id: "status", label: "Estado" },
  { id: "responsible", label: "Responsable" }
];
const uniqueOptions = (rows, field) => [...new Set(rows.map(({ audit }) => String(audit[field] ?? "")).filter(Boolean))].sort();
const related = (items) => (items || []).map((item) => item.title).join("; ") || "—";

function OfflineReport() {
  useDocumentTitle("Informe local");
  const [source] = useState(() => {
    try { return { snapshot: getOfflineSnapshot("report") }; }
    catch (error) { return { error: error.message }; }
  });
  const [filters, setFilters] = useState({ year: "", quarter: "", orgUnitId: "", status: "", responsible: "" });
  const allRows = useMemo(() => source.snapshot?.data?.rows || [], [source.snapshot]);
  const rows = useMemo(() => filterOfflineReport(allRows, filters), [allRows, filters]);
  const indicators = useMemo(() => offlineReportIndicators(rows), [rows]);

  return <div className="dashboard-layout offline-report-layout">
    <Sidebar active="offline" />
    <main className="dashboard-main"><section className="dashboard-content offline-report">
      <header className="dashboard-header"><div>
        <span className="eyebrow">INFORME LOCAL · SOLO LECTURA</span>
        <h1>Informe del portafolio</h1>
        <p>Información autorizada guardada en este dispositivo. Para decisiones formales, confirma los datos actuales con el servidor.</p>
      </div></header>
      {source.error ? <div className="offline-report-empty" role="alert">
        <p>{source.error}</p><Link to="/sin-conexion">Abrir espacio local</Link>
      </div> : <>
        <p className="offline-report-stamp">Copia guardada: {new Date(source.snapshot.savedAt).toLocaleString("es-MX")} · Alcance: {source.snapshot.data.scope}</p>
        <div className="offline-report-filters">{FIELDS.map(({ id, label }) => <label key={id}>{label}
          <select value={filters[id]} onChange={(event) => setFilters((current) => ({ ...current, [id]: event.target.value }))}>
            <option value="">Todos</option>
            {uniqueOptions(allRows, id).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>)}</div>
        <div className="offline-report-actions">
          <button type="button" className="secondary-action" onClick={() => setFilters({ year: "", quarter: "", orgUnitId: "", status: "", responsible: "" })}>Limpiar filtros</button>
          <button type="button" className="secondary-action" onClick={() => downloadOfflineReportCsv(rows)}>Descargar CSV</button>
          <button type="button" className="primary-action" onClick={() => window.print()}>Imprimir o guardar PDF</button>
        </div>
        <div className="offline-report-kpis" aria-label="Indicadores del informe filtrado">
          {Object.entries({ Auditorías: indicators.audits, Riesgos: indicators.risks,
            Controles: indicators.controls, Hallazgos: indicators.findings,
            Evidencias: indicators.evidence, "Horas planeadas": indicators.plannedHours,
            "Horas ejecutadas": indicators.executedHours }).map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}
        </div>
        <p className="offline-report-count">{rows.length} auditoría{rows.length === 1 ? "" : "s"} en este informe filtrado.</p>
        <div className="offline-report-table-wrap"><table>
          <thead><tr><th>ID</th><th>Auditoría</th><th>Estado</th><th>Unidad</th><th>Periodo</th><th>Responsable</th><th>Horas plan/real</th><th>Relaciones</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.audit.id}>
            <td>{row.audit.id}</td><td><strong>{row.audit.title}</strong><small>{row.audit.area || "—"}</small></td>
            <td>{row.audit.status}</td><td>{row.audit.orgUnitId || "—"}</td>
            <td>{row.audit.quarter || "—"} {row.audit.year || ""}</td><td>{row.audit.responsible || "—"}</td>
            <td>{row.audit.plannedHours ?? "—"} / {row.audit.executedHours ?? "—"}</td>
            <td><details><summary>Ver relaciones</summary><p>Riesgos: {related(row.risks)}</p><p>Controles: {related(row.controls)}</p><p>Hallazgos: {related(row.findings)}</p><p>Evidencias: {related(row.evidence)}</p></details>
              <div className="offline-report-print-relations"><p>Riesgos: {related(row.risks)}</p><p>Controles: {related(row.controls)}</p><p>Hallazgos: {related(row.findings)}</p><p>Evidencias: {related(row.evidence)}</p></div></td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </section></main>
  </div>;
}

export default OfflineReport;
