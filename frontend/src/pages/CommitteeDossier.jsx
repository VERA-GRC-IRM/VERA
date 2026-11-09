import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { getAuditContext } from "../services/planningService";
import { getAuditActions } from "../services/actionService";
import { localToday } from "../utils/localDate";
import { displayAuditId } from "../utils/auditId";
import "./CommitteeDossier.css";

const STATUS = { OPEN: "Propuesta abierta", APPROVED: "Aprobada", ACTIVE: "En curso", CLOSED: "Cerrada", REJECTED: "Rechazada" };
const ACTION_STATUS = { OPEN: "Abierta", IN_PROGRESS: "En curso", DONE: "Terminada", CANCELLED: "Cancelada" };
const ACTION_SOURCE = { AUDIT: "Auditoría", RISK: "Riesgo", CONTROL: "Control", FINDING: "Hallazgo" };
const date = (value) => value && !Number.isNaN(Date.parse(value))
  ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "Sin dato";
const value = (item) => item === null || item === undefined || item === "" ? "Sin dato" : item;

function dossierFacts(context) {
  const { risks, controls, findings, evidence } = context.groups;
  const withoutControl = risks.filter((risk) => !controls.some((control) => control.riskIds.includes(risk.id)));
  const highRisks = risks.filter((risk) => risk.level === "Alto");
  const lowRatedControls = controls.filter((control) => {
    const rating = Number(control.effectiveness);
    return control.effectiveness !== null && control.effectiveness !== undefined && rating >= 1 && rating <= 3;
  });
  const openFindings = findings.filter((finding) => finding.status === "OPEN");
  const directEvidence = evidence.filter((item) => item.entityType === "AUDIT");
  return { withoutControl, highRisks, lowRatedControls, openFindings, directEvidence };
}

function CommitteeDossier() {
  const { auditId } = useParams();
  const [context, setContext] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [actions, setActions] = useState([]);
  const [actionsAsOf, setActionsAsOf] = useState(null);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [actionsError, setActionsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAuditContext(auditId)
      .then((result) => { if (!cancelled) { setContext(result); setError(""); } })
      .catch((cause) => { if (!cancelled) { setContext(null); setError(cause.message); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [auditId, revision]);

  useEffect(() => {
    let cancelled = false;
    getAuditActions(auditId)
      .then((result) => { if (!cancelled) { setActions(result.actions); setActionsAsOf(result.asOf); setActionsError(""); } })
      .catch((cause) => { if (!cancelled) { setActions([]); setActionsAsOf(null); setActionsError(cause.message); } })
      .finally(() => { if (!cancelled) setActionsLoading(false); });
    return () => { cancelled = true; };
  }, [auditId, revision]);

  const refresh = () => { setLoading(true); setActionsLoading(true); setError(""); setActionsError(""); setRevision((current) => current + 1); };
  const auditPath = `/auditorias-activas/${encodeURIComponent(auditId)}`;
  const facts = context ? dossierFacts(context) : null;
  const openActions = actions.filter((item) => ["OPEN", "IN_PROGRESS"].includes(item.status));
  const overdueActions = openActions.filter((item) => item.dueDate < localToday());
  const doneActions = actions.filter((item) => item.status === "DONE");
  let user = null;
  try { user = JSON.parse(localStorage.getItem("user") || "null"); } catch { /* Sin controles de edición. */ }
  const canCreateAction = !user?.roleTour && ["SUPER_ADMIN", "GERENTE", "AUDITOR", "JEFATURA"].includes(user?.role);

  return <div className="dashboard-layout committee-layout">
    <Sidebar active="auditorias-activas" />
    <main className="dashboard-main">
      <article className="committee-page" aria-label="Ficha para comité">
        <div className="committee-toolbar">
          <Link to={auditPath}><ArrowLeft size={16} aria-hidden="true" /> Volver al expediente</Link>
          <div>
            <button type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} aria-hidden="true" /> Actualizar</button>
            <button type="button" onClick={() => window.print()} disabled={!context || loading || actionsLoading}><Printer size={16} aria-hidden="true" /> Imprimir o guardar PDF</button>
          </div>
        </div>

        {loading && <p role="status" className="committee-state">Consultando el expediente…</p>}
        {error && <p role="alert" className="committee-state committee-error">No se pudo preparar la ficha: {error}</p>}
        {context && !loading && <>
          <header className="committee-cover">
            <p className="committee-overline">VERA · GOBIERNO DEL PORTAFOLIO</p>
            <div className="committee-cover-row">
              <div><span>FICHA PARA COMITÉ</span><h1>{context.audit.title}</h1><p title={context.audit.id}>{displayAuditId(context.audit.id, context.audit.auditFolio || context.audit.folio)} · {value(context.audit.area)}</p></div>
              <strong>{STATUS[context.audit.status] || context.audit.status}</strong>
            </div>
            <p>Lectura del expediente en un momento concreto. Presenta hechos registrados y relaciones visibles para esta cuenta; no sustituye una decisión del comité.</p>
          </header>

          <div className="committee-provenance">
            <span>Consulta: <b>{date(context.asOf)}</b></span>
            <span>Alcance: <b>{context.scope}</b></span>
            <span>Modo: <b>Solo lectura</b></span>
            <span>Acciones consultadas: <b>{actionsAsOf ? date(actionsAsOf) : "No disponible"}</b></span>
          </div>

          <section className="committee-section" aria-labelledby="committee-profile">
            <div className="committee-section-heading"><span>01 / CONTEXTO</span><h2 id="committee-profile">Mandato y estado</h2></div>
            <div className="committee-profile">
              <div><span>Objetivo</span><p>{value(context.audit.objective)}</p></div>
              <div><span>Alcance</span><p>{value(context.audit.scope)}</p></div>
            </div>
            <dl className="committee-details">
              <div><dt>Responsable</dt><dd>{value(context.audit.responsible)}</dd></div>
              <div><dt>Tipo</dt><dd>{value(context.audit.type)}</dd></div>
              <div><dt>Periodo estimado</dt><dd>{context.audit.startDate && context.audit.endDate ? `${context.audit.startDate} → ${context.audit.endDate}` : context.audit.quarter ? `${context.audit.quarter} ${value(context.audit.year)}` : "Sin dato"}</dd></div>
              <div><dt>Avance registrado</dt><dd>{context.audit.progress === null || context.audit.progress === undefined ? "Sin dato" : `${context.audit.progress}%`}</dd></div>
              <div><dt>Clasificación de la auditoría</dt><dd>{value(context.audit.risk)}{context.audit.riskScore ? ` · ${context.audit.riskScore}/9` : ""}</dd></div>
              <div><dt>Último cambio registrado</dt><dd>{date(context.audit.updatedAt)}</dd></div>
            </dl>
          </section>

          <section className="committee-section" aria-labelledby="committee-indicators">
            <div className="committee-section-heading"><span>02 / INDICADORES</span><h2 id="committee-indicators">Panorama del expediente</h2></div>
            <div className="committee-kpis">
              {[
                [context.counts.risks, "Riesgos vinculados"],
                [facts.highRisks.length, "Riesgos clasificados altos"],
                [context.counts.controls, "Controles vinculados"],
                [facts.withoutControl.length, "Riesgos sin control visible"],
                [facts.openFindings.length, "Hallazgos abiertos"],
                [context.counts.evidence, "Evidencias vinculadas"],
                [actionsLoading || actionsError ? "—" : openActions.length, "Acciones abiertas"],
                [actionsLoading || actionsError ? "—" : overdueActions.length, "Acciones vencidas"],
                [actionsLoading || actionsError ? "—" : doneActions.length, "Acciones terminadas"]
              ].map(([number, label]) => <div key={label}><strong>{number}</strong><span>{label}</span></div>)}
            </div>
            <p className="committee-note">Los conteos describen registros visibles, no un dictamen de cobertura, eficacia ni riesgo residual.</p>
          </section>

          <section className="committee-section" aria-labelledby="committee-trace">
            <div className="committee-section-heading"><span>03 / TRAZABILIDAD</span><h2 id="committee-trace">Riesgos y relaciones registradas</h2></div>
            {context.groups.risks.length ? <div className="committee-table-wrap"><table className="committee-table">
              <caption>Relaciones visibles entre riesgos, controles, hallazgos y evidencias</caption>
              <thead><tr><th scope="col">Riesgo</th><th scope="col">Nivel</th><th scope="col">Controles</th><th scope="col">Hallazgos</th><th scope="col">Evidencias</th></tr></thead>
              <tbody>{context.groups.risks.map((risk) => {
                const controls = context.groups.controls.filter((control) => control.riskIds.includes(risk.id));
                const controlIds = new Set(controls.map((control) => control.id));
                const findings = context.groups.findings.filter((finding) => finding.riskId === risk.id);
                const evidence = context.groups.evidence.filter((item) => (item.entityType === "RISK" && item.entityId === risk.id) || (item.entityType === "CONTROL" && controlIds.has(item.entityId)));
                return <tr key={risk.id}>
                  <th scope="row"><b>{risk.title}</b><small>{risk.id}</small></th>
                  <td>{value(risk.level)}{risk.score ? ` · ${risk.score}/9` : ""}</td>
                  <td>{controls.length}<small>{controls.map((item) => item.id).join(", ") || "Sin vínculo visible"}</small></td>
                  <td>{findings.length}<small>{findings.map((item) => item.id).join(", ") || "Sin vínculo visible"}</small></td>
                  <td>{evidence.length}<small>{evidence.map((item) => item.id).join(", ") || "Sin vínculo visible"}</small></td>
                </tr>;
              })}</tbody>
            </table></div> : <p className="committee-empty">No hay riesgos vinculados visibles en esta consulta.</p>}
            {facts.directEvidence.length > 0 && <p className="committee-note">Evidencia vinculada directamente a la auditoría: {facts.directEvidence.map((item) => `${item.id} · ${item.title}`).join("; ")}.</p>}
          </section>

          <section className="committee-section" aria-labelledby="committee-attention">
            <div className="committee-section-heading"><span>04 / HECHOS PARA REVISIÓN</span><h2 id="committee-attention">Registros que merecen lectura</h2></div>
            <div className="committee-attention-grid">
              {[
                ["Riesgos altos", facts.highRisks, (item) => `${item.id} · ${item.title}`],
                ["Riesgos sin control visible", facts.withoutControl, (item) => `${item.id} · ${item.title}`],
                ["Controles evaluados de 1 a 3/5", facts.lowRatedControls, (item) => `${item.id} · ${item.title} (${item.effectiveness}/5)`],
                ["Hallazgos abiertos", facts.openFindings, (item) => `${item.id} · ${item.title}`]
              ].map(([title, items, describe]) => <section key={title}><h3>{title}<span>{items.length}</span></h3>
                {items.length ? <ul>{items.map((item) => <li key={item.id}>{describe(item)}</li>)}</ul> : <p>Ningún registro visible en esta categoría.</p>}
              </section>)}
            </div>
          </section>

          <section className="committee-section" aria-labelledby="committee-actions">
            <div className="committee-section-heading"><span>05 / SEGUIMIENTO</span><h2 id="committee-actions">Compromisos registrados</h2></div>
            {actionsLoading ? <p className="committee-empty" role="status">Consultando acciones relacionadas…</p>
              : actionsError ? <p className="committee-empty committee-error" role="alert">No se pudieron consultar las acciones: {actionsError}. Los conteos de acciones no están disponibles.</p>
                : actions.length ? <div className="committee-table-wrap"><table className="committee-table">
                  <caption>Acciones relacionadas con la auditoría y sus registros visibles</caption>
                  <thead><tr><th scope="col">Compromiso y origen</th><th scope="col">Responsable</th><th scope="col">Estado</th><th scope="col">Fecha objetivo</th></tr></thead>
                  <tbody>{actions.map((action) => <tr key={action.id}><th scope="row"><Link to={`/notificaciones?actionId=${encodeURIComponent(action.id)}`}>{action.title}</Link><small>{ACTION_SOURCE[action.sourceType]} · {action.sourceTitle} · {action.sourceId}</small><small>Motivo: {action.rationale}</small></th><td>{action.assigneeName}</td><td>{ACTION_STATUS[action.status] || action.status}</td><td>{action.dueDate}</td></tr>)}</tbody>
                </table></div> : <p className="committee-empty">No hay compromisos registrados para los registros visibles de este expediente.</p>}
            {canCreateAction && <p className="committee-note committee-action-link"><Link to={`/notificaciones?sourceType=AUDIT&sourceId=${encodeURIComponent(auditId)}`}>Registrar una acción vinculada a esta auditoría</Link></p>}
            <p className="committee-note">Las acciones relacionadas se muestran según los vínculos y permisos vigentes; una acción terminada refleja un cambio humano registrado, no una validación automática de cierre.</p>
          </section>

          <footer className="committee-footer">
            <p><b>Método.</b> Los datos provienen de la lectura autorizada del expediente. Un riesgo se vincula por su auditoría; un control, por el riesgo; un hallazgo, por riesgo y control; una evidencia, por su entidad. “Sin control” significa sin control visible vinculado en esta consulta. Un control de 1 a 3/5 se enumera como evaluado por debajo del umbral de efectividad de VERA. Cero registros no demuestra ausencia de exposición.</p>
            <p>Para revisar el detalle, cambios y documentos, <Link to={auditPath}>abre el expediente original</Link>. La impresión o el PDF son una copia de esta consulta y pueden quedar desactualizados.</p>
          </footer>
        </>}
      </article>
    </main>
  </div>;
}

export default CommitteeDossier;
