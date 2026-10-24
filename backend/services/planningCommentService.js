const planningRepository = require("../repositories/planningRepository");
const commentRepository = require("../repositories/commentRepository");
const userRepository = require("../repositories/userRepository");
const { logActivity } = require("./auditLogger");
const { RECORD_CREATE_ROLES, ROLES } = require("../config/roles");
const { canViewRecordScope, assertWritableRecordScope } = require("./recordScopeVisibility");
const { assertNewRelationUnscoped } = require("./recordWriteScopeService");

const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };
const canView = (proposal, user) => user.role !== ROLES.AUDITOR || proposal.responsibleId === user.id;
const findVisibleProposal = async (user, id) => {
  const proposal = await planningRepository.findById(id);
  if (!proposal || !canView(proposal, user) || !await canViewRecordScope(user, proposal)) {
    throw errorFor("Propuesta de auditoría no encontrada.", 404);
  }
  return proposal;
};
const parseComment = async (user, proposalId, body) => {
  const proposal = await findVisibleProposal(user, proposalId);
  const text = String(body?.text ?? "").trim();
  if (text.length < 3 || text.length > 2000) {
    throw errorFor("El comentario debe tener entre 3 y 2,000 caracteres.", 400);
  }
  return { proposal, text };
};

const createCommentForUser = async (user, proposalId, body, operationId = null) => {
  const current = await userRepository.findById(user.id);
  if (current?.status !== "ACTIVE" || current.role !== user.role) {
    throw errorFor("Cambió tu acceso. Inicia sesión de nuevo.", 409);
  }
  if (!RECORD_CREATE_ROLES.includes(user.role)) throw errorFor("Tu rol no puede registrar comentarios.", 403);
  if (operationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
    throw errorFor("La operación no es válida.", 400);
  }
  const { proposal, text } = await parseComment(user, proposalId, body);
  await assertWritableRecordScope(user, proposal);
  assertNewRelationUnscoped(proposal);
  if (operationId) {
    const existing = (await commentRepository.listByProposal(proposal.id))
      .find((item) => item.aiOperationId === operationId);
    if (existing) return existing;
  }
  const comment = await commentRepository.create({ proposalId: proposal.id, text,
    ...(operationId ? { aiOperationId: operationId } : {}),
    author: { id: user.id, username: user.username, role: user.role } });
  await logActivity({ actor: user, action: "AUDIT_COMMENT_ADDED",
    details: { proposalId: proposal.id, title: proposal.title, commentId: comment.id } });
  return comment;
};

module.exports = { canView, findVisibleProposal, parseComment, createCommentForUser };
