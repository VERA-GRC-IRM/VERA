const userRepository = require("../repositories/userRepository");
const { prepareFindingClosure, closeFindingForUser } = require("./findingClosureService");
const { visibleCollectionsForUser } = require("./recordReadAccessService");

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const response = (answer, mode = "action-guidance", extra = {}) => ({ answer, mode,
  citations: [], references: [], coverage: { partial: false }, asOf: new Date().toISOString(),
  usage: null, ...extra });
const intent = (question) => /^(?:cierra|cerrar)\s+(?:el\s+)?hallazgo\b/i.test(question);
const confirm = (question) => /^(confirmar cierre de hallazgo|confirmo el cierre del hallazgo)$/i.test(question.trim());
const isFindingCloseCommand = (question) => intent(question) || confirm(question);
const parseFindingCloseCommand = (question) => {
  const match = question.match(/^(?:cierra|cerrar)\s+(?:el\s+)?hallazgo\s+(?:[«“"](.+?)[»”"]|(FDG-[a-z0-9-]+))\s+porque\s+(.+)$/i);
  return match ? { target: (match[1] || match[2]).trim(), note: match[3].trim() } : null;
};

const handleFindingClose = async (user, question, thread) => {
  if (!isFindingCloseCommand(question)) return null;
  const current = await userRepository.findById(user.id);
  if (current?.status !== "ACTIVE" || current.role !== user.role) {
    const error = new Error("Cambió tu acceso. Inicia sesión de nuevo."); error.status = 409; throw error;
  }
  if (confirm(question)) {
    const draft = thread.messages.at(-1)?.actionDraft;
    if (!draft || draft.type !== "FINDING_CLOSE") {
      return response("No hay un cierre de hallazgo pendiente. Pide una vista previa nueva antes de confirmar.");
    }
    if (Date.parse(draft.expiresAt) < Date.now()) return response("La vista previa venció. Solicita el cierre de nuevo.");
    try {
      const closed = await closeFindingForUser(user, draft.id, draft.note, draft.version);
      return response(`Quedó cerrado el hallazgo «${closed.title}» (${closed.id}). El motivo y las acciones terminadas quedaron en la bitácora.`,
        "action-executed", { actionOutcome: { id: closed.id, status: closed.status } });
    } catch (error) {
      if (error.status) return response(`${error.message} Solicita otra vista previa si corresponde.`);
      throw error;
    }
  }
  const command = parseFindingCloseCommand(question);
  if (!command || command.target.length > 120 || command.note.length < 10 || command.note.length > 1000) {
    return response("Indica hallazgo exacto y motivo de 10 a 1,000 caracteres. Ejemplo: Cierra el hallazgo FDG-001 porque todas las acciones vinculadas terminaron.");
  }
  const matches = (await visibleCollectionsForUser(user)).FINDING.filter((item) =>
    [item.id, item.title].some((value) => normalize(value) === normalize(command.target)));
  if (matches.length !== 1) {
    return response(matches.length > 1
      ? `Hay varios hallazgos con ese título. Usa uno de sus identificadores: ${matches.slice(0, 5).map((item) => item.id).join(", ")}.`
      : "No encontré ese hallazgo. Comprueba el título o identificador exacto.");
  }
  const finding = matches[0];
  let prepared;
  try { prepared = await prepareFindingClosure(user, finding.id, command.note, finding.storageVersion); }
  catch (error) { if (error.status) return response(error.message); throw error; }
  const draft = { type: "FINDING_CLOSE", id: finding.id, version: finding.storageVersion,
    note: prepared.note, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  return response(`Revisa antes de cerrar «${finding.title}» (${finding.id}), asociado al riesgo ${finding.riskId} y al control ${finding.controlId}. Las ${prepared.actions.length} acciones vinculadas están terminadas. Motivo: ${prepared.note}. Escribe «Confirmar cierre de hallazgo» en los próximos cinco minutos; cualquier otra pregunta descarta esta vista previa.`,
    "action-preview", { actionDraft: draft });
};

module.exports = { isFindingCloseCommand, parseFindingCloseCommand, handleFindingClose };
