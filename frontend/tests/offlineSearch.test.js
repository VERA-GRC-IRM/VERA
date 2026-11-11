import test from "node:test";
import assert from "node:assert/strict";
import { searchOfflineRecords } from "../src/services/offlineSearch.js";

const modules = [{ id: "risks", label: "Riesgos", link: "/riesgos", listKey: "risks" },
  { id: "controls", label: "Controles", link: "/controles", listKey: "controls" }];
const now = Date.parse("2026-11-11T12:00:00Z");
const snapshots = {
  risks: { savedAt: "2026-11-11T11:00:00Z", data: { risks: [
    { id: "RSK-1", title: "Conciliación mensual", area: "Finanzas", status: "OPEN" },
    { id: "RSK-2", title: "Acceso físico", area: "Operaciones", status: "ACTIVE" }
  ] } },
  controls: { savedAt: "2026-11-09T11:00:00Z", data: { controls: [
    { id: "CTL-1", title: "Conciliación caducada" }
  ] } }
};
const options = { query: "conciliacion", now, ttlMs: 24 * 60 * 60 * 1000 };

test("la búsqueda local ignora acentos y copias caducadas", () => {
  const found = searchOfflineRecords(snapshots, modules, options);
  assert.equal(found.length, 1);
  assert.equal(found[0].id, "RSK-1");
  assert.equal(found[0].link, "/riesgos");
  assert.equal(searchOfflineRecords(snapshots, modules, { ...options, moduleId: "controls" }).length, 0);
});

test("una consulta vacía o corta no enumera datos y el límite se respeta", () => {
  assert.deepEqual(searchOfflineRecords(snapshots, modules, { ...options, query: "c" }), []);
  assert.equal(searchOfflineRecords(snapshots, modules, { ...options, query: "o", limit: 1 }).length, 0);
  assert.equal(searchOfflineRecords(snapshots, modules, { ...options, query: "RSK", limit: 1 }).length, 1);
});
