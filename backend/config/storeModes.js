const validateStoreModes = (environment = process.env) => {
  if (environment.VERA_MANAGED_AUTH_ENABLED === "true" &&
      (environment.VERA_USER_STORE !== "supabase" || !environment.SUPABASE_URL ||
        !environment.SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error("Managed Auth requiere usuarios en Supabase y la clave pública de Auth.");
  }
  for (const name of [
    "VERA_PLANNING_STORE", "VERA_USER_STORE", "VERA_RISK_CONTROL_STORE",
    "VERA_EVIDENCE_COMMENT_STORE", "VERA_AUDIT_STORE", "VERA_NOTIFICATION_STORE",
    "VERA_ORG_STORE", "VERA_RISK_LIBRARY_STORE", "VERA_BUSINESS_CONTEXT_STORE",
    "VERA_RISK_METHOD_STORE", "VERA_WORKSPACE_STORE", "VERA_JOB_STORE", "VERA_PUSH_STORE"
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
  if (environment.VERA_BUSINESS_CONTEXT_STORE === "supabase" &&
      (environment.VERA_ORG_STORE !== "supabase" || environment.VERA_USER_STORE !== "supabase")) {
    throw new Error("El catálogo empresarial persistente requiere unidades y cuentas persistentes.");
  }
  if (environment.VERA_RISK_METHOD_STORE === "supabase" && environment.VERA_USER_STORE !== "supabase") {
    throw new Error("El catálogo de métodos persistente requiere cuentas persistentes.");
  }
  if (environment.VERA_WORKSPACE_STORE === "supabase" && environment.VERA_USER_STORE !== "supabase") {
    throw new Error("El espacio personal persistente requiere cuentas persistentes.");
  }
  if (environment.VERCEL_ENV === "production" && environment.VERA_WORKSPACE_SYNC_ENABLED === "true" &&
      environment.VERA_WORKSPACE_STORE !== "supabase") {
    throw new Error("La sincronización en Production requiere almacenamiento persistente.");
  }
  if (environment.VERA_JOB_STORE === "supabase" && environment.VERA_USER_STORE !== "supabase") {
    throw new Error("Los trabajos persistentes requieren cuentas persistentes.");
  }
  if (environment.VERCEL_ENV === "production" && environment.VERA_JOBS_ENABLED === "true" &&
      (environment.VERA_JOB_STORE !== "supabase" || !environment.CRON_SECRET)) {
    throw new Error("Los trabajos de Production requieren Supabase y secreto del procesador.");
  }
  if (environment.VERA_PUSH_STORE === "supabase" && environment.VERA_USER_STORE !== "supabase") {
    throw new Error("Las suscripciones push persistentes requieren cuentas persistentes.");
  }
  if (environment.VERCEL_ENV === "production" && environment.VERA_PUSH_ENABLED === "true" &&
      (environment.VERA_PUSH_STORE !== "supabase" || environment.VERA_NOTIFICATION_STORE !== "supabase" ||
        !environment.VERA_VAPID_PUBLIC_KEY || !environment.VERA_VAPID_PRIVATE_KEY ||
        !environment.VERA_VAPID_SUBJECT)) {
    throw new Error("Push en Production requiere suscripciones, notificaciones y VAPID configurados.");
  }
};

module.exports = { validateStoreModes };
