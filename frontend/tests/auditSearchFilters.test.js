import test from "node:test";
import assert from "node:assert/strict";
import { emptyAuditFilters, readAuditFilters, writeAuditFilters } from "../src/utils/auditSearchFilters.js";

test("shared audit filters round-trip without unrelated parameters", () => {
  const filters = { ...emptyAuditFilters(), q: "auditoría", quarter: "Q3", year: "2026", orgUnitId: "ORG-1" };
  const params = writeAuditFilters(filters);
  assert.deepEqual(readAuditFilters(params), filters);
  assert.equal(params.has("auditId"), false);
  assert.deepEqual(readAuditFilters(new URLSearchParams("auditId=AUD-1")), emptyAuditFilters());
});
