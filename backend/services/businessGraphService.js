const { availableScopesFor } = require("./scopeAccessService");
const { listForUser } = require("./businessContextService");
const { projectVisibleRiskRelations, filterByVisibleScope } = require("./recordScopeVisibility");
const orgRepository = require("../repositories/orgUnitRepository");
const riskRepository = require("../repositories/riskRepository");
const controlRepository = require("../repositories/controlRepository");
const planningRepository = require("../repositories/planningRepository");

// The graph is a projection of saved, explicitly declared relationships. It never
// infers ownership, impact or permission from a matching name or free-text area.
const graphForUser = async (user) => {
  const [scopes, contexts, allUnits, allRisks, allControls, allAudits] = await Promise.all([
    availableScopesFor(user), listForUser(user), orgRepository.getAll(), riskRepository.getAll(),
    controlRepository.getAll(), planningRepository.getAll()
  ]);
  const scopeIds = new Set(scopes.map(({ id }) => id));
  const units = allUnits.filter(({ id }) => scopeIds.has(id));
  const scopedAudits = await filterByVisibleScope(user, allAudits);
  const audits = user.role === "AUDITOR"
    ? scopedAudits.filter(({ responsibleId }) => responsibleId === user.id) : scopedAudits;
  const { risks, controls } = await projectVisibleRiskRelations(user, allRisks, allControls, [], audits);
  const nodes = [];
  const edges = [];
  const addNode = (id, kind, label, detail, href) => nodes.push({ id, kind, label, detail, href });
  const addEdge = (source, target, kind, label, revision = null) =>
    edges.push({ id: `${kind}:${source}:${target}`, source, target, kind, label, revision });

  for (const unit of units) {
    addNode(`unit:${unit.id}`, "UNIT", unit.name, unit.code, null);
    if (unit.parentId && scopeIds.has(unit.parentId)) {
      addEdge(`unit:${unit.parentId}`, `unit:${unit.id}`, "CONTAINS", "Contiene");
    }
  }
  const contextIds = new Set(contexts.map(({ contextId }) => contextId));
  for (const context of contexts) {
    const id = `context:${context.contextId}`;
    addNode(id, context.kind, context.name, `${context.code} · v${context.revision}`,
      `/mapa-negocio?context=${encodeURIComponent(context.contextId)}&revision=${context.revision}`);
    for (const unitId of context.unitIds) {
      if (scopeIds.has(unitId)) addEdge(`unit:${unitId}`, id, "APPLIES_TO", "Aplica a");
    }
    for (const relation of context.relationships || []) {
      if (contextIds.has(relation.targetContextId)) {
        addEdge(id, `context:${relation.targetContextId}`, relation.relationType,
          relation.relationType === "DELIVERS_SERVICE" ? "Entrega servicio" : "Apoya objetivo",
          relation.targetRevision);
      }
    }
  }
  const visibleRiskIds = new Set(risks.map(({ id }) => id));
  const visibleAuditIds = new Set(audits.map(({ id }) => id));
  for (const risk of risks) {
    const id = `risk:${risk.id}`;
    addNode(id, "RISK", risk.title, `${risk.id} · ${risk.level || "Sin nivel"}`, `/riesgos?risk=${encodeURIComponent(risk.id)}`);
    if (risk.orgUnitId && scopeIds.has(risk.orgUnitId)) {
      addEdge(`unit:${risk.orgUnitId}`, id, "HAS_RISK", "Riesgo registrado");
    }
    for (const reference of risk.businessContextReferences || []) {
      if (contextIds.has(reference.contextId)) {
        addEdge(`context:${reference.contextId}`, id, "CONTEXT_RISK", "Riesgo vinculado", reference.revision);
      }
    }
    const auditIds = new Set([risk.linkedAuditId, ...(risk.auditLinks || []).map(({ auditId }) => auditId)].filter(Boolean));
    for (const auditId of auditIds) {
      if (visibleAuditIds.has(auditId)) addEdge(id, `audit:${auditId}`, "RISK_AUDIT", "Auditoría relacionada");
    }
  }
  for (const control of controls) {
    const id = `control:${control.id}`;
    addNode(id, "CONTROL", control.title, control.id, `/controles#control-${encodeURIComponent(control.id)}`);
    for (const riskId of control.riskIds || []) {
      if (visibleRiskIds.has(riskId)) addEdge(id, `risk:${riskId}`, "TREATS_RISK", "Control vinculado");
    }
  }
  for (const audit of audits) {
    const id = `audit:${audit.id}`;
    addNode(id, "AUDIT", audit.title, `${audit.id} · ${audit.status}`,
      audit.status === "ACTIVE" ? `/auditorias-activas/${encodeURIComponent(audit.id)}` : "/planificacion");
    if (audit.orgUnitId && scopeIds.has(audit.orgUnitId)) {
      addEdge(`unit:${audit.orgUnitId}`, id, "HAS_AUDIT", "Auditoría registrada");
    }
    for (const reference of audit.businessContextReferences || []) {
      if (contextIds.has(reference.contextId)) {
        addEdge(`context:${reference.contextId}`, id, "CONTEXT_AUDIT", "Auditoría vinculada", reference.revision);
      }
    }
  }
  return { nodes, edges, generatedAt: new Date().toISOString() };
};

module.exports = { graphForUser };
