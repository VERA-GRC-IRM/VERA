const errorFor = (message) => Object.assign(new Error(message), { status: 400 });
const STAGES = Object.freeze(["INHERENT", "RESIDUAL", "TARGET"]);
const stringField = (value, label, min, max) => {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw errorFor(`${label}: usa entre ${min} y ${max} caracteres.`);
  }
  return value.trim();
};
const axis = (value, label) => {
  if (!Array.isArray(value) || value.length < 2 || value.length > 7) {
    throw errorFor(`${label}: define entre 2 y 7 categorías ordenadas.`);
  }
  const names = value.map((item) => stringField(item, label, 2, 80));
  if (new Set(names.map((item) => item.toLocaleLowerCase())).size !== names.length) {
    throw errorFor(`${label}: no repitas categorías.`);
  }
  return names;
};
const validateMethod = (definition) => {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw errorFor("Envía una definición de método válida.");
  }
  const name = stringField(definition.name, "Nombre del método", 4, 120);
  const version = stringField(definition.version, "Versión", 1, 32);
  const likelihood = axis(definition.likelihood, "Probabilidad");
  const impact = axis(definition.impact, "Impacto");
  const levels = axis(definition.levels, "Niveles");
  const rankOf = new Map(levels.map((level, index) => [level, index]));
  const matrix = definition.matrix;
  if (!Array.isArray(matrix) || matrix.length !== likelihood.length ||
      matrix.some((row) => !Array.isArray(row) || row.length !== impact.length)) {
    throw errorFor("La matriz debe cubrir cada combinación de probabilidad e impacto.");
  }
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix[row].length; column += 1) {
      const level = matrix[row][column];
      if (typeof level !== "string" || !rankOf.has(level)) {
        throw errorFor("Cada celda debe usar un nivel definido.");
      }
      if ((row > 0 && rankOf.get(level) < rankOf.get(matrix[row - 1][column])) ||
          (column > 0 && rankOf.get(level) < rankOf.get(matrix[row][column - 1]))) {
        throw errorFor("La severidad no puede bajar cuando aumenta la probabilidad o el impacto.");
      }
    }
  }
  return { name, version, likelihood, impact, levels, matrix };
};
const previewQualitativeMethod = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw errorFor("Envía una vista previa válida.");
  const method = validateMethod(body.method);
  if (!STAGES.includes(body.stage)) throw errorFor("Selecciona riesgo inherente, residual u objetivo.");
  const likelihoodIndex = Number(body.likelihoodIndex);
  const impactIndex = Number(body.impactIndex);
  if (!Number.isSafeInteger(likelihoodIndex) || likelihoodIndex < 1 || likelihoodIndex > method.likelihood.length ||
      !Number.isSafeInteger(impactIndex) || impactIndex < 1 || impactIndex > method.impact.length) {
    throw errorFor("Selecciona categorías válidas de probabilidad e impacto.");
  }
  const assumptionNote = stringField(body.assumptionNote, "Supuestos", 10, 1000);
  if (body.stage === "RESIDUAL") stringField(body.controlEvidenceNote, "Evidencia de controles", 10, 1000);
  if (body.stage === "TARGET") stringField(body.treatmentAssumption, "Supuesto de tratamiento", 10, 1000);
  return {
    method: { name: method.name, version: method.version, type: "QUALITATIVE_MATRIX" },
    stage: body.stage,
    likelihood: method.likelihood[likelihoodIndex - 1],
    impact: method.impact[impactIndex - 1],
    level: method.matrix[likelihoodIndex - 1][impactIndex - 1],
    assumptionNote,
    approvedEnterprisePolicy: false,
    persisted: false,
    controlsEvaluatedBySystem: false
  };
};

module.exports = { validateMethod, previewQualitativeMethod };
