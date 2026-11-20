import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, RotateCw } from "lucide-react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import useAutomaticRefresh from "../hooks/useAutomaticRefresh";
import { getDashboardSummary } from "../services/dashboardService";
import { getActions } from "../services/actionService";
import { localDateAfter, localToday } from "../utils/localDate";
import { displayAuditId } from "../utils/auditId";
import "./Dashboard.css";

const STATUS_LABELS = {
  OPEN: "Pendiente de decisión",
  APPROVED: "Aprobada para iniciar",
  ACTIVE: "En curso",
  CLOSED: "Cerrada",
  REJECTED: "Rechazada"
};

const RISK_LABELS = { 1: "Baja", 2: "Media", 3: "Alta" };
const RISK_LEVELS = ["Bajo", "Medio", "Alto"];
const ACTION_STATUS = { OPEN: "Abierta", IN_PROGRESS: "En curso" };
const ACTION_SOURCE = { AUDIT: "Auditoría", RISK: "Riesgo", CONTROL: "Control", FINDING: "Hallazgo" };
const actionDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("es-MX", {
  day: "numeric", month: "short", year: "numeric"
});

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actions, setActions] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [actionsError, setActionsError] = useState("");
  const [revision, setRevision] = useState(0);
  const [activeDashboardTab, setActiveDashboardTab] = useState("overview");
  const [statusView, setStatusView] = useState("bars");
  const [riskView, setRiskView] = useState("matrix");
  const [period, setPeriod] = useState("all");
  const [year, setYear] = useState(new Date().getFullYear());
  const [semester, setSemester] = useState(1);
  const [quarter, setQuarter] = useState("Q1");

  const load = () => {
    setLoading(true);
    setActionsLoading(true);
    setRevision((current) => current + 1);
  };
  useAutomaticRefresh(() => setRevision((current) => current + 1));

  useEffect(() => {
    let cancelled = false;
    getDashboardSummary({ period, year, semester, quarter })
      .then((data) => { if (!cancelled) { setSummary(data); setError(""); } })
      .catch((loadError) => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision, period, year, semester, quarter]);

  useEffect(() => {
    let cancelled = false;
    getActions()
      .then((result) => { if (!cancelled) { setActions(result.actions); setActionsError(""); } })
      .catch((loadError) => { if (!cancelled) setActionsError(loadError.message); })
      .finally(() => { if (!cancelled) setActionsLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const metrics = summary?.metrics;
  const statusCounts = summary?.statusCounts || [];
  const maxStatusCount = Math.max(1, ...statusCounts.map((item) => item.count));
  const riskCells = summary?.riskMatrix || [];
  const riskTotals = RISK_LEVELS.map((risk) => ({
    risk,
    count: riskCells.flat().filter((cell) => cell.risk === risk).reduce((total, cell) => total + cell.count, 0)
  }));
  const maxRiskCount = Math.max(1, ...riskTotals.map(({ count }) => count));
  let user = null;
  try { user = JSON.parse(localStorage.getItem("user") || "null"); } catch { /* Sin asignaciones personales. */ }
  const activeActions = actions.filter((item) => ["OPEN", "IN_PROGRESS"].includes(item.status));
  const myActions = activeActions.filter((item) => item.assigneeId === user?.id);
  const today = localToday();
  const upcomingDate = localDateAfter(7);
  const overdueActions = myActions.filter((item) => item.dueDate < today);
  const dueSoonActions = myActions.filter((item) => item.dueDate >= today && item.dueDate <= upcomingDate);
  const nextActions = [...myActions].sort((first, second) => first.dueDate.localeCompare(second.dueDate)).slice(0, 3);

  return (
    <div className="dashboard-layout">
      <Sidebar active="dashboard" />
      <main className="dashboard-main">
        <section className="dashboard-content role-dashboard">
          <header className="dashboard-header dashboard-hero" data-tour="dashboard-header">
            <div className="dashboard-hero-copy">
              <span className="eyebrow">PORTAFOLIO · {summary?.scopeLabel || "CARGANDO"}</span>
              <h1>Panel de Portafolio</h1>
              <p>Indicadores, compromisos y prioridades de tu alcance.</p>
            </div>
            <div className="dashboard-hero-tools">
              <span className="dashboard-scope-note">Información visible para tu rol</span>
              <button className="dashboard-refresh" type="button" onClick={load} disabled={loading || actionsLoading}>
                <RotateCw size={16} aria-hidden="true" /> Actualizar
              </button>
              <span className="dashboard-refresh-status" role="status">{(loading || actionsLoading) && summary ? "Actualizando datos" : ""}</span>
            </div>
          </header>

          {error && (
            <div className="dashboard-alert" role="alert">
              <span>{error}</span>
              <button type="button" onClick={load}>Reintentar</button>
            </div>
          )}

          {loading && !summary ? (
            <div className="dashboard-loading" role="status">Cargando indicadores del portafolio...</div>
          ) : summary && (
            <>
              <div className="dashboard-page-nav" role="tablist" aria-label="Secciones del panel">
                {[
                  ["overview", "Panorama"], ["commitments", "Mis compromisos"],
                  ["analysis", "Estado y riesgo"], ["priorities", "Por atender"]
                ].map(([id, label]) => <button key={id} id={`dashboard-tab-${id}`} type="button" role="tab"
                  aria-selected={activeDashboardTab === id} aria-controls={`dashboard-panel-${id}`} tabIndex={activeDashboardTab === id ? 0 : -1}
                  onClick={() => setActiveDashboardTab(id)}
                  onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const tabs = ["overview", "commitments", "analysis", "priorities"];
                    const current = tabs.indexOf(activeDashboardTab);
                    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
                      : (current + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
                    setActiveDashboardTab(tabs[next]);
                    requestAnimationFrame(() => document.getElementById(`dashboard-tab-${tabs[next]}`)?.focus());
                  }}>{label}</button>)}
              </div>

              <section id="dashboard-panel-overview" role="tabpanel" aria-labelledby="dashboard-tab-overview" hidden={activeDashboardTab !== "overview"} className="dashboard-overview-section" data-tour="dashboard-overview">
                <div className="dashboard-section-heading">
                  <div><span className="dashboard-section-kicker">VISTA GENERAL</span><h2 id="dashboard-overview-title">Indicadores del portafolio</h2></div>
                  <div className="dashboard-period-controls" role="group" aria-label="Periodo de indicadores">
                    <label>Periodo
                      <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                        <option value="all">Todos</option><option value="year">Anual</option>
                        <option value="semester">Semestral</option><option value="quarter">Trimestral</option>
                      </select>
                    </label>
                    {period !== "all" && <label>Año
                      <input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} />
                    </label>}
                    {period === "semester" && <label>Semestre
                      <select value={semester} onChange={(event) => setSemester(Number(event.target.value))}>
                        <option value={1}>Enero–junio</option><option value={2}>Julio–diciembre</option>
                      </select>
                    </label>}
                    {period === "quarter" && <label>Trimestre
                      <select value={quarter} onChange={(event) => setQuarter(event.target.value)}>
                        {["Q1", "Q2", "Q3", "Q4"].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>}
                  </div>
                </div>
                <p className="dashboard-period-caption">Indicadores del periodo seleccionado.</p>
                <div className="kpi-grid">
                  <article className="kpi-card">
                    <span className="kpi-label">{summary.permissions.canApprove ? "PENDIENTES DE DECISIÓN" : "PROPUESTAS ABIERTAS"}</span>
                    <div className="kpi-row"><div><strong>{metrics.pending}</strong><p>Propuestas abiertas</p></div></div>
                  </article>
                  <article className="kpi-card">
                    <span className="kpi-label">AUDITORÍAS EN CURSO</span>
                    <div className="kpi-row"><div><strong>{metrics.active}</strong><p>Actualmente activas</p></div></div>
                  </article>
                  <article className="kpi-card">
                    <span className="kpi-label">RIESGO ALTO</span>
                    <div className="kpi-row"><div><strong>{metrics.highRisk}</strong><p>Propuestas y auditorías visibles</p></div></div>
                  </article>
                  <article className="kpi-card">
                    <span className="kpi-label">HALLAZGOS ABIERTOS</span>
                    <div className="kpi-row"><div><strong>{metrics.openFindings}</strong><p>Vinculados a auditorías visibles</p></div></div>
                  </article>
                </div>
              </section>

              <section id="dashboard-panel-commitments" role="tabpanel" aria-labelledby="dashboard-tab-commitments" hidden={activeDashboardTab !== "commitments"} className="dashboard-panel dashboard-commitments" data-tour="dashboard-commitments">
                <div className="dashboard-panel-heading">
                  <div><span className="eyebrow">SEGUIMIENTO</span><h2 id="dashboard-commitments-title">Mis compromisos</h2></div>
                  <Link to="/notificaciones">Abrir Pendientes <ArrowRight size={15} aria-hidden="true" /></Link>
                </div>
                {actionsLoading ? <p className="dashboard-commitment-state" role="status">Consultando compromisos registrados…</p>
                  : actionsError ? <p className="dashboard-commitment-state" role="alert">No se pudieron consultar los compromisos: {actionsError}. Los indicadores de seguimiento no están disponibles.</p>
                    : <>
                      <div className="dashboard-commitment-metrics" aria-label="Resumen de compromisos">
                        <div><strong>{myActions.length}</strong><span>Asignados a mi cuenta</span></div>
                        <div><strong>{overdueActions.length}</strong><span>Vencidos de mis asignaciones</span></div>
                        <div><strong>{dueSoonActions.length}</strong><span>Vencen en los próximos 7 días</span></div>
                        <div><strong>{activeActions.length}</strong><span>Abiertos en mi alcance</span></div>
                      </div>
                      {nextActions.length ? <div className="dashboard-commitment-list">
                        <h3>Próximos a atender</h3>
                        <ul>{nextActions.map((action) => <li key={action.id}>
                          <div><Link to={`/notificaciones?actionId=${encodeURIComponent(action.id)}`}>{action.title}</Link><span>{ACTION_SOURCE[action.sourceType]} · {action.sourceTitle} · {ACTION_STATUS[action.status] || action.status}</span></div>
                          <time dateTime={action.dueDate} className={action.dueDate < today ? "is-overdue" : ""}>
                            {action.dueDate < today ? "Venció" : "Vence"} {actionDate(action.dueDate)}
                          </time>
                        </li>)}</ul>
                      </div> : <p className="dashboard-commitment-state">No tienes compromisos abiertos asignados en este momento.</p>}
                    </>}
              </section>

              <div id="dashboard-panel-analysis" role="tabpanel" aria-labelledby="dashboard-tab-analysis" hidden={activeDashboardTab !== "analysis"} className="dashboard-insight-row">
                <section className="dashboard-panel status-chart-panel" aria-labelledby="status-chart-title">
                  <div className="dashboard-panel-heading">
                    <div><span className="eyebrow">ESTADO DEL PORTAFOLIO</span><h2 id="status-chart-title">Registros por estado</h2></div>
                    <span>{metrics.total} en total</span>
                  </div>
                  <div className="dashboard-view-switch" role="group" aria-label="Vista de estados">
                    <button type="button" aria-pressed={statusView === "bars"} onClick={() => setStatusView("bars")}>Comparación</button>
                    <button type="button" aria-pressed={statusView === "distribution"} onClick={() => setStatusView("distribution")}>Distribución</button>
                  </div>
                  {statusView === "bars" ? (
                    <div className="status-chart" role="list">
                      {statusCounts.map(({ status, count }) => (
                        <div className="status-chart-row" role="listitem" key={status}>
                          <span>{STATUS_LABELS[status]}</span>
                          <div className="status-chart-track" role="img" aria-label={`${count} ${STATUS_LABELS[status]}`}>
                            <span className={`status-chart-bar bar-${status.toLowerCase()}`} style={{ width: `${(count / maxStatusCount) * 100}%` }} />
                          </div>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="status-distribution">
                      {metrics.total === 0 ? <p className="dashboard-chart-note">Todavía no hay registros en este alcance.</p> :
                        <div className="status-distribution-bar" role="img" aria-label={statusCounts.map(({ status, count }) => `${STATUS_LABELS[status]}: ${count}`).join(", ")}>
                          {statusCounts.filter(({ count }) => count > 0).map(({ status, count }) =>
                            <span key={status} className={`bar-${status.toLowerCase()}`} style={{ width: `${(count / metrics.total) * 100}%` }} />)}
                        </div>}
                      <div className="status-distribution-legend" role="list">
                        {statusCounts.map(({ status, count }) => <div key={status} role="listitem">
                          <span className={`status-legend-swatch bar-${status.toLowerCase()}`} aria-hidden="true" />
                          <span>{STATUS_LABELS[status]}</span><strong>{count}</strong>
                        </div>)}
                      </div>
                    </div>
                  )}
                  <div className="dashboard-progress-summary">
                    <span>Avance medio de auditorías iniciadas</span><strong>{metrics.averageProgress}%</strong>
                    <div className="progress-track"><span style={{ width: `${metrics.averageProgress}%` }} /></div>
                  </div>
                </section>

                <section className="dashboard-panel dashboard-risk-panel" aria-labelledby="dashboard-risk-title">
                  <div className="dashboard-panel-heading">
                    <div><span className="eyebrow">RIESGO REGISTRADO</span><h2 id="dashboard-risk-title">Matriz de riesgo (P × I)</h2></div>
                    <Link to="/auditorias-activas">Abrir matriz <ArrowRight size={15} /></Link>
                  </div>
                  <div className="dashboard-view-switch" role="group" aria-label="Vista de riesgos">
                    <button type="button" aria-pressed={riskView === "matrix"} onClick={() => setRiskView("matrix")}>Matriz</button>
                    <button type="button" aria-pressed={riskView === "levels"} onClick={() => setRiskView("levels")}>Por nivel</button>
                  </div>
                  {riskView === "matrix" ? <div className="dashboard-risk-matrix">
                    <div className="risk-axis-label">Probabilidad</div>
                    <div className="risk-matrix-body">
                      {[...riskCells].reverse().map((row) => (
                        <div className="risk-matrix-row" key={row[0]?.likelihood}>
                          <span className="risk-row-label">{RISK_LABELS[row[0]?.likelihood]}</span>
                          {row.map((cell) => (
                            <div className={`dashboard-risk-cell cell-${cell.risk.toLowerCase()}`} key={`${cell.likelihood}-${cell.impact}`} title={`Probabilidad ${RISK_LABELS[cell.likelihood]}, impacto ${RISK_LABELS[cell.impact]}: ${cell.count}`}>
                              <strong>{cell.count}</strong><span>{cell.risk}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                      <div className="risk-column-labels"><span>Impacto</span>{[1, 2, 3].map((level) => <span key={level}>{RISK_LABELS[level]}</span>)}</div>
                    </div>
                  </div> : <div className="risk-summary-chart">
                    <div role="list">
                      {riskTotals.map(({ risk, count }) => <div className="risk-summary-row" role="listitem" key={risk}>
                        <span>{risk}</span>
                        <div className="risk-summary-track" role="img" aria-label={`${count} auditorías con riesgo ${risk.toLowerCase()}`}>
                          <span className={`risk-summary-fill cell-${risk.toLowerCase()}`} style={{ width: `${(count / maxRiskCount) * 100}%` }} />
                        </div>
                        <strong>{count}</strong>
                      </div>)}
                    </div>
                    <p>Distribución de las {metrics.active} auditorías en curso.</p>
                  </div>}
                  <p className="dashboard-chart-note">Muestra probabilidad e impacto capturados para auditorías activas; no representa riesgo residual.</p>
                </section>
              </div>

              <section id="dashboard-panel-priorities" role="tabpanel" aria-labelledby="dashboard-tab-priorities" hidden={activeDashboardTab !== "priorities"} className="dashboard-panel pending-panel">
                <div className="dashboard-panel-heading">
                  <div><span className="eyebrow">SIGUIENTE ACCIÓN</span><h2 id="pending-title">{summary.permissions.canApprove ? "Propuestas pendientes de decisión" : summary.role === "AUDITOR" ? "Mis auditorías por atender" : "Actividades en seguimiento"}</h2></div>
                  <Link to={summary.role === "AUDITOR" ? "/auditorias-activas" : "/planificacion"}>Ver tablero <ArrowRight size={15} /></Link>
                </div>
                {summary.pendingItems.length === 0 ? (
                  <div className="dashboard-empty"><CheckCircle2 size={20} />No hay elementos pendientes en tu vista.</div>
                ) : (
                  <div className="dashboard-pending-list">
                    {summary.pendingItems.map((item) => (
                      <article className="dashboard-pending-item" key={item.id}>
                        <div className="pending-item-main">
                          <span className="planning-id" title={item.id}>{displayAuditId(item.id, item.auditFolio || item.folio)} · {STATUS_LABELS[item.status]}</span>
                          <h3>{item.title}</h3>
                          <p>{item.area}{item.quarter ? ` · ${item.quarter} ${item.year}` : ""}</p>
                        </div>
                        <span className={`risk-badge risk-${(item.risk || "Medio").toLowerCase()}`}>Riesgo {item.risk || "Medio"}</span>
                        <Link className="pending-open-link" to={summary.role === "AUDITOR" ? "/auditorias-activas" : "/planificacion"} aria-label={`Abrir ${item.title}`}><ArrowRight size={18} /></Link>
                      </article>
                    ))}
                  </div>
                )}
              </section>

            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
