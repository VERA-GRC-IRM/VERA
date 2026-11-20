import test from "node:test";
import assert from "node:assert/strict";
import { matchesSearchText, normalizeSearchText } from "../src/utils/searchText.js";

test("normalizes case, accents, surrounding whitespace, and missing values", () => {
  assert.equal(normalizeSearchText("  Revisión de Auditoría  "), "revision de auditoria");
  assert.equal(normalizeSearchText(null), "");
});

test("matches any visible text value without changing the source values", () => {
  const fields = ["Auditoría de compras", "Riesgo alto", "AUD-104"];
  assert.equal(matchesSearchText(fields, "auditoria"), true);
  assert.equal(matchesSearchText(fields, "AUD-104"), true);
  assert.equal(matchesSearchText(fields, "hallazgo"), false);
  assert.deepEqual(fields, ["Auditoría de compras", "Riesgo alto", "AUD-104"]);
});

test("an empty query keeps the full already-authorized list", () => {
  assert.equal(matchesSearchText(["Auditoría"], "   "), true);
});
