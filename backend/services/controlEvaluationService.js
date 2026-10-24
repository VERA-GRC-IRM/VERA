const controlRepository = require("../repositories/controlRepository");
const { RISK_CONTROL_MANAGE_ROLES } = require("../config/roles");
const { logActivity } = require("./auditLogger");
const { assertWritableControlScope } = require("./recordWriteScopeService");

const resultFor = (rating) => Number(rating) >= 4 ? "EFFECTIVE" : "INEFFECTIVE";
const withResult = (control) => ({ ...control,
  effectivenessResult: resultFor(control.effectiveness),
  evaluations: control.evaluations.map((item) => ({ ...item, result: resultFor(item.rating) })) });
const parseEvaluation = (body) => {
  const rating = Number(body.rating);
  const note = String(body.note ?? "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "La efectividad debe ser un valor entero del 1 al 5." };
  }
  if (note.length < 10 || note.length > 500) {
    return { error: "La justificación debe tener entre 10 y 500 caracteres." };
  }
  return { data: { rating, note } };
};
const errorFor = (message, status) => { const error = new Error(message); error.status = status; return error; };
const evaluateControlForUser = async (user, id, body, expectedVersion) => {
  if (!RISK_CONTROL_MANAGE_ROLES.includes(user.role)) throw errorFor("Tu rol no puede evaluar controles.", 403);
  if (typeof id !== "string" || !id.trim() || id.length > 80) throw errorFor("Selecciona un control válido.", 400);
  const current = await controlRepository.findById(id);
  if (!current) throw errorFor("Control no encontrado.", 404);
  await assertWritableControlScope(user, current);
  const evaluation = parseEvaluation(body);
  if (evaluation.error) throw errorFor(evaluation.error, 400);
  if (expectedVersion !== undefined && current.storageVersion !== expectedVersion) {
    throw errorFor("El control cambió desde la vista previa. Revísalo de nuevo.", 409);
  }
  await assertWritableControlScope(user, current);
  const control = await controlRepository.evaluate(current.id, {
    ...evaluation.data, assessedBy: { id: user.id, username: user.username, role: user.role }
  }, current.storageVersion);
  await logActivity({ actor: user, action: "CONTROL_EVALUATED", details: {
    controlId: control.id, title: control.title, rating: control.effectiveness,
    result: resultFor(control.effectiveness), version: control.evaluations.length } });
  return withResult(control);
};

module.exports = { resultFor, withResult, parseEvaluation, evaluateControlForUser };
