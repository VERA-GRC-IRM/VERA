const planningRepository = require("../repositories/planningRepository");
const userRepository = require("../repositories/userRepository");
const { logActivity } = require("./auditLogger");
const { ROLES, AUDIT_PROPOSAL_CREATE_ROLES } = require("../config/roles");
const { USER_STATUS } = require("../config/accountRules");
const { classifyRisk } = require("../config/riskRules");
const { assertWritableRecordScope } = require("./recordScopeVisibility");
const { scopeForNewRecord } = require("./recordCreationScopeService");

const TYPES = ["Interna", "Externa"];
const RISKS = ["Bajo", "Medio", "Alto"];
const LEVELS = [1, 2, 3];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const DUPLICATE_MESSAGE = "Ya existe una propuesta con el mismo título, área y año.";
const text = (value) => String(value ?? "").trim();
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };

const activeAuditors = async () => (await userRepository.getAll())
  .filter((user) => user.role === ROLES.AUDITOR && user.status === USER_STATUS.ACTIVE)
  .map(({ id, name, username }) => ({ id, name, username }));

const parseProposal = async (body) => {
  const title = text(body.title);
  const objective = text(body.objective);
  const scope = text(body.scope);
  const justification = text(body.justification);
  const area = text(body.area);
  const type = text(body.type) || "Interna";
  const requestedRisk = text(body.risk) || "Medio";
  const fallbackFactor = requestedRisk === "Bajo" ? 1 : requestedRisk === "Alto" ? 3 : 2;
  const likelihood = body.likelihood === undefined ? fallbackFactor : Number(body.likelihood);
  const impact = body.impact === undefined ? fallbackFactor : Number(body.impact);
  const quarter = text(body.quarter);
  const year = Number(body.year) || new Date().getFullYear();
  const startDate = text(body.startDate);
  const endDate = text(body.endDate);

  if (!title || !objective || !scope || !justification || !area) {
    return { error: "Completa el título, el área, el objetivo, el alcance y la justificación de la propuesta." };
  }
  if (scope.length > 2000 || justification.length > 2000) {
    return { error: "El alcance y la justificación no pueden superar 2000 caracteres." };
  }
  if (!TYPES.includes(type)) return { error: "El tipo de auditoría no es válido." };
  if (!RISKS.includes(requestedRisk)) return { error: "El nivel de riesgo no es válido." };
  if (!LEVELS.includes(likelihood) || !LEVELS.includes(impact)) {
    return { error: "La probabilidad y el impacto deben ser niveles del 1 al 3." };
  }
  if (quarter && !QUARTERS.includes(quarter)) return { error: "El trimestre no es válido." };
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return { error: "El año no es válido." };
  if ((startDate && !isDate(startDate)) || (endDate && !isDate(endDate))) {
    return { error: "Las fechas no tienen un formato válido." };
  }
  if (startDate && endDate && endDate < startDate) {
    return { error: "La fecha de fin no puede ser anterior a la de inicio." };
  }
  if (Boolean(startDate) !== Boolean(endDate)) return { error: "Indica ambas fechas del periodo estimado." };
  if (!quarter && !startDate) return { error: "Indica un trimestre o ambas fechas del periodo estimado." };

  let responsibleId = null;
  let responsible = "Sin asignar";
  const rawResponsible = body.responsibleId;
  if (rawResponsible !== undefined && rawResponsible !== null && rawResponsible !== "") {
    const auditor = (await activeAuditors()).find((item) => item.id === Number(rawResponsible));
    if (!auditor) return { error: "El responsable debe ser un auditor activo." };
    responsibleId = auditor.id;
    responsible = auditor.name;
  }

  return { data: { title, objective, scope, justification, area, type,
    likelihood, impact, riskScore: likelihood * impact,
    risk: classifyRisk(likelihood * impact), quarter, year,
    startDate, endDate, responsibleId, responsible } };
};

const createProposalForUser = async (user, input, operationId = null) => {
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== USER_STATUS.ACTIVE || currentUser.role !== user.role) {
    throw errorFor("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  if (!AUDIT_PROPOSAL_CREATE_ROLES.includes(user.role)) throw errorFor("Tu rol no puede crear propuestas.", 403);
  if (operationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
    throw errorFor("La operación no es válida.", 400);
  }
  if (operationId) {
    const existing = (await planningRepository.getAll()).find((item) => item.aiOperationId === operationId);
    if (existing) {
      if (existing.createdBy?.id !== user.id) throw errorFor("La propuesta no está disponible para tu cuenta.", 404);
      await assertWritableRecordScope(user, existing);
      return existing;
    }
  }
  const { data, error } = await parseProposal(input);
  if (error) throw errorFor(error, 400);
  const orgUnitId = await scopeForNewRecord(user, input.orgUnitId);
  const scopedData = { ...data, orgUnitId };
  if (await planningRepository.findDuplicate(scopedData)) throw errorFor(DUPLICATE_MESSAGE, 409);
  const proposal = await planningRepository.create({ ...scopedData,
    ...(operationId ? { aiOperationId: operationId } : {}),
    createdBy: { id: user.id, name: user.username } });
  await logActivity({ actor: user, action: "AUDIT_PROPOSAL_CREATED",
    details: { proposalId: proposal.id, title: proposal.title } });
  return proposal;
};

const prepareProposalEdit = async (user, id, changes, expectedVersion, expectedValues = null) => {
  const currentUser = await userRepository.findById(user.id);
  if (currentUser?.status !== USER_STATUS.ACTIVE || currentUser.role !== user.role) {
    throw errorFor("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  if (!AUDIT_PROPOSAL_CREATE_ROLES.includes(user.role)) throw errorFor("Tu rol no puede editar propuestas.", 403);
  const current = await planningRepository.findById(id);
  if (!current) throw errorFor("Propuesta no encontrada.", 404);
  await assertWritableRecordScope(user, current);
  if (user.role === ROLES.JEFATURA && current.createdBy?.id !== user.id) {
    throw errorFor("Solo puedes editar las propuestas que creaste.", 403);
  }
  if (["APPROVED", "ACTIVE", "CLOSED", "REJECTED"].includes(current.status)) {
    throw errorFor("Una propuesta resuelta ya no se puede editar.", 409);
  }
  if (expectedVersion !== undefined && current.storageVersion !== expectedVersion) {
    throw errorFor("La propuesta cambió desde la vista previa. Consulta el expediente y vuelve a intentarlo.", 409);
  }
  if (expectedValues && Object.entries(expectedValues).some(([field, value]) =>
    String(current[field] ?? "") !== String(value ?? ""))) {
    throw errorFor("La propuesta cambió desde la vista previa. Consulta el expediente y vuelve a intentarlo.", 409);
  }
  const { data, error } = await parseProposal({ ...current, ...changes });
  if (error) throw errorFor(error, 400);
  if (await planningRepository.findDuplicate({ ...data, orgUnitId: current.orgUnitId }, current.id)) {
    throw errorFor(DUPLICATE_MESSAGE, 409);
  }
  if (!Object.keys(changes).some((key) => String(current[key] ?? "") !== String(data[key] ?? ""))) {
    throw errorFor("No hay cambios que guardar.", 400);
  }
  return { current, data };
};

const updateProposalForUser = async (user, id, changes, expectedVersion, reason = null, expectedValues = null) => {
  const { current, data } = await prepareProposalEdit(user, id, changes, expectedVersion, expectedValues);
  await assertWritableRecordScope(user, current);
  const proposal = await planningRepository.update(current.id, data, current.storageVersion);
  await logActivity({ actor: user, action: "AUDIT_PROPOSAL_UPDATED",
    details: { proposalId: proposal.id, title: proposal.title, ...(reason ? { reason } : {}) } });
  return proposal;
};

module.exports = { parseProposal, activeAuditors, createProposalForUser,
  prepareProposalEdit, updateProposalForUser, DUPLICATE_MESSAGE };
