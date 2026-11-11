// HU-12: qué datos se pueden editar de una auditoría según su estado.
// Las propuestas abiertas (OPEN) se siguen editando completas con PUT /api/planning/:id (HU-22).
const EDITABLE_FIELDS_BY_STATUS = {
  APPROVED: ["objective", "responsibleId", "quarter", "startDate", "endDate", "likelihood", "impact", "plannedHours"],
  ACTIVE: ["objective", "responsibleId", "endDate", "plannedHours", "executedHours"]
};

const FIELD_LABELS = {
  title: "título",
  area: "área",
  type: "tipo",
  year: "año",
  objective: "objetivo",
  responsibleId: "responsable",
  quarter: "trimestre",
  startDate: "fecha de inicio",
  endDate: "fecha de fin",
  likelihood: "probabilidad",
  impact: "impacto",
  plannedHours: "horas planeadas",
  executedHours: "horas ejecutadas"
};

const STATUS_LABELS = {
  APPROVED: "aprobada",
  ACTIVE: "en curso",
  CLOSED: "cerrada",
  REJECTED: "rechazada",
  OPEN: "abierta"
};

module.exports = { EDITABLE_FIELDS_BY_STATUS, FIELD_LABELS, STATUS_LABELS };
