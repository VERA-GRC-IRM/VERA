import test from "node:test";
import assert from "node:assert/strict";
import { readWorkspace, toggleFavorite, saveView, recordVisit, removeWorkspaceItem } from "../src/services/personalWorkspace.js";

test("workspace is scoped to one account and stores only internal paths", () => {
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value) };
  globalThis.window = { dispatchEvent: () => {} };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  assert.equal(toggleFavorite(101, "/riesgos#risk-RSK-1", "Riesgo RSK-1"), true);
  assert.equal(toggleFavorite(101, "/riesgos#risk-RSK-1", "Riesgo RSK-1"), false);
  assert.equal(toggleFavorite(101, "https://outside.example", "Externo"), null);
  assert.equal(saveView(101, "/auditorias?quarter=Q2", "Segundo trimestre"), true);
  recordVisit(101, "/mapa-negocio", "Mapa del negocio");
  assert.equal(readWorkspace(101).views[0].label, "Segundo trimestre");
  assert.equal(readWorkspace(101).recent[0].path, "/mapa-negocio");
  assert.deepEqual(readWorkspace(102), { favorites: [], views: [], recent: [] });
  assert.equal(removeWorkspaceItem(101, "views", "/auditorias?quarter=Q2"), true);
  assert.equal(readWorkspace(101).views.length, 0);
});
