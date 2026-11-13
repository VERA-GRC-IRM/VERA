const planningRepository = require("../repositories/planningRepository");
const userRepository = require("../repositories/userRepository");
const { PLANNING_APPROVE_ROLES, ROLES } = require("../config/roles");
const { assertWritableRecordScope } = require("./recordScopeVisibility");

const WORKFLOW_STEPS = [
  "annual",
  "quarterly",
  "start",
  "kickoff",
  "understanding",
  "execution",
  "supervision",
  "closure",
  "report"
];

const progressForStep = (step) => Math.round(
  (WORKFLOW_STEPS.indexOf(step) / (WORKFLOW_STEPS.length - 1)) * 100
);

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

const saveAuditWorkflowStep = async (user, id, step) => {
  if (!WORKFLOW_STEPS.includes(step)) throw fail("El paso del flujo no es válido.");

  const currentUser = await userRepository.findById(user.id);
  if (!currentUser || currentUser.status !== "ACTIVE" || currentUser.role !== user.role) {
    throw fail("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }

  const audit = await planningRepository.findById(id);
  if (!audit) throw fail("Auditoría no encontrada.", 404);
  await assertWritableRecordScope(user, audit);

  const canManage = PLANNING_APPROVE_ROLES.includes(user.role);
  const isResponsibleAuditor = user.role === ROLES.AUDITOR && audit.responsibleId === user.id;
  if (!canManage && !isResponsibleAuditor) {
    throw fail("Solo el responsable o un rol de gestión puede avanzar esta auditoría.", 403);
  }
  if (!["ACTIVE", "CLOSED"].includes(audit.status)) {
    throw fail("Solo una auditoría iniciada puede avanzar en este flujo.", 409);
  }

  const progress = progressForStep(step);
  if (audit.workflowStep === step && audit.progress === progress) return audit;
  const currentStepIndex = WORKFLOW_STEPS.indexOf(audit.workflowStep);
  const requestedStepIndex = WORKFLOW_STEPS.indexOf(step);

  if (requestedStepIndex !== currentStepIndex + 1) {
    throw fail("Avanza el flujo paso a paso, sin omitir etapas.", 409);
  }
  const updated = await planningRepository.update(id, {
    workflowStep: step,
    progress
  }, audit.storageVersion);
  if (!updated) throw fail("La auditoría dejó de estar disponible.", 409);
  return updated;
};

module.exports = { WORKFLOW_STEPS, saveAuditWorkflowStep };
