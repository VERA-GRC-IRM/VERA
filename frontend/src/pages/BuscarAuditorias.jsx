import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import ShareLinkButton from "../components/ShareLinkButton";
import { BookmarkButton, SaveViewButton } from "../components/WorkspaceActions";
import { emptyAuditFilters, readAuditFilters, writeAuditFilters } from "../utils/auditSearchFilters";
import { getAvailableOrgUnits } from "../services/orgUnitService";
import { downloadPortfolioReport, getPortfolioReport, searchPlanningAudits } from "../services/planningService";
import { enqueueReport } from "../services/jobService";
import "./Planning.css";
import "./BuscarAuditorias.css";

const EMPTY = emptyAuditFilters();
const STATUS_LABELS = {
  OPEN: "Propuesta abierta", APPROVED: "Aprobada", ACTIVE: "En curso",
  CLOSED: "Cerrada", REJECTED: "Rechazada"
};

function BuscarAuditorias() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const workspaceUserId = user?.roleTour ? null : user?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.toString();
  const auditId = searchParams.get("auditId");
  const [filters, setFilters] = useState(() => readAuditFilters(searchParams));
  const [audits, setAudits] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [appliedFilters, setAppliedFilters] = useState(EMPTY);
  const [report, setReport] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportOperation, setReportOperation] = useState("");
  const [reportStartedAt, setReportStartedAt] = useState(0);
  const [reportElapsed, setReportElapsed] = useState(0);
  const reportController = useRef(null);
  const [orgUnits, setOrgUnits] = useState([]);

  const load = async (next) => {
    setLoading(true);
    try {
      setAudits(await searchPlanningAudits(next));
      setAppliedFilters(next);
      setReport(null);
      setError("");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getAvailableOrgUnits().then(setOrgUnits).catch(() => setOrgUnits([]));
  }, []);
  useEffect(() => {
    if (!reportBusy) return undefined;
    const timer = setInterval(() => setReportElapsed(Math.floor((Date.now() - reportStartedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [reportBusy, reportStartedAt]);
  useEffect(() => () => reportController.current?.abort(), []);

  useEffect(() => {
    let cancelled = false;
    const next = readAuditFilters(new URLSearchParams(urlQuery));
    const applied = auditId ? { ...next, q: auditId } : next;
    searchPlanningAudits(applied)
      .then((results) => {
        if (cancelled) return;
        setAudits(results);
        setFilters(applied);
        setAppliedFilters(applied);
        setSelected(auditId ? results.find((audit) => audit.id === auditId) || null : null);
      })
      .catch((cause) => { if (!cancelled) setError(cause.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [auditId, urlQuery]);

  const update = (field) => (event) => setFilters((current) => ({ ...current, [field]: event.target.value }));
  const showFilters = (next) => {
    setSelected(null);
    const params = writeAuditFilters(next);
    if (params.toString() === urlQuery) load(next);
    else setSearchParams(params);
  };
  const submit = (event) => { event.preventDefault(); showFilters(filters); };
  const clear = () => { setFilters(EMPTY); showFilters(EMPTY); };
  const beginReport = (label) => {
    reportController.current = new AbortController();
    setReportStartedAt(Date.now()); setReportElapsed(0); setReportOperation(label); setReportBusy(true);
    return reportController.current.signal;
  };
  const finishReport = () => { reportController.current = null; setReportBusy(false); setReportOperation(""); };
  const reportError = (cause) => setError(cause.name === "AbortError" ? "Operación cancelada." : cause.message);
  const openReport = async () => {
    const signal = beginReport("Preparando vista del reporte");
    try { setReport(await getPortfolioReport(appliedFilters, { signal })); setError(""); }
    catch (cause) { reportError(cause); }
    finally { finishReport(); }
  };
  const exportReport = async (format) => {
    const signal = beginReport(`Preparando ${format.toUpperCase()}`);
    try { await downloadPortfolioReport(appliedFilters, format, { signal }); setError(""); }
    catch (cause) { reportError(cause); }
    finally { finishReport(); }
  };
  const queueReport = async (format) => {
    setError("");
    setReportBusy(true);
    try { await enqueueReport(appliedFilters, format); navigate("/trabajos"); }
    catch (cause) { setError(cause.message); }
    finally { setReportBusy(false); }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar active="auditorias" />
      <main className="dashboard-main">
        <section className="dashboard-content planning-page clean-header-page audit-search-page">
          <div className="dashboard-header">
            <div><span className="eyebrow">HU-26 · CONSULTA DEL PORTAFOLIO</span><h1>Buscar auditorías</h1>
              <p>Consulta propuestas y auditorías según los permisos de tu cuenta.</p></div>
            <ShareLinkButton path={`/auditorias${urlQuery ? `?${urlQuery}` : ""}`} label="Copiar vista" />
            <SaveViewButton userId={workspaceUserId} path={`/auditorias${urlQuery ? `?${urlQuery}` : ""}`} defaultName="Búsqueda de auditorías" />
          </div>
          <form className="audit-search-form" onSubmit={submit} aria-label="Filtros de auditorías">
            <label>Búsqueda por ID, nombre, área, objetivo o responsable
              <input value={filters.q} onChange={update("q")} maxLength={120} placeholder="Escribe una palabra o identificador" />
            </label>
            <label>Estado<select value={filters.status} onChange={update("status")}>
              <option value="">Todos</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Riesgo<select value={filters.risk} onChange={update("risk")}><option value="">Todos</option>
              {["Bajo", "Medio", "Alto"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Tipo<select value={filters.type} onChange={update("type")}><option value="">Todos</option>
              {["Interna", "Externa"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Trimestre<select value={filters.quarter} onChange={update("quarter")}><option value="">Todos</option>
              {["Q1", "Q2", "Q3", "Q4"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Año<input type="number" min="2020" max="2100" value={filters.year} onChange={update("year")} placeholder="Todos" /></label>
            <label>Unidad empresarial<select value={filters.orgUnitId} onChange={update("orgUnitId")}>
              <option value="">Todas las visibles</option>
              {orgUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select></label>
            <label>Responsable<select value={filters.responsibleId} onChange={update("responsibleId")}>
              <option value="">Todos los visibles</option>
              {[...new Map(audits.filter((audit) => audit.responsibleId).map((audit) =>
                [String(audit.responsibleId), audit.responsible])).entries()].map(([id, name]) =>
                <option key={id} value={id}>{name}</option>)}
            </select></label>
            <div className="audit-search-actions"><button className="primary-action" type="submit" disabled={loading}>Buscar</button>
              <button className="secondary-action" type="button" onClick={clear} disabled={loading}>Limpiar</button></div>
          </form>
          {error && <p className="planning-message error" role="alert">{error}</p>}
          <p role="status" aria-live="polite">{loading ? "Buscando auditorías…" : `${audits.length} resultado(s)`}</p>
          {!loading && audits.length === 0 && <div className="planning-empty"><p>{Object.values(appliedFilters).some(Boolean) ? "No hay auditorías visibles que coincidan con los filtros." : "Aún no hay auditorías visibles para esta cuenta."}</p>{Object.values(appliedFilters).some(Boolean) && <button type="button" className="secondary-action" onClick={clear}>Limpiar filtros</button>}</div>}
          <div className="audit-report-actions">
            <div><h2>Reporte del portafolio</h2><p>Incluye auditorías y sus riesgos, controles, hallazgos y evidencias vinculadas, según tu acceso. Usa los últimos filtros aplicados.</p></div>
            <button className="secondary-action" type="button" onClick={openReport} disabled={loading || reportBusy}>Ver reporte</button>
            <button className="secondary-action" type="button" onClick={() => exportReport("csv")} disabled={loading || reportBusy}>Descargar CSV</button>
            <button className="secondary-action" type="button" onClick={() => exportReport("xlsx")} disabled={loading || reportBusy}>Descargar Excel</button>
            <button className="secondary-action" type="button" onClick={() => exportReport("pdf")} disabled={loading || reportBusy}>Descargar PDF</button>
            {import.meta.env.VITE_VERA_JOBS_ENABLED === "true" && <>
              <button className="secondary-action" type="button" onClick={() => queueReport("csv")}
                disabled={loading || reportBusy}>Preparar CSV en segundo plano</button>
              <button className="secondary-action" type="button" onClick={() => queueReport("pdf")}
                disabled={loading || reportBusy}>Preparar PDF en segundo plano</button>
            </>}
            {reportBusy && <button className="secondary-action" type="button" onClick={() => reportController.current?.abort()}>Cancelar</button>}
          </div>
          {reportBusy && <p className="audit-report-progress" role="status" aria-live="polite">{reportOperation} · {reportElapsed} s. Puedes cancelar mientras se prepara.</p>}
          {report && <section className="audit-report-panel" aria-label="Reporte del portafolio">
            <p role="status">{report.total} expediente(s) · {report.scope} · Actualizado: {new Date(report.asOf).toLocaleString("es-MX")}</p>
            <p>Indicadores: {report.indicators.audits} auditorías · {report.indicators.risks} riesgos · {report.indicators.controls} controles · {report.indicators.findings} hallazgos · {report.indicators.evidence} evidencias.</p>
            <p>Horas registradas: {report.indicators.plannedHours} planeadas ({report.indicators.auditsWithPlannedHours} expedientes) · {report.indicators.executedHours} ejecutadas ({report.indicators.auditsWithExecutedHours} expedientes). Los expedientes sin horas registradas no se estiman.</p>
            {report.total === 0 ? <p>No hay registros para estos filtros. El CSV conserva los encabezados.</p> : report.rows.map(({ audit, risks, controls, findings, evidenceCount, evidence }) => (
              <article className="audit-report-row" key={audit.id}>
                <h3>{audit.id} · {audit.title}</h3>
                <p>{STATUS_LABELS[audit.status] || audit.status} · {audit.area} · {audit.responsible || "Sin asignar"}</p>
                <p>Riesgos: {risks.length} · Controles: {controls.length} · Hallazgos: {findings.length} · Evidencias: {evidenceCount}</p>
                <p>Horas: {audit.plannedHours ?? "Sin registrar"} planeadas · {audit.executedHours ?? "Sin registrar"} ejecutadas</p>
                {evidence.length > 0 && <p>Evidencias vinculadas: {evidence.map((item) => `${item.id} · ${item.title}`).join("; ")}</p>}
                {risks.length > 0 && <p>Riesgos vinculados: {risks.map((item) => `${item.id} · ${item.title}`).join("; ")}</p>}
                {findings.length > 0 && <p>Hallazgos vinculados: {findings.map((item) => `${item.id} · ${item.title}`).join("; ")}</p>}
              </article>
            ))}
          </section>}
          <div className="audit-search-results">
            {audits.map((audit) => <article className="audit-search-card" key={audit.id}>
              <div><strong>{audit.id} · {audit.title}</strong><span>{STATUS_LABELS[audit.status] || audit.status}</span></div>
              <p>{audit.area} · {audit.year} · {audit.quarter || "Sin trimestre"} · Riesgo {audit.risk}</p>
              <p>Responsable: {audit.responsible || "Sin asignar"}</p>
              <button type="button" className="secondary-action" onClick={() => setSelected(audit)}>Ver detalles</button>
              <ShareLinkButton path={`/auditorias?auditId=${encodeURIComponent(audit.id)}`} />
              <BookmarkButton userId={workspaceUserId} path={`/auditorias?auditId=${encodeURIComponent(audit.id)}`} label={`Auditoría ${audit.id}`} />
              {audit.status === "ACTIVE" && <button type="button" className="secondary-action" onClick={() => navigate(`/auditorias-activas/${encodeURIComponent(audit.id)}`)}>Abrir auditoría</button>}
            </article>)}
          </div>
          {selected && <section className="audit-search-detail" aria-label={`Detalle de ${selected.id}`}>
            <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar detalles">Cerrar</button>
            <h2>{selected.id} · {selected.title}</h2>
            <dl><dt>Estado</dt><dd>{STATUS_LABELS[selected.status] || selected.status}</dd>
              <dt>Objetivo</dt><dd>{selected.objective}</dd><dt>Alcance</dt><dd>{selected.scope}</dd>
              <dt>Justificación</dt><dd>{selected.justification}</dd><dt>Responsable</dt><dd>{selected.responsible || "Sin asignar"}</dd>
              <dt>Periodo</dt><dd>{selected.startDate || "Sin fecha"} — {selected.endDate || "Sin fecha"}</dd></dl>
          </section>}
        </section>
      </main>
    </div>
  );
}

export default BuscarAuditorias;
