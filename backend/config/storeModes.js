const validateStoreModes = (environment = process.env) => {
  if (environment.VERA_MANAGED_AUTH_ENABLED === "true" &&
      (environment.VERA_USER_STORE !== "supabase" || !environment.SUPABASE_URL ||
        !environment.SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error("Managed Auth requiere usuarios en Supabase y la clave pública de Auth.");
  }
  for (const name of [
    "VERA_PLANNING_STORE", "VERA_USER_STORE", "VERA_RISK_CONTROL_STORE",
    "VERA_EVIDENCE_COMMENT_STORE", "VERA_AUDIT_STORE", "VERA_NOTIFICATION_STORE",
    "VERA_ORG_STORE", "VERA_RISK_LIBRARY_STORE"
  ]) {
    if (environment[name] !== undefined && !["memory", "supabase"].includes(environment[name])) {
      throw new Error(`${name} debe ser memory o supabase.`);
    }
  }

  if (environment.VERA_RISK_CONTROL_STORE === "supabase" &&
      (environment.VERA_USER_STORE !== "supabase" || environment.VERA_PLANNING_STORE !== "supabase")) {
    throw new Error("La persistencia de riesgos y controles requiere cuentas y planificación persistentes.");
  }
  if (environment.VERA_EVIDENCE_COMMENT_STORE === "supabase" &&
      (environment.VERA_RISK_CONTROL_STORE !== "supabase" ||
        environment.VERA_USER_STORE !== "supabase" || environment.VERA_PLANNING_STORE !== "supabase")) {
    throw new Error("La persistencia de evidencias y comentarios requiere riesgos, controles, cuentas y planificación persistentes.");
  }
  if (environment.VERA_AUDIT_STORE === "supabase" &&
      (environment.VERA_EVIDENCE_COMMENT_STORE !== "supabase" ||
        environment.VERA_RISK_CONTROL_STORE !== "supabase" ||
        environment.VERA_USER_STORE !== "supabase" || environment.VERA_PLANNING_STORE !== "supabase")) {
    throw new Error("La bitácora persistente requiere todos los almacenes de VERA en Supabase.");
  }
  if (environment.VERA_NOTIFICATION_STORE === "supabase" &&
      (environment.VERA_USER_STORE !== "supabase" || environment.VERA_PLANNING_STORE !== "supabase")) {
    throw new Error("Las lecturas persistentes de notificaciones requieren cuentas y planificación en Supabase.");
  }
  if (environment.VERA_ORG_STORE === "supabase" && environment.VERA_USER_STORE !== "supabase") {
    throw new Error("El directorio organizativo persistente requiere cuentas persistentes.");
  }
  if (environment.VERA_RISK_LIBRARY_STORE === "supabase" && environment.VERA_USER_STORE !== "supabase") {
    throw new Error("La biblioteca de riesgos persistente requiere cuentas persistentes.");
  }
};

module.exports = { validateStoreModes };
