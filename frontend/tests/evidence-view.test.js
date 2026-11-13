import test from "node:test";
import assert from "node:assert/strict";
import { evidenceViewQuery, parseEvidenceView } from "../src/services/evidenceView.js";

test("un enlace de evidencias conserva búsqueda y tipo sin parámetros ajenos", () => {
  const query = evidenceViewQuery({ search: "revisión Q4", filter: "CONTROL" });
  assert.deepEqual(parseEvidenceView(`?${query}`), { search: "revisión Q4", filter: "CONTROL" });
  assert.equal(query.includes("token"), false);
  assert.deepEqual(parseEvidenceView("?q=informe&type=INVALID&token=secret"),
    { search: "informe", filter: "ALL" });
  assert.equal(evidenceViewQuery({ search: "", filter: "ALL" }), "");
});
