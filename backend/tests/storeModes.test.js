const test = require("node:test");
const assert = require("node:assert/strict");
const { validateStoreModes } = require("../config/storeModes");

test("every store rejects an invalid or empty mode instead of silently using memory", () => {
  for (const name of [
    "VERA_PLANNING_STORE", "VERA_USER_STORE", "VERA_RISK_CONTROL_STORE",
    "VERA_EVIDENCE_COMMENT_STORE", "VERA_AUDIT_STORE", "VERA_NOTIFICATION_STORE",
    "VERA_ORG_STORE", "VERA_RISK_METHOD_STORE"
  ]) {
    assert.throws(() => validateStoreModes({ [name]: "suapbase" }), new RegExp(name));
    assert.throws(() => validateStoreModes({ [name]: "" }), new RegExp(name));
  }
  assert.doesNotThrow(() => validateStoreModes({}));
});

test("persistent method drafts require persistent accounts", () => {
  assert.throws(() => validateStoreModes({ VERA_RISK_METHOD_STORE: "supabase" }), /cuentas persistentes/);
  assert.doesNotThrow(() => validateStoreModes({ VERA_RISK_METHOD_STORE: "supabase", VERA_USER_STORE: "supabase" }));
});

test("persistent risks and controls require persistent users and planning", () => {
  assert.doesNotThrow(() => validateStoreModes({ VERA_RISK_CONTROL_STORE: "memory" }));
  assert.throws(() => validateStoreModes({ VERA_RISK_CONTROL_STORE: "supabase" }), /requiere/);
  assert.throws(() => validateStoreModes({
    VERA_RISK_CONTROL_STORE: "supabase", VERA_USER_STORE: "supabase"
  }), /requiere/);
  assert.doesNotThrow(() => validateStoreModes({
    VERA_RISK_CONTROL_STORE: "supabase", VERA_USER_STORE: "supabase", VERA_PLANNING_STORE: "supabase"
  }));
  assert.throws(() => validateStoreModes({ VERA_EVIDENCE_COMMENT_STORE: "supabase" }), /requiere/);
  assert.doesNotThrow(() => validateStoreModes({
    VERA_EVIDENCE_COMMENT_STORE: "supabase", VERA_RISK_CONTROL_STORE: "supabase",
    VERA_USER_STORE: "supabase", VERA_PLANNING_STORE: "supabase"
  }));
  assert.throws(() => validateStoreModes({ VERA_AUDIT_STORE: "supabase" }), /requiere/);
  assert.doesNotThrow(() => validateStoreModes({
    VERA_AUDIT_STORE: "supabase", VERA_EVIDENCE_COMMENT_STORE: "supabase",
    VERA_RISK_CONTROL_STORE: "supabase", VERA_USER_STORE: "supabase",
    VERA_PLANNING_STORE: "supabase"
  }));
  assert.throws(() => validateStoreModes({ VERA_NOTIFICATION_STORE: "supabase" }), /requiere/);
  assert.doesNotThrow(() => validateStoreModes({
    VERA_NOTIFICATION_STORE: "supabase", VERA_USER_STORE: "supabase", VERA_PLANNING_STORE: "supabase"
  }));
  assert.throws(() => validateStoreModes({ VERA_ORG_STORE: "supabase" }), /requiere/);
  assert.doesNotThrow(() => validateStoreModes({ VERA_ORG_STORE: "supabase", VERA_USER_STORE: "supabase" }));
});
