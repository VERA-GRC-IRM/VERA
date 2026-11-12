import test from "node:test";
import assert from "node:assert/strict";
import { mergeWorkspace } from "../src/services/workspaceSync.js";

const item = (path, label = path) => ({ path, label });
const data = (favorites = [], views = [], recent = []) => ({ favorites, views, recent });

test("combina cambios de dos dispositivos y conserva eliminaciones locales", () => {
  const base = data([item("/riesgos#risk-1")], [item("/auditorias?quarter=Q1")]);
  const local = data([], [item("/auditorias?quarter=Q1"), item("/auditorias?quarter=Q2")]);
  const remote = data([item("/riesgos#risk-1"), item("/controles#control-2")],
    [item("/auditorias?quarter=Q1"), item("/auditorias?quarter=Q3")]);
  const merged = mergeWorkspace(base, local, remote);
  assert.deepEqual(merged.favorites, [item("/controles#control-2")]);
  assert.deepEqual(merged.views, [item("/auditorias?quarter=Q2"), item("/auditorias?quarter=Q1"),
    item("/auditorias?quarter=Q3")]);
});

test("un cambio local al mismo enlace gana de forma determinista", () => {
  const base = data([item("/dashboard", "Inicio")]);
  const local = data([item("/dashboard", "Mi inicio")]);
  const remote = data([item("/dashboard", "Panel")]);
  assert.deepEqual(mergeWorkspace(base, local, remote).favorites, [item("/dashboard", "Mi inicio")]);
});

test("la primera importación puede combinar las dos colecciones sin perder favoritos", () => {
  const empty = data();
  const local = data([item("/dashboard", "Panel local")]);
  const remote = data([item("/riesgos", "Riesgos remotos")]);
  assert.deepEqual(mergeWorkspace(empty, local, remote).favorites,
    [item("/dashboard", "Panel local"), item("/riesgos", "Riesgos remotos")]);
});
