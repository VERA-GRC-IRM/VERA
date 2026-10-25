import { useEffect, useState } from "react";
import { Check, ClipboardList, MoreHorizontal, Pencil, Plus, Trash2, X, XCircle } from "lucide-react";
import Sidebar from "../components/Sidebar";
import PlanningHistoryButton from "../components/PlanningHistoryButton";
import { getAvailableOrgUnits } from "../services/orgUnitService";
import { getBusinessContext } from "../services/businessContextService";
import {
  approveAuditProposal,
  createAuditProposal,
  deleteAuditProposal,
  getAuditors,
  getPlanningAudits,
  rejectAuditProposal,
  updateAuditProposal
} from "../services/planningService";
import {
  AUDIT_TYPES,
  AUDIT_PROPOSAL_CREATE_ROLES,
  AUDIT_PROPOSAL_DELETE_ROLES,
  PLANNING_APPROVE_ROLES,
  QUARTERS,
  RISK_FACTORS
} from "../constants/planning";
import "./Planning.css";

const EMPTY_FORM = {
  title: "",
  area: "",
  orgUnitId: "",
  businessContextReferences: [],
  responsibleId: "",
  type: "Interna",
  likelihood: 2,
  impact: 2,
  quarter: "",
  year: new Date().getFullYear(),
  startDate: "",
  endDate: "",
  objective: "",
  scope: "",
  justification: ""
};

const formatDate = (value) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "";

function Planificacion() {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const canCreate = AUDIT_PROPOSAL_CREATE_ROLES.includes(user?.role);
  const canDelete = AUDIT_PROPOSAL_DELETE_ROLES.includes(user?.role);
  const canApprove = PLANNING_APPROVE_ROLES.includes(user?.role);

  const [items, setItems] = useState([]);
  const [auditors, setAuditors] = useState([]);
  const [orgUnits, setOrgUnits] = useState([]);
  const [businessContexts, setBusinessContexts] = useState([]);
  const [businessContextError, setBusinessContextError] = useState("");
  const [orgUnitsLoading, setOrgUnitsLoading] = useState(true);
  const [orgUnitsError, setOrgUnitsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [quarters, setQuarters] = useState({});
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionItem, setActionItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftFromAssistant, setDraftFromAssistant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadOrgUnits = () => {
    setOrgUnitsLoading(true);
    setOrgUnitsError("");
    return getAvailableOrgUnits()
      .then(setOrgUnits)
      .catch((err) => setOrgUnitsError(err.message))
      .finally(() => setOrgUnitsLoading(false));
  };
  const loadBusinessContexts = () => {
    setBusinessContextError("");
    return getBusinessContext().then(setBusinessContexts)
      .catch((err) => setBusinessContextError(err.message));
  };

  const loadItems = async () => {
    try {
      setItems(await getPlanningAudits());
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getPlanningAudits()
      .then(setItems)
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
    if (canCreate) {
      getAuditors().then(setAuditors).catch((err) => setError(err.message));
    }
    getAvailableOrgUnits()
      .then(setOrgUnits)
      .catch((err) => setOrgUnitsError(err.message))
      .finally(() => setOrgUnitsLoading(false));
    getBusinessContext().then(setBusinessContexts).catch((err) => setBusinessContextError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const pending = sessionStorage.getItem("vera:proposal-draft");
      if (!pending) return;
      sessionStorage.removeItem("vera:proposal-draft");
      try {
        const value = JSON.parse(pending);
        if (!canCreate || Number(value.userId) !== Number(user?.id) || value.expiresAt < Date.now()) return;
        const draft = value.draft;
        if (!draft || typeof draft !== "object") return;
        setForm({ ...EMPTY_FORM,
          title: String(draft.title || "").slice(0, 120), area: String(draft.area || "").slice(0, 100),
          objective: String(draft.objective || "").slice(0, 500), scope: String(draft.scope || "").slice(0, 500),
          justification: String(draft.justification || "").slice(0, 500),
          likelihood: [1, 2, 3].includes(Number(draft.likelihood)) ? Number(draft.likelihood) : 2,
          impact: [1, 2, 3].includes(Number(draft.impact)) ? Number(draft.impact) : 2 });
        setEditingId(null);
        setDraftFromAssistant(true);
        setIsModalOpen(true);
      } catch { /* Se descarta un borrador de sesión inválido. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canCreate, user?.id]);

  const openProposals = items.filter((item) => item.status === "OPEN");
  const approvedProposals = items.filter((item) => item.status === "APPROVED");
  const rejectedProposals = items.filter((item) => item.status === "REJECTED");

  const updateForm = (field, value) => setForm({ ...form, [field]: value });
  const orgUnitName = (id) => orgUnits.find((unit) => unit.id === id)?.name || "Entidad asignada";
  const manageableUnits = orgUnits.filter((unit) => unit.accessLevel === "MANAGE");
  const contextChoices = businessContexts.filter((record) =>
    form.orgUnitId && record.unitIds.includes(form.orgUnitId));
  const selectedWithoutCurrentChoice = (form.businessContextReferences || []).filter((reference) =>
    !contextChoices.some((record) => record.contextId === reference.contextId));
  const toggleBusinessContext = (record) => setForm((current) => {
    const selected = current.businessContextReferences || [];
    const already = selected.some((reference) => reference.contextId === record.contextId);
    return { ...current, businessContextReferences: already
      ? selected.filter((reference) => reference.contextId !== record.contextId)
      : [...selected, { contextId: record.contextId, revision: record.revision,
        kind: record.kind, code: record.code, name: record.name }] };
  });
  const updateBusinessContextVersion = (record) => setForm((current) => ({ ...current,
    businessContextReferences: current.businessContextReferences.map((reference) =>
      reference.contextId === record.contextId ? { contextId: record.contextId, revision: record.revision,
        kind: record.kind, code: record.code, name: record.name } : reference) }));

  const openCreate = () => {
    setEditingId(null);
    setDraftFromAssistant(false);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setDraftFromAssistant(false);
    setForm({
      title: item.title,
      area: item.area,
      orgUnitId: item.orgUnitId || "",
      businessContextReferences: item.businessContextReferences || [],
      responsibleId: item.responsibleId ?? "",
      type: item.type,
      likelihood: item.likelihood ?? 2,
      impact: item.impact ?? 2,
      quarter: item.quarter,
      year: item.year,
      startDate: item.startDate,
      endDate: item.endDate,
      objective: item.objective,
      scope: item.scope || "",
      justification: item.justification || ""
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setDraftFromAssistant(false);
  };

  const run = async (action, successMessage) => {
    try {
      await action();
      await loadItems();
      setMessage(successMessage);
      setError("");
      return true;
    } catch (actionError) {
      setError(actionError.message);
      setMessage("");
      return false;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = { ...form };
    if (editingId) delete payload.orgUnitId;
    const ok = await run(
      () => (editingId ? updateAuditProposal(editingId, payload) : createAuditProposal(payload)),
      editingId ? "La propuesta fue actualizada." : "La propuesta fue creada y quedó abierta para revisión."
    );
    setSaving(false);
    if (ok) closeModal();
  };

  const handleApprove = async (item) => {
    const selectedQuarter = quarters[item.id] || item.quarter || "";

    if (!QUARTERS.some((quarter) => quarter.value === selectedQuarter)) {
      setError(
        "Selecciona un trimestre estimado antes de marcar la propuesta como aprobada."
      );
      setMessage("");
      return;
    }

    setError("");

    const ok = await run(
      () => approveAuditProposal(item.id, selectedQuarter),
      "La propuesta alcanzó el 100% y ahora aparece en Trimestres."
    );
    if (ok) setActionItem(null);
  };

  const startReject = (item) => {
    setActionItem(item);
    setRejectingId(item.id);
    setRejectionReason("");
    setError("");
  };

  const handleReject = async (event, item) => {
    event.preventDefault();
    const ok = await run(
      () => rejectAuditProposal(item.id, rejectionReason.trim()),
      "La propuesta fue rechazada y el motivo quedó en la bitácora."
    );
    if (ok) {
      setRejectingId(null);
      setRejectionReason("");
      setActionItem(null);
    }
  };

  const handleDelete = (item) => {
    if (!window.confirm(`¿Eliminar la propuesta ${item.id}? Esta acción no se puede deshacer.`)) return;
    run(() => deleteAuditProposal(item.id), "La propuesta fue eliminada.").then((ok) => {
      if (ok) setActionItem(null);
    });
  };

  const closeActions = () => {
    setActionItem(null);
    setRejectingId(null);
    setRejectionReason("");
  };

  const openDetails = (item) => setDetailItem(item);

  return (
    <div className="dashboard-layout">
      <Sidebar active="planificacion" />
      <main className="dashboard-main">
        <section className="dashboard-content planning-page clean-header-page">
          <div className="dashboard-header">
            <div>
              <span className="eyebrow">GESTIÓN DEL PORTAFOLIO</span>
              <h1>Planificación</h1>
              <p>Propón auditorías y da seguimiento a su aprobación.</p>
            </div>
            {canCreate && (
              <button className="primary-action" type="button" onClick={openCreate}>
                <Plus size={18} aria-hidden="true" />
                Nueva propuesta
              </button>
            )}
          </div>

          {message && <p className="planning-message success">{message}</p>}
          {error && <p className="planning-message error">{error}</p>}

          <div className="planning-summary">
            <div><strong>{openProposals.length}</strong><span>Propuestas abiertas</span></div>
            <div><strong>{approvedProposals.length}</strong><span>Auditorías aprobadas</span></div>
            <div><strong>{rejectedProposals.length}</strong><span>Propuestas rechazadas</span></div>
          </div>

          <div className="planning-section-heading">
            <div>
              <span className="eyebrow">TABLERO DE PROPUESTAS</span>
              <h2>Propuestas abiertas</h2>
            </div>
            <span>{openProposals.length} pendientes</span>
          </div>

          {loading ? (
            <div className="planning-empty">Cargando propuestas...</div>
          ) : openProposals.length === 0 ? (
            <div className="planning-empty">
              <Check size={22} aria-hidden="true" />
              No hay propuestas abiertas en este momento.
            </div>
          ) : (
            <div className="planning-list">
              {openProposals.map((item) => (
                <article
                  className="planning-card"
                  key={item.id}
                  onClick={() => openDetails(item)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDetails(item);
                    }
                  }}
                  role="button"
                  tabIndex="0"
                  aria-label={`Ver detalles de ${item.id} ${item.title}`}
                >
                  <div className="planning-card-icon"><ClipboardList size={22} /></div>
                  <div className="planning-card-content">
                    <div className="proposal-heading">
                      <span className="planning-id">{item.id}</span>
                      <span className={`risk-badge risk-${item.risk.toLowerCase()}`}>{item.risk}</span>
                    </div>
                    <h2>{item.title}</h2>
                    <p className="proposal-summary">{item.objective}</p>
                    <div className="proposal-meta">
                      <span><b>Tipo:</b> {item.type}</span>
                      <span><b>Área:</b> {item.area || "Sin definir"}</span>
                      {item.orgUnitId && <span><b>Entidad:</b> {orgUnitName(item.orgUnitId)}</span>}
                      <span><b>Responsable:</b> {item.responsible || "Sin asignar"}</span>
                      <span><b>Periodo:</b> {formatDate(item.startDate) || "—"} → {formatDate(item.endDate) || "—"}</span>
                    </div>
                    <div className="approval-progress">
                      <div><span>Aprobación</span><b>{item.approval || 0}%</b></div>
                      <div className="progress-track"><span style={{ width: `${item.approval || 0}%` }} /></div>
                    </div>
                  </div>
                  <div className="planning-card-actions">
                    <button
                      type="button"
                      className="actions-trigger"
                      onClick={(event) => {
                        event.stopPropagation();
                        setActionItem(item);
                      }}
                      aria-label={`Abrir acciones de ${item.title}`}
                    >
                      <MoreHorizontal size={18} aria-hidden="true" />
                      Acciones
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {detailItem && (
            <div className="details-modal-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDetailItem(null);
            }}>
              <section className="details-modal" role="dialog" aria-modal="true" aria-labelledby="details-modal-title">
                <header className="details-modal-header">
                  <div>
                    <span className="eyebrow">DETALLE DE AUDITORÍA</span>
                    <h2 id="details-modal-title">{detailItem.id} · {detailItem.title}</h2>
                  </div>
                  <button type="button" className="actions-modal-close" onClick={() => setDetailItem(null)} aria-label="Cerrar detalles">
                    <X size={20} aria-hidden="true" />
                  </button>
                </header>

                <section className="details-section">
                  <h3>Información general</h3>
                  <div className="details-grid">
                    <div className="details-field details-field-wide"><span>Descripción</span><p>{detailItem.objective || "Sin descripción"}</p></div>
                    <div className="details-field"><span>Tipo</span><p>{detailItem.type || "Sin definir"}</p></div>
                    <div className="details-field"><span>Área</span><p>{detailItem.area || "Sin definir"}</p></div>
                    {detailItem.orgUnitId && <div className="details-field"><span>Entidad</span><p>{orgUnitName(detailItem.orgUnitId)}</p></div>}
                    <div className="details-field"><span>Responsable</span><p>{detailItem.responsible || "Sin asignar"}</p></div>
                    <div className="details-field"><span>Año</span><p>{detailItem.year || "Sin definir"}</p></div>
                    <div className="details-field"><span>Periodo</span><p>{formatDate(detailItem.startDate) || "—"} → {formatDate(detailItem.endDate) || "—"}</p></div>
                    <div className="details-field"><span>Prioridad</span><p><span className={`risk-badge risk-${detailItem.risk.toLowerCase()}`}>{detailItem.risk}</span></p></div>
                    <div className="details-field"><span>Estado actual</span><p>{detailItem.status || "Sin definir"}</p></div>
                    <div className="details-field"><span>Creada por</span><p>{detailItem.createdBy?.name || "Sin dato"}</p></div>
                  </div>
                </section>

                <section className="details-section">
                  <h3>Contexto del negocio vinculado</h3>
                  {detailItem.businessContextReferences?.length ? <ul className="planning-context-links">
                    {detailItem.businessContextReferences.map((reference) => <li key={reference.contextId}>
                      <a href={`/mapa-negocio?context=${encodeURIComponent(reference.contextId)}&revision=${reference.revision}`}>
                        {reference.code} · {reference.name} · versión {reference.revision}
                      </a>
                    </li>)}
                  </ul> : <p className="details-long-text">No se vinculó todavía un proceso, servicio u objetivo del mapa.</p>}
                </section>

                <section className="details-section">
                  <h3>Alcance de la auditoría</h3>
                  <p className="details-long-text">{detailItem.scope || "Sin alcance registrado."}</p>
                </section>

                <section className="details-section">
                  <h3>Justificación</h3>
                  <p className="details-long-text">{detailItem.justification || "Sin justificación registrada."}</p>
                </section>

                <section className="details-section">
                  <h3>Planificación y aprobación</h3>
                  <div className="approval-progress details-progress">
                    <div><span>Progreso de aprobación</span><b>{detailItem.approval || 0}%</b></div>
                    <div className="progress-track"><span style={{ width: `${detailItem.approval || 0}%` }} /></div>
                  </div>
                  <p className="details-status">Estado actual: <strong>{detailItem.status || "Sin definir"}</strong></p>
                </section>
              </section>
            </div>
          )}

          {actionItem && (
            <div className="actions-modal-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeActions();
            }}>
              <section className="actions-modal" role="dialog" aria-modal="true" aria-labelledby="actions-modal-title">
                <div className="actions-modal-header">
                  <div>
                    <span className="eyebrow">ACCIONES DE PROPUESTA</span>
                    <h2 id="actions-modal-title">{actionItem.id} · {actionItem.title}</h2>
                  </div>
                  <button type="button" className="actions-modal-close" onClick={closeActions} aria-label="Cerrar acciones">
                    <X size={20} aria-hidden="true" />
                  </button>
                </div>
                {canApprove && (
                  <div className="actions-modal-approval">
                    <label htmlFor={`quarter-${actionItem.id}`}>Trimestre estimado</label>
                    <select
                      id={`quarter-${actionItem.id}`}
                      value={quarters[actionItem.id] || actionItem.quarter || ""}
                      onChange={(event) => setQuarters({ ...quarters, [actionItem.id]: event.target.value })}
                    >
                      <option value="">Sin definir</option>
                      {QUARTERS.map((quarter) => (
                        <option key={quarter.value} value={quarter.value}>{quarter.label}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => handleApprove(actionItem)}>
                      <Check size={17} aria-hidden="true" />
                      Marcar 100% aprobada
                    </button>
                    {rejectingId === actionItem.id ? (
                      <form className="rejection-form" onSubmit={(event) => handleReject(event, actionItem)}>
                        <label htmlFor={`reason-${actionItem.id}`}>Motivo del rechazo</label>
                        <textarea
                          id={`reason-${actionItem.id}`}
                          required
                          maxLength={1000}
                          value={rejectionReason}
                          onChange={(event) => setRejectionReason(event.target.value)}
                          placeholder="Explica qué debe corregirse o por qué no procede."
                        />
                        <button type="submit" className="reject-action">Confirmar rechazo</button>
                        <button type="button" className="cancel-reject-action" onClick={() => setRejectingId(null)}>Cancelar</button>
                      </form>
                    ) : (
                      <button type="button" className="reject-action" onClick={() => startReject(actionItem)}>
                        <XCircle size={16} aria-hidden="true" />
                        Rechazar propuesta
                      </button>
                    )}
                  </div>
                )}
                <div className="actions-modal-secondary">
                  {canCreate && (
                    <>
                      {(user.role !== "JEFATURA" || actionItem.createdBy?.id === user.id) && (
                        <button type="button" onClick={() => { closeActions(); openEdit(actionItem); }}>
                          <Pencil size={16} aria-hidden="true" />
                          Editar
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" onClick={() => handleDelete(actionItem)}>
                          <Trash2 size={16} aria-hidden="true" />
                          Eliminar
                        </button>
                      )}
                    </>
                  )}
                  <PlanningHistoryButton proposal={actionItem} />
                </div>
              </section>
            </div>
          )}

          <div className="planning-section-heading rejected-section-heading">
            <div>
              <span className="eyebrow">DECISIONES REGISTRADAS</span>
              <h2>Propuestas rechazadas</h2>
            </div>
            <span>{rejectedProposals.length} rechazadas</span>
          </div>
          {rejectedProposals.length === 0 ? (
            <div className="planning-empty">Todavía no hay propuestas rechazadas.</div>
          ) : (
            <div className="planning-list">
              {rejectedProposals.map((item) => (
                <article className="planning-card rejected-card" key={item.id}>
                  <div className="planning-card-icon"><XCircle size={22} aria-hidden="true" /></div>
                  <div className="planning-card-content">
                    <div className="proposal-heading">
                      <span className="planning-id">{item.id}</span>
                      <span className="rejected-badge">Rechazada</span>
                    </div>
                    <h2>{item.title}</h2>
                    <p>{item.objective}</p>
                    <div className="proposal-meta">
                      <span><b>Área:</b> {item.area}</span>
                      <span><b>Decidió:</b> {item.rejectedBy?.name || "Sin dato"}</span>
                      {item.rejectedAt && <span><b>Fecha:</b> {formatDate(item.rejectedAt.slice(0, 10))}</span>}
                    </div>
                    <p className="rejection-reason"><b>Motivo:</b> {item.rejectionReason}</p>
                  </div>
                  <div className="planning-card-actions"><PlanningHistoryButton proposal={item} /></div>
                </article>
              ))}
            </div>
          )}

          {isModalOpen && (
            <div className="modal-backdrop">
              <form className="proposal-modal" onSubmit={handleSubmit}>
                <div className="modal-header">
                  <div>
                    <span className="eyebrow">{editingId ? `EDITAR ${editingId}` : "NUEVA AUDITORÍA"}</span>
                    <h2>{editingId ? "Editar propuesta" : "Abrir una propuesta"}</h2>
                    <p>Captura el contexto para que el comité pueda revisarla.</p>
                  </div>
                  <button type="button" className="modal-close" onClick={closeModal} aria-label="Cerrar">
                    <X size={20} />
                  </button>
                </div>
                {draftFromAssistant && <p className="planning-message">Borrador preparado por el asistente. Revisa todos los campos y completa el periodo antes de guardar; todavía no se ha creado ninguna propuesta.</p>}
                {error && <p className="planning-message error">{error}</p>}
                <div className="proposal-form-grid">
                  <label className="full-width">Título de la propuesta
                    <input required value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="Revisión de controles de acceso" />
                  </label>
                  <label>Unidad o área
                    <input required value={form.area} onChange={(event) => updateForm("area", event.target.value)} placeholder="Operaciones" />
                  </label>
                  <label>Ámbito empresarial
                    {editingId ? (
                      <input readOnly value={form.orgUnitId ? orgUnitName(form.orgUnitId) : "Sin asignar"} />
                    ) : (
                      <select value={form.orgUnitId} onChange={(event) => setForm((current) => ({ ...current,
                        orgUnitId: event.target.value, businessContextReferences: [] }))}
                        disabled={orgUnitsLoading || Boolean(orgUnitsError)}>
                        <option value="">Sin asignar todavía</option>
                        {manageableUnits.map((unit) => (
                          <option key={unit.id} value={unit.id}>{unit.name} · {unit.code}</option>
                        ))}
                      </select>
                    )}
                    {orgUnitsError && <small role="status">No se pudieron consultar las entidades. <button type="button" onClick={loadOrgUnits}>Reintentar</button></small>}
                    {!editingId && !orgUnitsError && <small>Solo aparecen entidades donde puedes gestionar registros. El área no asigna automáticamente una entidad.</small>}
                  </label>
                  <fieldset className="full-width planning-context-fieldset">
                    <legend>Procesos, servicios y objetivos vinculados (opcional)</legend>
                    <p>Selecciona conceptos del mismo ámbito. La propuesta conserva la versión elegida; esto no cambia su prioridad ni aprobación.</p>
                    {businessContextError && <p role="status">Mapa no disponible: {businessContextError} <button type="button" onClick={loadBusinessContexts}>Reintentar</button></p>}
                    {!form.orgUnitId && <p>Selecciona primero un ámbito empresarial.</p>}
                    {form.orgUnitId && !businessContextError && contextChoices.length === 0 && selectedWithoutCurrentChoice.length === 0 &&
                      <p>No hay conceptos del mapa en este ámbito.</p>}
                    {contextChoices.map((record) => {
                      const selected = form.businessContextReferences.find((reference) => reference.contextId === record.contextId);
                      return <div key={record.contextId} className="planning-context-choice">
                        <label><input type="checkbox" checked={Boolean(selected)}
                          disabled={!selected && form.businessContextReferences.length >= 12}
                          onChange={() => toggleBusinessContext(record)} />
                          {record.code} · {record.name} · versión {selected?.revision || record.revision}</label>
                        {selected && selected.revision !== record.revision && <button type="button"
                          onClick={() => updateBusinessContextVersion(record)}>Usar versión actual {record.revision}</button>}
                      </div>;
                    })}
                    {selectedWithoutCurrentChoice.map((reference) => <label key={reference.contextId} className="planning-context-choice">
                      <input type="checkbox" checked onChange={() => toggleBusinessContext(reference)} />
                      {reference.code} · {reference.name} · versión histórica {reference.revision}
                    </label>)}
                  </fieldset>
                  <label>Responsable
                    <select value={form.responsibleId} onChange={(event) => updateForm("responsibleId", event.target.value)}>
                      <option value="">Sin asignar</option>
                      {auditors.map((auditor) => (
                        <option key={auditor.id} value={auditor.id}>{auditor.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>Tipo de auditoría
                    <select value={form.type} onChange={(event) => updateForm("type", event.target.value)}>
                      {AUDIT_TYPES.map((type) => <option key={type}>{type}</option>)}
                    </select>
                  </label>
                  <label>Probabilidad del riesgo
                    <select value={form.likelihood} onChange={(event) => updateForm("likelihood", Number(event.target.value))}>
                      {RISK_FACTORS.map((factor) => <option key={factor.value} value={factor.value}>{factor.label}</option>)}
                    </select>
                  </label>
                  <label>Impacto del riesgo
                    <select value={form.impact} onChange={(event) => updateForm("impact", Number(event.target.value))}>
                      {RISK_FACTORS.map((factor) => <option key={factor.value} value={factor.value}>{factor.label}</option>)}
                    </select>
                  </label>
                  <label>Trimestre estimado
                    <select value={form.quarter} onChange={(event) => updateForm("quarter", event.target.value)}>
                      <option value="">Sin definir</option>
                      {QUARTERS.map((quarter) => <option key={quarter.value} value={quarter.value}>{quarter.label}</option>)}
                    </select>
                  </label>
                  <label>Año
                    <input type="number" min="2020" max="2100" required value={form.year} onChange={(event) => updateForm("year", event.target.value)} />
                  </label>
                  <label>Fecha de inicio
                    <input type="date" required={!form.quarter || Boolean(form.endDate)} value={form.startDate} onChange={(event) => updateForm("startDate", event.target.value)} />
                  </label>
                  <label>Fecha de fin
                    <input type="date" min={form.startDate || undefined} required={!form.quarter || Boolean(form.startDate)} value={form.endDate} onChange={(event) => updateForm("endDate", event.target.value)} />
                  </label>
                  <label className="full-width">Objetivo
                    <textarea required value={form.objective} onChange={(event) => updateForm("objective", event.target.value)} placeholder="¿Qué decisión o riesgo busca aclarar esta auditoría?" />
                  </label>
                  <label className="full-width">Alcance
                    <textarea required maxLength={2000} value={form.scope} onChange={(event) => updateForm("scope", event.target.value)} placeholder="¿Qué procesos, áreas y periodos se revisarán?" />
                  </label>
                  <label className="full-width">Justificación
                    <textarea required maxLength={2000} value={form.justification} onChange={(event) => updateForm("justification", event.target.value)} placeholder="¿Por qué es necesaria esta auditoría?" />
                  </label>
                </div>
                <div className="modal-actions">
                  <button type="button" className="secondary-action" onClick={closeModal}>Cancelar</button>
                  <button type="submit" className="primary-action" disabled={saving || (!editingId && (orgUnitsLoading || Boolean(orgUnitsError)))}>
                    {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Abrir propuesta"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default Planificacion;
