import { ArrowLeft, ArrowRight, CalendarRange, CheckCircle2, Clock, Search, Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import PlanningHistoryButton from "../components/PlanningHistoryButton";
import { getPlanningAudits, startAudit } from "../services/planningService";
import { PLANNING_APPROVE_ROLES, QUARTERS } from "../constants/planning";
import { displayAuditId } from "../utils/auditId";
import "./Planning.css";

const itemStatusLabel = (status) => ({
  APPROVED: "Aprobada",
  ACTIVE: "En curso",
  CLOSED: "Cerrada"
}[status] || status);

const GOVERNANCE_STEPS = [
  "annual", "quarterly", "start", "kickoff", "understanding",
  "execution", "supervision", "closure", "report"
];

const workflowProgress = (audit) => {
  if (audit.status === "CLOSED") return 100;
  const fallbackStep = audit.status === "CLOSED" ? "report" : "start";
  const step = audit.workflowStep || fallbackStep;
  const index = GOVERNANCE_STEPS.indexOf(step);
  if (index < 0) return audit.progress ?? 0;
  return Math.round((index / (GOVERNANCE_STEPS.length - 1)) * 100);
};

function Trimestres() {
  const navigate = useNavigate();
  const [approvedAudits, setApprovedAudits] = useState([]);

  useEffect(() => {
    getPlanningAudits()
      .then((items) => setApprovedAudits(items.filter((item) => ["APPROVED", "ACTIVE", "CLOSED"].includes(item.status))))
      .catch(() => setApprovedAudits([]));
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar active="trimestres" />
      <main className="dashboard-main">
        <section className="dashboard-content planning-page trimestres-page">
          <div className="dashboard-header">
            <div>
              <span className="eyebrow">CALENDARIO DEL PORTAFOLIO</span>
              <h1>Trimestres</h1>
              <p>Auditorías aprobadas, en curso y cerradas del plan anual.</p>
            </div>
          </div>

          <div className="quarter-grid">
            {QUARTERS.map((quarter) => {
              const items = approvedAudits.filter((item) => item.quarter === quarter.value);
              const progress = items.length
                ? Math.round(items.reduce((total, item) => total + workflowProgress(item), 0) / items.length)
                : 0;
              const closed = items.filter((item) => item.status === "CLOSED").length;
              return (
                <button
                  className="quarter-card quarter-card-button"
                  key={quarter.value}
                  type="button"
                  onClick={() => navigate(`/trimestres/${quarter.value}`)}
                >
                  <header>
                    <div className="quarter-icon"><CalendarRange size={20} /></div>
                    <div>
                      <h2>{quarter.label}</h2>
                      <p>{quarter.period}</p>
                    </div>
                    <span className="quarter-count">{items.length}</span>
                  </header>
                  <div className="quarter-card-footer">
                    {items.length ? (
                      <div className="quarter-progress">
                        <div className="quarter-progress-summary">
                          <span>{items.length} {items.length === 1 ? "auditoría" : "auditorías"}</span>
                          <strong>{progress}%</strong>
                        </div>
                        <div className="quarter-progress-track">
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <small>{closed} cerradas</small>
                      </div>
                    ) : (
                      <span>Sin auditorías programadas</span>
                    )}
                    <ArrowRight size={18} aria-hidden="true" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

export function TrimestreDetalle() {
  const navigate = useNavigate();
  const { quarterId } = useParams();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const canStart = PLANNING_APPROVE_ROLES.includes(user?.role);
  const quarter = QUARTERS.find((item) => item.value === quarterId) || QUARTERS[0];
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos los estados");
  const [allAudits, setAllAudits] = useState([]);
  const [startingId, setStartingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getPlanningAudits().then(setAllAudits).catch(() => setAllAudits([]));
  }, []);

  const beginAudit = async (audit) => {
    setStartingId(audit.id);
    setError("");
    try {
      await startAudit(audit.id);
      navigate(`/auditorias-activas/${encodeURIComponent(audit.id)}`);
    } catch (startError) {
      setError(startError.message);
    } finally {
      setStartingId(null);
    }
  };

  const audits = allAudits
    .filter((item) => ["APPROVED", "ACTIVE", "CLOSED"].includes(item.status) && item.quarter === quarter.value)
    .filter((item) => {
      const matchesQuery = `${item.id} ${item.title} ${item.area} ${item.responsible}`
        .toLowerCase()
        .includes(query.toLowerCase());
      return matchesQuery && (status === "Todos los estados" || status === itemStatusLabel(item.status));
    });

  return (
    <div className="dashboard-layout">
      <Sidebar active="trimestres" />
      <main className="dashboard-main">
        <section className="dashboard-content planning-page trimestres-page workspace-page">
          <button className="back-link" type="button" onClick={() => navigate("/trimestres")}>
            <ArrowLeft size={17} /> Volver a trimestres
          </button>
          <div className="workspace-header">
            <div>
              <div className="workspace-kicker"><CalendarRange size={18} /> PLANEACIÓN TRIMESTRAL</div>
              <h1>Espacio de Trabajo {quarter.label.replace("Trimestre ", "T")}</h1>
              <p>Estado y avance de ejecución durante {quarter.label}.</p>
            </div>
          </div>

          <div className="workspace-stats">
            <div><strong>{audits.length}</strong><span>Auditorías</span></div>
            <div><strong>{audits.length ? `${Math.round(audits.reduce((total, item) => total + workflowProgress(item), 0) / audits.length)}%` : "0%"}</strong><span>Avance del flujo de gobierno</span></div>
            <div><strong>{audits.length ? audits.filter((item) => item.status === "CLOSED").length : 0}</strong><span>Cerradas</span></div>
          </div>

          <div className="filter-panel">
            <div>
              <h2>Filtrar auditorías</h2>
              <p>Busca por identificador, auditoría, área o responsable.</p>
            </div>
            {error && <p className="planning-message error" role="alert">{error}</p>}
            <div className="filter-controls">
              <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Estado">
                <option>Todos los estados</option>
                <option>Aprobada</option>
                <option>En curso</option>
                <option>Cerrada</option>
              </select>
              <label className="search-input">
                <Search size={17} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar auditoría..." />
              </label>
            </div>
          </div>

          <div className="audit-workspace-table">
            <div className="audit-table-heading">
              <span>ID</span><span>AUDITORÍA</span><span>UNIDAD / ÁREA</span><span>RESPONSABLE</span><span>ESTADO</span><span>AVANCE</span><span>ACCIÓN</span>
            </div>
            {audits.length === 0 ? (
              <div className="workspace-empty"><Clock size={22} /> No hay auditorías programadas en este trimestre.</div>
            ) : audits.map((audit) => (
              <div
                className="audit-table-row audit-table-row-clickable"
                key={audit.id}
                role="link"
                tabIndex="0"
                onClick={() => navigate(`/auditorias-activas/${encodeURIComponent(audit.id)}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/auditorias-activas/${encodeURIComponent(audit.id)}`);
                  }
                }}
                aria-label={`Abrir auditoría ${audit.id}`}
              >
                {audit.status === "ACTIVE" ? (
                  <button
                    type="button"
                    className="audit-table-link planning-id"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/auditorias-activas/${encodeURIComponent(audit.id)}`);
                    }}
                    aria-label={`Abrir auditoría ${audit.id}`}
                  >
                    <span title={audit.id}>{displayAuditId(audit.id, audit.auditFolio || audit.folio)}</span>
                  </button>
                ) : (
                  <span className="planning-id" title={audit.id}>{displayAuditId(audit.id, audit.auditFolio || audit.folio)}</span>
                )}
                {audit.status === "ACTIVE" ? (
                  <button
                    type="button"
                    className="audit-table-link audit-title-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/auditorias-activas/${encodeURIComponent(audit.id)}`);
                    }}
                  >
                    {audit.title}
                  </button>
                ) : (
                  <strong>{audit.title}</strong>
                )}
                <span>{audit.area}</span>
                <span>{audit.responsible}</span>
                <span className={`status-pill status-${audit.status.toLowerCase()}`}>
                  {audit.status === "ACTIVE" ? <Activity size={14} /> : <CheckCircle2 size={14} />}{itemStatusLabel(audit.status)}
                </span>
                <span className="audit-progress"><i style={{ width: `${workflowProgress(audit)}%` }} /><b>{workflowProgress(audit)}%</b></span>
                {audit.status === "APPROVED" && canStart ? (
                  <button
                    type="button"
                    className="start-audit-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      beginAudit(audit);
                    }}
                    disabled={startingId === audit.id}
                  >
                    <Activity size={15} />
                    {startingId === audit.id ? "Iniciando..." : "Iniciar"}
                  </button>
                ) : (
                  <span onClick={(event) => event.stopPropagation()}>
                    <PlanningHistoryButton proposal={audit} compact />
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default Trimestres;
