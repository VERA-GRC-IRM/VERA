import test from "node:test";
import assert from "node:assert/strict";
import { buildTeamsShareUrl } from "../src/utils/teamsShare.js";

test("Teams comparte solo un enlace interno HTTPS y deja la elección del destinatario al usuario", () => {
  const url = buildTeamsShareUrl("/auditorias?year=2026&quarter=Q4", "https://www.vera-digital-systems.com");
  const share = new URL(url);
  assert.equal(share.origin, "https://teams.microsoft.com");
  assert.equal(share.searchParams.get("href"),
    "https://www.vera-digital-systems.com/auditorias?year=2026&quarter=Q4");
  assert.equal(share.searchParams.get("preview"), "false");
  assert.equal(share.searchParams.has("users"), false);
  assert.equal(buildTeamsShareUrl("https://external.example/", "https://www.vera-digital-systems.com"), null);
  assert.equal(buildTeamsShareUrl("/auditorias", "http://localhost:5173"), null);
});
