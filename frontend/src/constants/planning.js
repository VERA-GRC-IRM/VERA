export const QUARTERS = [
  { value: "Q1", label: "Trimestre 1", period: "Enero - Marzo" },
  { value: "Q2", label: "Trimestre 2", period: "Abril - Junio" },
  { value: "Q3", label: "Trimestre 3", period: "Julio - Septiembre" },
  { value: "Q4", label: "Trimestre 4", period: "Octubre - Diciembre" }
];

export const AUDIT_TYPES = ["Interna", "Externa"];
export const RISK_LEVELS = ["Bajo", "Medio", "Alto"];
export const RISK_FACTORS = [
  { value: 1, label: "Baja" },
  { value: 2, label: "Media" },
  { value: 3, label: "Alta" }
];

// Debe coincidir con los permisos de propuestas del backend.
export const RISK_CONTROL_MANAGE_ROLES = ["SUPER_ADMIN", "GERENTE"];
export const CONTROL_MANAGE_ROLES = [...RISK_CONTROL_MANAGE_ROLES, "AUDITOR"];
export const AUDIT_PROPOSAL_CREATE_ROLES = ["SUPER_ADMIN", "GERENTE", "JEFATURA"];
export const AUDIT_PROPOSAL_DELETE_ROLES = ["SUPER_ADMIN", "GERENTE"];
export const PLANNING_APPROVE_ROLES = ["SUPER_ADMIN", "GERENTE"];

export const EDITABLE_FIELDS_BY_STATUS = {
  APPROVED: ["objective", "responsibleId", "quarter", "startDate", "endDate", "likelihood", "impact", "plannedHours"],
  ACTIVE: ["objective", "responsibleId", "endDate", "plannedHours", "executedHours"]
};
