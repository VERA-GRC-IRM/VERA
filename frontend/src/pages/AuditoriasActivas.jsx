import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, ArrowLeft, ArrowRight, Bot, CheckCircle2, ClipboardCheck, Download, FileImage, FileSpreadsheet, FileText, Flag, GitBranch, LockKeyhole, Pencil, Play, Plus, RefreshCw, Save, ShieldAlert, Target, Upload, X } from "lucide-react";
import { uploadEvidenceFile, getEvidenceDownloadUrl } from "../services/evidenceService";
import Sidebar from "../components/Sidebar";
import AssistantDrawer from "../components/AssistantDrawer";
import PlanningHistoryButton from "../components/PlanningHistoryButton";
import EditAuditModal from "../components/EditAuditModal";
import AuditRisksPanel from "../components/AuditRisksPanel";
import { CONTROL_MANAGE_ROLES, PLANNING_APPROVE_ROLES, RISK_CONTROL_MANAGE_ROLES, RISK_FACTORS } from "../constants/planning";
import { closeAudit, getActiveAudits, getAuditContext, getPlanningAudits, startAudit, updateAuditWorkflowStep } from "../services/planningService";
import { getRiskOwners, getRisks } from "../services/riskService";
import { createControl, getControls, updateControl } from "../services/controlService";
import { createFinding, updateFinding } from "../services/findingService";
import { displayAuditId } from "../utils/auditId";
import "./Planning.css";

const riskFor = (likelihood, impact) => {
  const score = likelihood * impact;
  return score <= 2 ? "Bajo" : score <= 4 ? "Medio" : "Alto";
};

const GOVERNANCE_STEPS = [
  "annual", "quarterly", "start", "kickoff", "understanding",
  "execution", "supervision", "closure", "report"
];
const CONTROL_TYPES = [
  ["PREVENTIVE", "Preventivo"], ["DETECTIVE", "Detectivo"], ["CORRECTIVE", "Correctivo"]
];
const CONTROL_FREQUENCIES = ["Daily", "Weekly", "Monthly", "Quarterly", "Annually"];
const FREQUENCY_LABELS = {
  Daily: "Diaria", Weekly: "Semanal", Monthly: "Mensual",
  Quarterly: "Trimestral", Annually: "Anual"
};
const FINDING_SEVERITIES = [
  ["LOW", "Baja"], ["MEDIUM", "Media"], ["HIGH", "Alta"], ["CRITICAL", "Crítica"]
];

const initialWorkflowStep = (audit) => {
  if (audit?.workflowStep) return audit.workflowStep;
  if (audit?.status === "CLOSED") return "report";
  return "start";
};

const workflowProgress = (audit, step) => {
  if (audit?.status === "CLOSED") return 100;
  const currentStep = step || initialWorkflowStep(audit);
  const index = GOVERNANCE_STEPS.indexOf(currentStep);
  return index < 0 ? (audit?.progress ?? 0) : Math.round((index / (GOVERNANCE_STEPS.length - 1)) * 100);
};

function AuditoriasActivas() {
  const navigate = useNavigate();
  const { auditId } = useParams();
  const isGovernanceRoute = Boolean(auditId);
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const canManage = RISK_CONTROL_MANAGE_ROLES.includes(user?.role);
  const canCreateRecords = CONTROL_MANAGE_ROLES.includes(user?.role);
  const canAttachEvidence = PLANNING_APPROVE_ROLES.includes(user?.role);
  const [activeAudits, setActiveAudits] = useState([]);
  const [approvedAudits, setApprovedAudits] = useState([]);
  const [risks, setRisks] = useState([]);
  const [controls, setControls] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingAudit, setEditingAudit] = useState(null);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [assistantFocus, setAssistantFocus] = useState(null);
  const [activeStep, setActiveStep] = useState("execution");
  const [activeTab, setActiveTab] = useState("summary");
  const [auditContext, setAuditContext] = useState(null);
  const [contextError, setContextError] = useState(null);
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceSaving, setEvidenceSaving] = useState(false);
  const [riskOwners, setRiskOwners] = useState(() => user?.role === "AUDITOR"
    ? [{ id: user.id, name: user.name || user.username || "Mi usuario" }]
    : []);
  const [editingControlId, setEditingControlId] = useState(null);
  const [controlEditForm, setControlEditForm] = useState({});
  const [editingFindingId, setEditingFindingId] = useState(null);
  const [findingEditForm, setFindingEditForm] = useState({});
  const [creatingControl, setCreatingControl] = useState(false);
  const [controlCreateForm, setControlCreateForm] = useState({});
  const [creatingFinding, setCreatingFinding] = useState(false);
  const [findingCreateForm, setFindingCreateForm] = useState({});
  const [savingRecordId, setSavingRecordId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [active, proposals, linkedRisks, linkedControls] = await Promise.all([
        getActiveAudits(), getPlanningAudits(), getRisks(), getControls()
      ]);
      setActiveAudits(active);
      setApprovedAudits(proposals.filter((item) => item.status === "APPROVED"));
      setRisks(linkedRisks);
      setControls(linkedControls);
      if (auditId) {
        const auditFromRoute = [...active, ...proposals].find((item) => item.id === auditId) || null;
        setSelectedAudit(auditFromRoute);
        setActiveStep(initialWorkflowStep(auditFromRoute));
        setAuditContext(await getAuditContext(auditId));
        setContextError(null);
      }
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [auditId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getActiveAudits(), getPlanningAudits(), getRisks(), getControls()])
      .then(([active, proposals, linkedRisks, linkedControls]) => {
        if (cancelled) return;
        setActiveAudits(active);
        setApprovedAudits(proposals.filter((item) => item.status === "APPROVED"));
        setRisks(linkedRisks);
        setControls(linkedControls);
        const auditFromRoute = auditId
          ? [...active, ...proposals].find((item) => item.id === auditId) || null
          : null;
        setSelectedAudit(auditFromRoute || null);
        if (auditFromRoute) {
          setActiveStep(initialWorkflowStep(auditFromRoute));
        }
        setError("");
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [auditId]);

  useEffect(() => {
    if (!canCreateRecords || user?.role === "AUDITOR") return;
    getRiskOwners().then(setRiskOwners).catch((loadError) => setError(loadError.message));
  }, [canCreateRecords, user?.id, user?.name, user?.role, user?.username]);

  useEffect(() => {
    if (!auditId) return;
    let cancelled = false;
    getAuditContext(auditId).then((context) => {
      if (!cancelled) {
        setAuditContext(context);
        setContextError(null);
      }
    }).catch((loadError) => {
      if (!cancelled) setContextError({ id: auditId, message: loadError.message });
    });
    return () => { cancelled = true; };
  }, [auditId]);

  const governanceSteps = [
    { id: "annual", label: "Plan anual", icon: Target },
    { id: "quarterly", label: "Plan trimestral", icon: ClipboardCheck },
    { id: "start", label: "Inicio", icon: Flag },
    { id: "kickoff", label: "Kickoff", icon: Activity },
    { id: "understanding", label: "Understanding", icon: FileText },
    { id: "execution", label: "Ejecución y progreso", icon: ShieldAlert },
    { id: "supervision", label: "Supervisión", icon: Activity },
    { id: "closure", label: "Cierre", icon: CheckCircle2 },
    { id: "report", label: "Reporte", icon: FileText },
    { id: "followup", label: "Follow-up", icon: LockKeyhole, locked: true }
  ];
  const currentStepIndex = governanceSteps.findIndex((step) => step.id === activeStep);
  const nextGovernanceStep = governanceSteps[currentStepIndex + 1];
  const currentProgress = workflowProgress(selectedAudit, activeStep);

  const openAudit = (audit) => {
    navigate(`/auditorias-activas/${encodeURIComponent(audit.id)}`);
  };

  const closeAuditWorkspace = () => {
    navigate("/auditorias-activas");
  };

  const continueGovernance = async () => {
    if (!nextGovernanceStep || nextGovernanceStep.locked) return;
    if (!selectedAudit) return;
    setBusyId(selectedAudit.id);
    setError("");
    setMessage("");
    try {
      const updatedAudit = await updateAuditWorkflowStep(selectedAudit.id, nextGovernanceStep.id);
      setSelectedAudit(updatedAudit);
      setActiveStep(updatedAudit.workflowStep || nextGovernanceStep.id);
      setActiveTab("summary");
      setMessage(`Paso guardado: ${nextGovernanceStep.label}.`);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyId(null);
    }
  };

  const currentContext = auditContext?.audit.id === selectedAudit?.id ? auditContext : null;
  const currentContextError = !currentContext && contextError && contextError.id === selectedAudit?.id
    ? contextError.message : "";
  const linkedRisks = currentContext?.groups.risks || [];
  const linkedControls = currentContext?.groups.controls || [];
  const linkedEvidence = currentContext?.groups.evidence || [];
  const linkedFindings = currentContext?.groups.findings || [];

  const runTransition = async (id, action, successMessage) => {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      await action(id);
      await refresh();
      setMessage(successMessage);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleEdited = async (successMessage) => {
    setEditingAudit(null);
    await refresh();
    setMessage(successMessage);
  };

  const editControl = (control) => {
    setCreatingControl(false);
    setCreatingFinding(false);
    setEditingFindingId(null);
    setEditingControlId(control.id);
    setControlEditForm({
      title: control.title,
      description: control.description || "",
      type: control.type,
      frequency: control.frequency,
      ownerId: control.ownerId == null ? "" : String(control.ownerId),
      riskIds: control.riskIds || [],
      expectedStorageVersion: control.storageVersion
    });
    setError("");
    setMessage("");
  };

  const editFinding = (finding) => {
    setCreatingControl(false);
    setCreatingFinding(false);
    setEditingControlId(null);
    setEditingFindingId(finding.id);
    setFindingEditForm({
      title: finding.title,
      description: finding.description || "",
      rootCause: finding.rootCause || "",
      severity: finding.severity || "MEDIUM",
      responsibleId: finding.responsibleId == null ? "" : String(finding.responsibleId)
    });
    setError("");
    setMessage("");
  };

  const startControlCreation = () => {
    setCreatingFinding(false);
    setEditingControlId(null);
    setEditingFindingId(null);
    setControlCreateForm({
      title: "",
      description: "",
      type: "PREVENTIVE",
      frequency: "Monthly",
      riskId: linkedRisks[0]?.id || "",
      ownerId: user?.role === "AUDITOR" ? String(user.id) : "",
      rating: "3",
      note: ""
    });
    setError("");
    setMessage("");
    setCreatingControl(true);
  };

  const startFindingCreation = () => {
    setCreatingControl(false);
    setEditingControlId(null);
    setEditingFindingId(null);
    setFindingCreateForm({
      title: "",
      description: "",
      rootCause: "",
      severity: "MEDIUM",
      riskId: linkedRisks[0]?.id || "",
      controlId: "",
      responsibleId: user?.role === "AUDITOR" ? String(user.id) : ""
    });
    setError("");
    setMessage("");
    setCreatingFinding(true);
  };

  const replaceAuditContextRecord = (group, record) => {
    setAuditContext((current) => current && current.audit.id === selectedAudit?.id ? {
      ...current,
      groups: {
        ...current.groups,
        [group]: current.groups[group].map((item) => item.id === record.id ? record : item)
      }
    } : current);
  };

  const saveControlEdit = async (event, control) => {
    event.preventDefault();
    setSavingRecordId(control.id);
    setError("");
    try {
      const updated = await updateControl(control.id, {
        ...controlEditForm,
        ownerId: Number(controlEditForm.ownerId),
        ...(control.storageVersion !== undefined ? { expectedStorageVersion: control.storageVersion } : {})
      });
      setControls((current) => current.map((item) => item.id === updated.id ? updated : item));
      replaceAuditContextRecord("controls", updated);
      setEditingControlId(null);
      setMessage(`Control ${updated.id} actualizado.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingRecordId(null);
    }
  };

  const saveNewControl = async (event) => {
    event.preventDefault();
    setSavingRecordId("new-control");
    setError("");
    try {
      const created = await createControl({
        ...controlCreateForm,
        ownerId: Number(controlCreateForm.ownerId),
        riskIds: [controlCreateForm.riskId],
        rating: Number(controlCreateForm.rating)
      });
      setCreatingControl(false);
      await refresh();
      setMessage(`Control ${created.id} registrado en el expediente.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingRecordId(null);
    }
  };

  const saveFindingEdit = async (event, finding) => {
    event.preventDefault();
    setSavingRecordId(finding.id);
    setError("");
    try {
      const updated = await updateFinding(finding.id, {
        ...findingEditForm,
        responsibleId: Number(findingEditForm.responsibleId),
        version: finding.storageVersion
      });
      replaceAuditContextRecord("findings", updated);
      setEditingFindingId(null);
      setMessage(`Hallazgo ${updated.id} actualizado.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingRecordId(null);
    }
  };

  const saveNewFinding = async (event) => {
    event.preventDefault();
    setSavingRecordId("new-finding");
    setError("");
    try {
      const created = await createFinding({
        ...findingCreateForm,
        auditId: selectedAudit.id,
        riskId: findingCreateForm.riskId || "",
        controlId: findingCreateForm.controlId || "",
        responsibleId: Number(findingCreateForm.responsibleId)
      });
      setCreatingFinding(false);
      await refresh();
      setMessage(`Hallazgo ${created.id} registrado en el expediente.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingRecordId(null);
    }
  };

  const editButton = (audit) => canManage && (
    <button type="button" onClick={() => { setMessage(""); setEditingAudit(audit); }} disabled={busyId === audit.id}>
      <Pencil size={16} aria-hidden="true" />Editar
    </button>
  );

  const factorLabel = (value) => RISK_FACTORS.find((factor) => factor.value === value)?.label || "Media";
  const matrixCount = (likelihood, impact) => activeAudits.filter(
    (audit) => (audit.likelihood ?? 2) === likelihood && (audit.impact ?? 2) === impact
  ).length;
  const selectedAudits = selectedCell ? activeAudits.filter((audit) =>
    (audit.likelihood ?? 2) === selectedCell.likelihood && (audit.impact ?? 2) === selectedCell.impact
  ) : [];

  const handleEvidenceUpload = async (event) => {
    event.preventDefault();

    if (!selectedAudit || !evidenceFile || evidenceSaving) {
      return;
    }

    if (evidenceFile.size > 3 * 1024 * 1024) {
      setError("El archivo supera el límite de 3 MB.");
      return;
    }

    setEvidenceSaving(true);
    setError("");
    setMessage("");

    try {
      await uploadEvidenceFile(
        {
          title: evidenceTitle.trim(),
          description: evidenceDescription.trim(),
          evidenceType: "DOCUMENT",
          entityType: "AUDIT",
          entityId: selectedAudit.id
        },
        evidenceFile
      );

      setEvidenceTitle("");
      setEvidenceDescription("");
      setEvidenceFile(null);

      await refresh();

      setMessage("Archivo adjuntado correctamente a la auditoría.");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setEvidenceSaving(false);
    }
  };

  const handleEvidenceDownload = async (item) => {
    try {
      const url = await getEvidenceDownloadUrl(item.id);
      window.location.assign(url);
    } catch (cause) {
      setError(cause.message);
    }
  };

  return (
    <div className={`dashboard-layout ${isGovernanceRoute ? "governance-layout" : ""}`}>
      <Sidebar active="auditorias-activas" />
      <main className="dashboard-main">
        <section className={`dashboard-content planning-page clean-header-page active-audits-page ${isGovernanceRoute ? "governance-route" : ""}`}>
          <div className="dashboard-header">
            <div>
              <span className="eyebrow">EJECUCIÓN Y RIESGO</span>
              <h1>Auditorías activas y matriz de riesgos</h1>
              <p>Consulta las auditorías en curso, su exposición y las decisiones de inicio o cierre.</p>
            </div>
            <button className="secondary-action" type="button" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} aria-hidden="true" /> Actualizar
            </button>
          </div>

          {!isGovernanceRoute && message && <p className="planning-message success" role="status">{message}</p>}
          {!isGovernanceRoute && error && <p className="planning-message error" role="alert">{error}</p>}

          <div className="planning-summary">
            <div><strong>{activeAudits.length}</strong><span>Auditorías en curso</span></div>
            <div><strong>{approvedAudits.length}</strong><span>Aprobadas por iniciar</span></div>
            <div><strong>{activeAudits.filter((audit) => riskFor(audit.likelihood ?? 2, audit.impact ?? 2) === "Alto").length}</strong><span>Riesgo alto en curso</span></div>
          </div>

          <section className="risk-matrix-panel" aria-labelledby="risk-matrix-title">
            <div className="planning-section-heading">
              <div>
                <span className="eyebrow">MATRIZ 3 × 3</span>
                <h2 id="risk-matrix-title">Probabilidad e impacto de auditorías en curso</h2>
              </div>
              <span>Clasificación = probabilidad × impacto</span>
            </div>
            {loading ? <div className="planning-empty">Cargando matriz de riesgos...</div> : (
              <div className="risk-matrix-scroll">
                <table className="risk-matrix">
                  <caption>Conteo de auditorías activas por nivel de probabilidad e impacto</caption>
                  <thead>
                    <tr>
                      <th scope="col">Probabilidad ↓ / Impacto →</th>
                      {RISK_FACTORS.map((factor) => <th scope="col" key={factor.value}>{factor.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...RISK_FACTORS].reverse().map((likelihood) => (
                      <tr key={likelihood.value}>
                        <th scope="row">{likelihood.label}</th>
                        {RISK_FACTORS.map((impact) => {
                          const risk = riskFor(likelihood.value, impact.value);
                          return (
                            <td className={`matrix-cell matrix-${risk.toLowerCase()}`} key={impact.value}>
                              <button
                                type="button"
                                className="matrix-cell-button"
                                aria-label={`Ver auditorías con probabilidad ${likelihood.label} e impacto ${impact.label}: ${matrixCount(likelihood.value, impact.value)}`}
                                aria-pressed={selectedCell?.likelihood === likelihood.value && selectedCell?.impact === impact.value}
                                onClick={() => setSelectedCell({ likelihood: likelihood.value, impact: impact.value })}
                              >
                                <strong>{matrixCount(likelihood.value, impact.value)}</strong>
                                <span>{risk}</span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="risk-matrix-legend">Bajo: puntuación 1–2 · Medio: 3–4 · Alto: 6–9. El producto se calcula con niveles de 1 (bajo) a 3 (alto).</p>
            {selectedCell && (
              <section className="matrix-selection" aria-live="polite" aria-label="Detalle de la celda seleccionada">
                <h3>Auditorías y riesgos · probabilidad {factorLabel(selectedCell.likelihood)}, impacto {factorLabel(selectedCell.impact)}</h3>
                {selectedAudits.length === 0 ? <p>No hay auditorías activas en esta celda.</p> : selectedAudits.map((audit) => {
                  const linkedRisks = risks.filter((item) => item.linkedAuditId === audit.id);
                  return <article key={audit.id} className="matrix-selection-audit">
                    <h4 title={audit.id}>{displayAuditId(audit.id, audit.auditFolio || audit.folio)} · {audit.title}</h4>
                    <p>Riesgo de auditoría: {riskFor(audit.likelihood ?? 2, audit.impact ?? 2)} ({(audit.likelihood ?? 2) * (audit.impact ?? 2)}/9).</p>
                    {linkedRisks.length ? linkedRisks.map((item) => {
                      const relatedControls = controls.filter((control) => control.riskIds.includes(item.id));
                      return <div key={item.id} className="matrix-linked-risk">
                        <strong>{item.id} · {item.title}</strong>
                        <p>{item.description} · Nivel {item.level} ({item.score}/9)</p>
                        <p>Controles asociados: {relatedControls.length ? relatedControls.map((control) => `${control.id} · ${control.title} (${control.effectiveness}/5)`).join(", ") : "ninguno registrado"}.</p>
                      </div>;
                    }) : <p>No hay riesgos registrados vinculados a esta auditoría.</p>}
                    <button type="button" className="matrix-audit-open" onClick={() => openAudit(audit)}>Abrir expediente</button>
                  </article>;
                })}
              </section>
            )}
          </section>

          <div className="planning-section-heading active-list-heading">
            <div><span className="eyebrow">SEGUIMIENTO</span><h2>En curso</h2></div>
            <span>{activeAudits.length} activas</span>
          </div>
          {loading ? <div className="planning-empty">Cargando auditorías...</div> : activeAudits.length === 0 ? (
            <div className="planning-empty"><Activity size={20} aria-hidden="true" />No hay auditorías en curso.</div>
          ) : (
            <div className="planning-list">
              {activeAudits.map((audit) => (
                <article className="planning-card active-audit-card" id={`audit-${audit.id}`} key={audit.id} onClick={() => openAudit(audit)}>
                  <div className="planning-card-icon"><Activity size={21} aria-hidden="true" /></div>
                  <div className="planning-card-content">
                    <div className="proposal-heading">
                      <span className="planning-id" title={audit.id}>{displayAuditId(audit.id, audit.auditFolio || audit.folio)}</span>
                      <span className={`risk-badge risk-${riskFor(audit.likelihood ?? 2, audit.impact ?? 2).toLowerCase()}`}>
                        Riesgo {riskFor(audit.likelihood ?? 2, audit.impact ?? 2)}
                      </span>
                    </div>
                    <h2>{audit.title}</h2>
                    <p>{audit.objective}</p>
                    <div className="proposal-meta">
                      <span><b>Área:</b> {audit.area}</span>
                      <span><b>Responsable:</b> {audit.responsible || "Sin asignar"}</span>
                      <span><b>Inicio:</b> {audit.startedAt ? new Date(audit.startedAt).toLocaleDateString("es-MX") : "Sin dato"}</span>
                      <span><b>Probabilidad / impacto:</b> {factorLabel(audit.likelihood ?? 2)} / {factorLabel(audit.impact ?? 2)}</span>
                    </div>
                  </div>
                  <div className="planning-card-actions" onClick={(event) => event.stopPropagation()}>
                    {canManage && <button type="button" onClick={() => runTransition(audit.id, closeAudit, "Auditoría cerrada.")} disabled={busyId === audit.id}>
                      <CheckCircle2 size={16} aria-hidden="true" />{busyId === audit.id ? "Guardando..." : "Cerrar auditoría"}
                    </button>}
                    {editButton(audit)}
                    <PlanningHistoryButton proposal={audit} />
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="planning-section-heading active-list-heading">
            <div><span className="eyebrow">LISTAS PARA EJECUCIÓN</span><h2>Aprobadas pendientes de inicio</h2></div>
            <span>{approvedAudits.length} aprobadas</span>
          </div>
          {approvedAudits.length === 0 ? (
            <div className="planning-empty">No hay auditorías aprobadas pendientes de inicio.</div>
          ) : (
            <div className="planning-list">
              {approvedAudits.map((audit) => (
                <article className="planning-card active-audit-card" key={audit.id}>
                  <div className="planning-card-icon"><CheckCircle2 size={21} aria-hidden="true" /></div>
                  <div className="planning-card-content">
                    <span className="planning-id" title={audit.id}>{displayAuditId(audit.id, audit.auditFolio || audit.folio)} · {audit.quarter} {audit.year}</span>
                    <h2>{audit.title}</h2>
                    <p>{audit.area} · Riesgo {riskFor(audit.likelihood ?? 2, audit.impact ?? 2)}</p>
                  </div>
                  <div className="planning-card-actions">
                    {canManage && <button type="button" onClick={() => runTransition(audit.id, startAudit, "Auditoría iniciada y visible en la matriz.")} disabled={busyId === audit.id}>
                      <Play size={16} aria-hidden="true" />{busyId === audit.id ? "Guardando..." : "Iniciar auditoría"}
                    </button>}
                    {editButton(audit)}
                    <PlanningHistoryButton proposal={audit} />
                  </div>
                </article>
              ))}
            </div>
          )}

          {selectedAudit && (
            <div className="governance-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeAuditWorkspace();
            }}>
              <section className="governance-workspace" role="dialog" aria-modal="true" aria-labelledby="governance-title">
                <header className="governance-header">
                  <button type="button" className="governance-back" onClick={closeAuditWorkspace}>
                    <ArrowLeft size={18} aria-hidden="true" /> Volver a auditorías
                  </button>
                  <div className="governance-heading">
                    <div>
                      <h2 id="governance-title">{selectedAudit.title}</h2>
                      <span className="planning-id" title={selectedAudit.id}>{displayAuditId(selectedAudit.id, selectedAudit.auditFolio || selectedAudit.folio)} · {selectedAudit.area}</span>
                      <button type="button" className="secondary-action" onClick={() => setAssistantFocus({ type: "audit", id: selectedAudit.id, title: selectedAudit.title })}><Bot size={15} aria-hidden="true" /> Analizar con IA</button>
                      <button type="button" className="secondary-action" onClick={() => navigate(`/auditorias-activas/${encodeURIComponent(selectedAudit.id)}/comite`)}><FileText size={15} aria-hidden="true" /> Ficha para comité</button>
                    </div>
                    <div className="governance-progress">
                      <span>PROGRESO GENERAL</span>
                      <strong>{currentProgress}%</strong>
                    </div>
                  </div>
                </header>

                <div className="governance-body">
                  <aside className="governance-sidebar">
                    <span className="eyebrow">FLUJO DE GOBIERNO</span>
                    {governanceSteps.map(({ id, label, icon: Icon, locked }, index) => (
                      <button
                        type="button"
                        key={id}
                        className={`governance-step ${activeStep === id ? "is-active" : ""} ${index < currentStepIndex ? "is-complete" : ""} ${locked || index !== currentStepIndex ? "is-locked" : ""}`}
                        disabled={locked || index !== currentStepIndex}
                      >
                        {locked ? <LockKeyhole size={16} /> : <Icon size={16} />}
                        <span>{label}</span>
                      </button>
                    ))}
                  </aside>

                  <div className="governance-content">
                    {message && <p className="planning-message success" role="status">{message}</p>}
                    {error && <p className="planning-message error" role="alert">{error}</p>}
                    <div className="governance-stage">
                      <span className="eyebrow">PASO {governanceSteps.findIndex((step) => step.id === activeStep) + 1} · {governanceSteps.find((step) => step.id === activeStep)?.label.toUpperCase()}</span>
                      <h3>{activeStep === "closure" ? "Cierre y comunicación" : activeStep === "execution" ? "Ejecución y progreso" : governanceSteps.find((step) => step.id === activeStep)?.label}</h3>
                      <p>{activeStep === "execution" ? "Documenta riesgos, controles, evidencias y el avance de la auditoría." : "Completa esta etapa y continúa con el siguiente paso del flujo."}</p>
                      {selectedAudit.status === "APPROVED" && canManage && (
                        <button
                          type="button"
                          className="governance-continue"
                          onClick={() => runTransition(selectedAudit.id, startAudit, "Auditoría iniciada. Ya puedes continuar a Kickoff.")}
                          disabled={busyId === selectedAudit.id}
                        >
                          {busyId === selectedAudit.id ? "Guardando..." : "Iniciar auditoría"}
                          <Play size={17} aria-hidden="true" />
                        </button>
                      )}
                      {nextGovernanceStep && !nextGovernanceStep.locked &&
                        ["ACTIVE", "CLOSED"].includes(selectedAudit.status) && (
                        <button type="button" className="governance-continue" onClick={continueGovernance} disabled={busyId === selectedAudit?.id}>
                          {busyId === selectedAudit?.id ? "Guardando..." : `Continuar a ${nextGovernanceStep.label}`}
                          <ArrowRight size={17} aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <nav className="governance-tabs" aria-label="Secciones del expediente">
                      {[
                        ["summary", "Resumen", Target],
                        ["map", "Mapa del expediente", GitBranch],
                        ["risks", "Riesgos", ShieldAlert],
                        ["controls", "Controles", ClipboardCheck],
                        ["findings", "Hallazgos", Flag],
                        ["evidence", "Evidencias", FileText],
                        ["activity", "Actividad", Activity]
                      ].map(([id, label, Icon]) => (
                        <button type="button" key={id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}>
                          <Icon size={16} /> {label}
                          {id === "risks" && linkedRisks.length > 0 && <small>{linkedRisks.length}</small>}
                          {id === "controls" && linkedControls.length > 0 && <small>{linkedControls.length}</small>}
                          {id === "findings" && linkedFindings.length > 0 && <small>{linkedFindings.length}</small>}
                          {id === "evidence" && linkedEvidence.length > 0 && <small>{linkedEvidence.length}</small>}
                        </button>
                      ))}
                    </nav>

                    <div className="governance-panel">
                      {activeStep === "report" && currentContext && <section aria-label="Reporte de auditoría">
                        <h3>Reporte del expediente</h3>
                        <p>{currentContext.audit.title} · {currentContext.audit.status} · {currentContext.audit.area}</p>
                        <p>{linkedRisks.length} riesgos · {linkedControls.length} controles · {linkedFindings.length} hallazgos · {linkedEvidence.length} evidencias vinculadas.</p>
                        <button type="button" className="secondary-action" onClick={() => navigate(`/auditorias-activas/${encodeURIComponent(selectedAudit.id)}`)}>Ver reporte y descargar CSV o PDF</button>
                      </section>}
                      {currentContextError && <p role="alert">No se pudieron cargar las relaciones: {currentContextError}</p>}
                      {activeTab !== "summary" && activeTab !== "activity" && !currentContext && !currentContextError && <p role="status">Cargando relaciones del expediente...</p>}
                      {activeTab === "summary" && (
                        <>
                          <h3>Resumen de auditoría</h3>
                          <p>{selectedAudit.objective || "Sin objetivo registrado."}</p>
                          <div className="governance-info-grid">
                            <div><span>Responsable</span><strong>{selectedAudit.responsible || "Sin asignar"}</strong></div>
                            <div><span>Tipo</span><strong>{selectedAudit.type}</strong></div>
                            <div><span>Periodo</span><strong>{selectedAudit.startDate || "—"} → {selectedAudit.endDate || "—"}</strong></div>
                            <div><span>Estado</span><strong>{selectedAudit.status}</strong></div>
                          </div>
                        </>
                      )}
                      {activeTab === "map" && currentContext && (
                        <section className="audit-context-map" aria-label="Mapa del expediente">
                          <h3>Mapa del expediente</h3>
                          <p>Relaciones registradas y visibles para tu cuenta. Cada cifra abre su sección del expediente.</p>
                          <div className="audit-context-metrics">
                            {[["risks", "Riesgos"], ["controls", "Controles"], ["findings", "Hallazgos"], ["evidence", "Evidencias"]].map(([key, label]) => (
                              <button key={key} type="button" onClick={() => setActiveTab(key)}>
                                <strong>{currentContext.counts[key]}</strong><span>{label}</span>
                              </button>
                            ))}
                          </div>
                          {linkedRisks.length ? linkedRisks.map((risk) => {
                            const riskControls = linkedControls.filter((control) => control.riskIds.includes(risk.id));
                            const riskControlIds = new Set(riskControls.map((control) => control.id));
                            const riskFindings = linkedFindings.filter((finding) => finding.riskId === risk.id);
                            const riskEvidence = linkedEvidence.filter((item) =>
                              (item.entityType === "RISK" && item.entityId === risk.id) ||
                              (item.entityType === "CONTROL" && riskControlIds.has(item.entityId)));
                            return <article className="audit-context-row" key={risk.id}>
                              <div><span>RIESGO · {risk.id}</span><strong>{risk.title}</strong></div>
                              <div className="audit-context-links">
                                <button type="button" onClick={() => setActiveTab("controls")}>{riskControls.length} controles</button>
                                <button type="button" onClick={() => setActiveTab("findings")}>{riskFindings.length} hallazgos</button>
                                <button type="button" onClick={() => setActiveTab("evidence")}>{riskEvidence.length} evidencias</button>
                              </div>
                            </article>;
                          }) : <p>Aún no hay riesgos vinculados a esta auditoría.</p>}
                          {linkedEvidence.some((item) => item.entityType === "AUDIT") && <p>También hay {linkedEvidence.filter((item) => item.entityType === "AUDIT").length} evidencias vinculadas directamente a la auditoría.</p>}
                          <small>Actualizado: {new Date(currentContext.asOf).toLocaleString("es-MX")} · {currentContext.scope}</small>
                        </section>
                      )}
                      {activeTab === "risks" && currentContext && (
                        <>
                          <AuditRisksPanel auditId={selectedAudit.id} onChanged={async () => { await refresh(); }} />
                        </>
                      )}
                      {activeTab === "controls" && currentContext && (
                        <>
                          <div className="governance-panel-heading">
                            <div><h3>Controles</h3><p>Asocia controles a los riesgos vinculados con esta auditoría.</p></div>
                            {canCreateRecords && <button type="button" className="primary-action" onClick={startControlCreation} disabled={linkedRisks.length === 0}>
                              <Plus size={16} aria-hidden="true" />Agregar control
                            </button>}
                          </div>
                          {linkedRisks.length === 0 && <p>No hay riesgos vinculados. Agrega primero un riesgo en la pestaña Riesgos.</p>}
                          {creatingControl && <form className="governance-inline-editor" onSubmit={saveNewControl}>
                            <h4>Nuevo control</h4>
                            <label>Nombre del control<input required minLength={3} maxLength={120} value={controlCreateForm.title}
                              onChange={(event) => setControlCreateForm((current) => ({ ...current, title: event.target.value }))} /></label>
                            <label>Descripción<textarea required minLength={10} maxLength={1000} rows={3} value={controlCreateForm.description}
                              onChange={(event) => setControlCreateForm((current) => ({ ...current, description: event.target.value }))} /></label>
                            <label>Riesgo asociado<select required value={controlCreateForm.riskId}
                              onChange={(event) => setControlCreateForm((current) => ({ ...current, riskId: event.target.value }))}>
                              <option value="">Selecciona un riesgo</option>
                              {linkedRisks.map((risk) => <option key={risk.id} value={risk.id}>{risk.id} · {risk.title}</option>)}
                            </select></label>
                            <label>Tipo<select value={controlCreateForm.type} onChange={(event) => setControlCreateForm((current) => ({ ...current, type: event.target.value }))}>
                              {CONTROL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select></label>
                            <label>Frecuencia<select value={controlCreateForm.frequency} onChange={(event) => setControlCreateForm((current) => ({ ...current, frequency: event.target.value }))}>
                              {CONTROL_FREQUENCIES.map((value) => <option key={value} value={value}>{FREQUENCY_LABELS[value]}</option>)}
                            </select></label>
                            <label>Responsable<select required value={controlCreateForm.ownerId}
                              onChange={(event) => setControlCreateForm((current) => ({ ...current, ownerId: event.target.value }))}>
                              <option value="">Selecciona una persona</option>
                              {riskOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                            </select></label>
                            <label>Efectividad inicial<select required value={controlCreateForm.rating}
                              onChange={(event) => setControlCreateForm((current) => ({ ...current, rating: event.target.value }))}>
                              {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} / 5{rating >= 4 ? " · Efectivo" : " · Inefectivo"}</option>)}
                            </select></label>
                            <label>Justificación de la evaluación<textarea required minLength={10} maxLength={500} rows={2} value={controlCreateForm.note}
                              onChange={(event) => setControlCreateForm((current) => ({ ...current, note: event.target.value }))} /></label>
                            <div className="governance-editor-actions">
                              <button type="submit" className="primary-action" disabled={savingRecordId === "new-control" || linkedRisks.length === 0 || !riskOwners.length}>
                                <Save size={15} aria-hidden="true" />{savingRecordId === "new-control" ? "Guardando..." : "Guardar control"}
                              </button>
                              <button type="button" className="secondary-action" disabled={savingRecordId === "new-control"} onClick={() => setCreatingControl(false)}>
                                <X size={15} aria-hidden="true" />Cancelar
                              </button>
                            </div>
                          </form>}
                          {linkedControls.length ? linkedControls.map((control) => <article className="governance-record" key={control.id}>
                            <div className="governance-record-heading">
                              <strong>{control.id} · {control.title}</strong>
                              {canManage && <button type="button" className="secondary-action" onClick={() => editControl(control)}>
                                <Pencil size={15} aria-hidden="true" />Editar
                              </button>}
                            </div>
                            <p>{control.description || "Control registrado en el expediente."}</p>
                            <span>Resultado: {control.effectiveness ?? "Sin evaluar"} · Tipo: {CONTROL_TYPES.find(([value]) => value === control.type)?.[1] || control.type || "—"} · Frecuencia: {FREQUENCY_LABELS[control.frequency] || control.frequency || "—"} · Responsable: {control.ownerName || "Sin asignar"}</span>
                            {editingControlId === control.id && <form className="governance-inline-editor" onSubmit={(event) => saveControlEdit(event, control)}>
                              <label>Nombre del control<input required minLength={3} maxLength={120} value={controlEditForm.title}
                                onChange={(event) => setControlEditForm((current) => ({ ...current, title: event.target.value }))} /></label>
                              <label>Descripción<textarea required minLength={10} maxLength={1000} rows={3} value={controlEditForm.description}
                                onChange={(event) => setControlEditForm((current) => ({ ...current, description: event.target.value }))} /></label>
                              <label>Tipo<select value={controlEditForm.type} onChange={(event) => setControlEditForm((current) => ({ ...current, type: event.target.value }))}>
                                {CONTROL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select></label>
                              <label>Frecuencia<select value={controlEditForm.frequency} onChange={(event) => setControlEditForm((current) => ({ ...current, frequency: event.target.value }))}>
                                {CONTROL_FREQUENCIES.map((value) => <option key={value} value={value}>{FREQUENCY_LABELS[value]}</option>)}
                              </select></label>
                              <label>Responsable<select required value={controlEditForm.ownerId} onChange={(event) => setControlEditForm((current) => ({ ...current, ownerId: event.target.value }))}>
                                <option value="">Selecciona una persona</option>
                                {control.ownerId && !riskOwners.some((owner) => String(owner.id) === String(control.ownerId)) &&
                                  <option value={control.ownerId} disabled>{control.ownerName || "Responsable actual"} · no activo</option>}
                                {riskOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                              </select></label>
                              <div className="governance-editor-actions">
                                <button type="submit" className="primary-action" disabled={savingRecordId === control.id}>
                                  <Save size={15} aria-hidden="true" />{savingRecordId === control.id ? "Guardando..." : "Guardar control"}
                                </button>
                                <button type="button" className="secondary-action" disabled={savingRecordId === control.id} onClick={() => setEditingControlId(null)}>
                                  <X size={15} aria-hidden="true" />Cancelar
                                </button>
                              </div>
                            </form>}
                          </article>) : <p>No hay controles vinculados a los riesgos de esta auditoría. {canCreateRecords ? "Usa Agregar control para registrar uno." : "Tu rol puede consultar, pero no registrar controles."}</p>}
                        </>
                      )}
                      {activeTab === "findings" && currentContext && <>
                        <div className="governance-panel-heading">
                          <div><h3>Hallazgos</h3><p>Registra una desviación asociada a esta auditoría, un riesgo o un control inefectivo.</p></div>
                          {canCreateRecords && <button type="button" className="primary-action" onClick={startFindingCreation}>
                            <Plus size={16} aria-hidden="true" />Agregar hallazgo
                          </button>}
                        </div>
                        {creatingFinding && <form className="governance-inline-editor" onSubmit={saveNewFinding}>
                          <h4>Nuevo hallazgo</h4>
                          <label>Título<input required minLength={3} maxLength={120} value={findingCreateForm.title}
                            onChange={(event) => setFindingCreateForm((current) => ({ ...current, title: event.target.value }))} /></label>
                          <label>Descripción<textarea required minLength={10} maxLength={2000} rows={3} value={findingCreateForm.description}
                            onChange={(event) => setFindingCreateForm((current) => ({ ...current, description: event.target.value }))} /></label>
                          <label>Causa raíz<textarea required minLength={10} maxLength={2000} rows={3} value={findingCreateForm.rootCause}
                            onChange={(event) => setFindingCreateForm((current) => ({ ...current, rootCause: event.target.value }))} /></label>
                          <label>Riesgo asociado<select value={findingCreateForm.riskId}
                            onChange={(event) => setFindingCreateForm((current) => ({ ...current, riskId: event.target.value, controlId: "" }))}>
                            <option value="">Sin riesgo específico</option>
                            {linkedRisks.map((risk) => <option key={risk.id} value={risk.id}>{risk.id} · {risk.title}</option>)}
                          </select></label>
                          <label>Control relacionado (opcional)<select value={findingCreateForm.controlId}
                            onChange={(event) => setFindingCreateForm((current) => ({ ...current, controlId: event.target.value }))}>
                            <option value="">Sin control</option>
                            {linkedControls.filter((control) => control.riskIds?.includes(findingCreateForm.riskId) && Number(control.effectiveness) < 4)
                              .map((control) => <option key={control.id} value={control.id}>{control.id} · {control.title}</option>)}
                          </select></label>
                          <small>Solo se pueden asociar controles inefectivos; la auditoría queda vinculada automáticamente.</small>
                          <label>Severidad<select required value={findingCreateForm.severity}
                            onChange={(event) => setFindingCreateForm((current) => ({ ...current, severity: event.target.value }))}>
                            {FINDING_SEVERITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select></label>
                          <label>Responsable<select required value={findingCreateForm.responsibleId}
                            onChange={(event) => setFindingCreateForm((current) => ({ ...current, responsibleId: event.target.value }))}>
                            <option value="">Selecciona una persona activa</option>
                            {riskOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                          </select></label>
                          <div className="governance-editor-actions">
                            <button type="submit" className="primary-action" disabled={savingRecordId === "new-finding" || !riskOwners.length}>
                              <Save size={15} aria-hidden="true" />{savingRecordId === "new-finding" ? "Guardando..." : "Guardar hallazgo"}
                            </button>
                            <button type="button" className="secondary-action" disabled={savingRecordId === "new-finding"} onClick={() => setCreatingFinding(false)}>
                              <X size={15} aria-hidden="true" />Cancelar
                            </button>
                          </div>
                        </form>}
                        {linkedFindings.length ? linkedFindings.map((finding) => <article className="governance-record" key={finding.id}>
                          <div className="governance-record-heading">
                            <strong>{finding.id} · {finding.title}</strong>
                            {canManage && finding.status === "OPEN" && <button type="button" className="secondary-action" onClick={() => editFinding(finding)}>
                              <Pencil size={15} aria-hidden="true" />Editar
                            </button>}
                          </div>
                          <p>{finding.description}</p>
                          <span>{finding.status} · Severidad: {FINDING_SEVERITIES.find(([value]) => value === finding.severity)?.[1] || "Sin clasificar"} · Responsable: {finding.responsibleName || "Sin asignar"} · Riesgo {finding.riskId || "—"} · Control {finding.controlId || "—"}</span>
                          {finding.rootCause && <p>Causa raíz: {finding.rootCause}</p>}
                          {editingFindingId === finding.id && <form className="governance-inline-editor" onSubmit={(event) => saveFindingEdit(event, finding)}>
                            <p>Las relaciones con auditoría, riesgo y control, así como la evidencia asociada, se conservan.</p>
                            <label>Título<input required minLength={3} maxLength={120} value={findingEditForm.title}
                              onChange={(event) => setFindingEditForm((current) => ({ ...current, title: event.target.value }))} /></label>
                            <label>Descripción<textarea required minLength={10} maxLength={2000} rows={3} value={findingEditForm.description}
                              onChange={(event) => setFindingEditForm((current) => ({ ...current, description: event.target.value }))} /></label>
                            <label>Causa raíz<textarea required minLength={10} maxLength={2000} rows={3} value={findingEditForm.rootCause}
                              onChange={(event) => setFindingEditForm((current) => ({ ...current, rootCause: event.target.value }))} /></label>
                            <label>Severidad<select required value={findingEditForm.severity} onChange={(event) => setFindingEditForm((current) => ({ ...current, severity: event.target.value }))}>
                              {FINDING_SEVERITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select></label>
                            <label>Responsable<select required value={findingEditForm.responsibleId} onChange={(event) => setFindingEditForm((current) => ({ ...current, responsibleId: event.target.value }))}>
                              <option value="">Selecciona una persona activa</option>
                              {finding.responsibleId && !riskOwners.some((owner) => String(owner.id) === String(finding.responsibleId)) &&
                                <option value={finding.responsibleId} disabled>{finding.responsibleName || "Responsable actual"} · no activo</option>}
                              {riskOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                            </select></label>
                            <div className="governance-editor-actions">
                              <button type="submit" className="primary-action" disabled={savingRecordId === finding.id}>
                                <Save size={15} aria-hidden="true" />{savingRecordId === finding.id ? "Guardando..." : "Guardar hallazgo"}
                              </button>
                              <button type="button" className="secondary-action" disabled={savingRecordId === finding.id} onClick={() => setEditingFindingId(null)}>
                                <X size={15} aria-hidden="true" />Cancelar
                              </button>
                            </div>
                          </form>}
                        </article>) : <p>No hay hallazgos registrados para esta auditoría. {canCreateRecords ? "Usa Agregar hallazgo para registrar uno." : "Tu rol puede consultar, pero no registrar hallazgos."}</p>}
                        {canManage && linkedFindings.some((finding) => finding.status !== "OPEN") &&
                          <p>Solo los hallazgos abiertos pueden editarse; los pendientes de revisión y cerrados conservan su historial.</p>}
                      </>}
                      {activeTab === "evidence" && currentContext && (
                        <>
                          <div className="evidence-section-header">
                            <div>
                              <h3>Evidencias</h3>
                              <p>
                                Documentos y archivos que respaldan la auditoría.
                              </p>
                            </div>

                            {canAttachEvidence && (
                              <span className="evidence-permission">
                                <Upload size={14} />
                                Permiso de carga habilitado
                              </span>
                            )}
                          </div>

                          {canAttachEvidence && (
                            <form
                              className="governance-evidence-form"
                              onSubmit={handleEvidenceUpload}
                            >
                              <h4>Adjuntar nuevo documento</h4>

                              <label>
                                Nombre del documento

                                <input
                                  type="text"
                                  required
                                  minLength={3}
                                  maxLength={120}
                                  value={evidenceTitle}
                                  onChange={(event) =>
                                    setEvidenceTitle(event.target.value)
                                  }
                                  placeholder="Ej. Informe de auditoría trimestral"
                                />
                              </label>

                              <label>
                                Descripción

                                <textarea
                                  required
                                  minLength={10}
                                  maxLength={1000}
                                  value={evidenceDescription}
                                  onChange={(event) =>
                                    setEvidenceDescription(event.target.value)
                                  }
                                  placeholder="Describe el contenido y su relación con la auditoría."
                                />
                              </label>

                              <label>
                                Seleccionar archivo

                                <input
                                  type="file"
                                  required
                                  accept=".pdf,.xls,.xlsx,.doc,.docx,.csv,.png,.jpg,.jpeg,.webp,.gif"
                                  onChange={(event) => {
                                    const selected =
                                      event.target.files?.[0] || null;

                                    if (selected && selected.size > 3 * 1024 * 1024) {
                                      setError("El archivo supera el límite de 3 MB.");
                                      setEvidenceFile(null);
                                      event.target.value = "";
                                      return;
                                    }

                                    setError("");
                                    setEvidenceFile(selected);
                                  }}
                                />

                                <small>
                                  PDF, Excel, Word, CSV e imágenes. Máximo 3 MB.
                                </small>
                              </label>

                              <button
                                type="submit"
                                className="primary-action"
                                disabled={evidenceSaving || !evidenceFile}
                              >
                                <Upload size={16} />

                                {evidenceSaving
                                  ? "Cargando archivo..."
                                  : "Adjuntar archivo"}
                              </button>
                            </form>
                          )}

                          {linkedEvidence.length > 0 ? (
                            <div className="governance-evidence-list">
                              {linkedEvidence.map((item) => (
                                <article
                                  className="governance-record"
                                  key={item.id}
                                >
                                  <div className="evidence-record-heading">
                                    <div>
                                      <strong>
                                        {item.id} · {item.title}
                                      </strong>

                                      <p>
                                        {item.description || "Evidencia registrada."}
                                      </p>
                                    </div>

                                    {item.file && (
                                      <span className="evidence-file-icon">
                                        {item.file.mime.startsWith("image/") ? (
                                          <FileImage size={21} />
                                        ) : item.file.mime.includes("spreadsheet") ||
                                          item.file.mime === "application/vnd.ms-excel" ||
                                          item.file.mime === "text/csv" ? (
                                          <FileSpreadsheet size={21} />
                                        ) : (
                                          <FileText size={21} />
                                        )}
                                      </span>
                                    )}
                                  </div>

                                  <span>
                                    Vinculada a{" "}
                                    {({
                                      AUDIT: "auditoría",
                                      RISK: "riesgo",
                                      CONTROL: "control"
                                    })[item.entityType]}{" "}
                                    {item.entityId}
                                  </span>

                                  {item.author?.name && (
                                    <small>
                                      Registrada por: {item.author.name}
                                    </small>
                                  )}

                                  {item.file && (
                                    <div className="evidence-download-row">
                                      <small>
                                        {(item.file.size / 1024).toFixed(1)} KB
                                      </small>

                                      <button
                                        type="button"
                                        className="secondary-action"
                                        onClick={() =>
                                          handleEvidenceDownload(item)
                                        }
                                      >
                                        <Download size={15} />
                                        Descargar archivo
                                      </button>
                                    </div>
                                  )}
                                </article>
                              ))}
                            </div>
                          ) : (
                            <p>
                              No hay evidencias vinculadas a esta auditoría
                              ni a sus riesgos o controles.
                            </p>
                          )}
                        </>
                      )}
                      {activeTab === "activity" && <><h3>Actividad del expediente</h3><PlanningHistoryButton proposal={selectedAudit} /></>}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {editingAudit && (
            <EditAuditModal
              audit={editingAudit}
              onClose={() => setEditingAudit(null)}
              onSaved={handleEdited}
            />
          )}
        </section>
      </main>
      {assistantFocus && <AssistantDrawer key={assistantFocus.id} focus={assistantFocus} onClose={() => setAssistantFocus(null)} />}
    </div>
  );
}

export default AuditoriasActivas;
