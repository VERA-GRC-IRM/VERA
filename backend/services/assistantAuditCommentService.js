const { randomUUID } = require("node:crypto");
const userRepository = require("../repositories/userRepository");
const commentRepository = require("../repositories/commentRepository");
const { RECORD_CREATE_ROLES } = require("../config/roles");
const { findVisibleProposal, parseComment } = require("./planningCommentService");
const { assertWritableRecordScope } = require("./recordScopeVisibility");

const response = (answer, mode = "action-guidance", extra = {}) => ({ answer, mode,
  citations: [], references: [], coverage: { partial: false }, asOf: new Date().toISOString(),
  usage: null, ...extra });
const intent = (question) => /^(?:comenta|comentar)\s+(?:(?:en\s+)?la\s+)?(?:auditor[ií]a|propuesta)(?:\s|$)/i.test(question);
const confirm = (question) => /^(confirmar comentario|confirmo el comentario)$/i.test(question.trim());
const isAuditCommentCommand = (question) => intent(question) || confirm(question);
const parseCommand = (question) => {
  const match = question.trim().match(/^(?:comenta|comentar)\s+(?:(?:en\s+)?la\s+)?(?:auditor[ií]a|propuesta)\s+(AUD-[0-9a-f-]{2,80})\s*:\s*([\s\S]+)$/i);
  return match ? { proposalId: match[1], text: match[2].trim() } : null;
};

const handleAuditComment = async (user, question, thread) => {
  if (!isAuditCommentCommand(question)) return null;
  const current = await userRepository.findById(user.id);
  if (current?.status !== "ACTIVE" || current.role !== user.role) {
    const error = new Error("Cambió tu acceso. Inicia sesión de nuevo."); error.status = 409; throw error;
  }
  if (!RECORD_CREATE_ROLES.includes(user.role)) {
    return response("Tu rol puede consultar la bitácora, pero no agregar comentarios.");
  }
  if (confirm(question)) {
    const reservation = thread.messages.at(-1)?.actionReservation;
    if (reservation?.type === "AUDIT_COMMENT") {
      const proposal = await findVisibleProposal(user, reservation.proposalId);
      await assertWritableRecordScope(user, proposal);
      const existing = (await commentRepository.listByProposal(reservation.proposalId))
        .find((item) => item.aiOperationId === reservation.operationId &&
          item.author?.id === user.id && item.text === reservation.text);
      return existing
        ? response(`El comentario ya quedó registrado con identificador ${existing.id}.`,
          "action-executed", { actionOutcome: { id: existing.id } })
        : Date.now() - Date.parse(reservation.createdAt) < 120_000
          ? response("La confirmación sigue en curso. Espera unos segundos y consulta de nuevo.", "action-pending")
          : response("No hay constancia del comentario. Pide una vista previa nueva antes de intentarlo otra vez.");
    }
    const draft = thread.messages.at(-1)?.actionDraft;
    if (!draft || draft.type !== "AUDIT_COMMENT") {
      return response("No hay un comentario pendiente. Escribe el expediente y el texto antes de confirmar.");
    }
    if (Date.parse(draft.expiresAt) < Date.now()) return response("La vista previa venció. Prepara el comentario de nuevo.");
    return response("Reservando el comentario.", "action-reservation", { auditComment: draft });
  }
  const command = parseCommand(question);
  if (!command) return response("Usa un identificador exacto y el texto tras dos puntos. Ejemplo: Comenta la auditoría AUD-01: La revisión quedó documentada en el expediente.");
  let parsed;
  try { parsed = await parseComment(user, command.proposalId, command); }
  catch (error) { if (error.status) return response(error.message); throw error; }
  const draft = { type: "AUDIT_COMMENT", proposalId: parsed.proposal.id,
    text: parsed.text, operationId: randomUUID(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  return response(`Revisa antes de comentar «${parsed.proposal.title}» (${parsed.proposal.id}):\n${parsed.text}\nEscribe «Confirmar comentario» en los próximos cinco minutos; otra pregunta descarta esta vista previa.`,
    "action-preview", { actionDraft: draft });
};

module.exports = { isAuditCommentCommand, parseCommand, handleAuditComment };
