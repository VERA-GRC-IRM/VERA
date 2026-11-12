import test from "node:test";
import assert from "node:assert/strict";
import { shareableLocation } from "../src/utils/shareableLocation.js";

test("solo comparte filtros reconocidos y nunca parámetros de acceso", () => {
  assert.equal(shareableLocation({ pathname: "/auditorias", search: "?quarter=Q3&year=2026&token=privado&state=abc", hash: "#token" }),
    "/auditorias?quarter=Q3&year=2026");
  assert.equal(shareableLocation({ pathname: "/asistente", search: "?conversation=abc-123&access_token=secreto", hash: "" }),
    "/asistente?conversation=abc-123");
});

test("conserva enlaces de registros y funciona en pantallas sin filtros", () => {
  assert.equal(shareableLocation({ pathname: "/riesgos", search: "?level=Alto", hash: "#risk-RSK-12" }),
    "/riesgos?level=Alto#risk-RSK-12");
  assert.equal(shareableLocation({ pathname: "/dashboard", search: "?code=123", hash: "#access_token=abc" }),
    "/dashboard");
  assert.equal(shareableLocation({ pathname: "//otro-sitio.com", search: "", hash: "" }), "/dashboard");
});
