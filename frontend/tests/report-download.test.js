import test from "node:test";
import assert from "node:assert/strict";
import { downloadReportFile } from "../src/services/reportDownload.js";

const fakeDocument = () => {
  const state = { clicks: 0, removed: 0, link: null };
  return { state, body: { appendChild: (link) => { state.link = link; } },
    createElement: () => ({ click: () => { state.clicks += 1; }, remove: () => { state.removed += 1; } }) };
};

test("descarga solo después de respuesta autorizada y libera el recurso temporal", async () => {
  const page = fakeDocument();
  let revoked = 0;
  const urls = { createObjectURL: () => "blob:test", revokeObjectURL: () => { revoked += 1; } };
  await downloadReportFile("/api/planning/report?format=pdf", "test-token", "reporte.pdf", {
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, "Bearer test-token");
      return { ok: true, blob: async () => new Blob(["PDF"]) };
    }, documentObject: page, urlObject: urls
  });
  assert.equal(page.state.link.download, "reporte.pdf");
  assert.equal(page.state.clicks, 1);
  assert.equal(page.state.removed, 1);
  assert.equal(revoked, 1);
});

test("al cancelar o perder permiso no inicia ninguna descarga", async () => {
  const page = fakeDocument();
  const controller = new AbortController();
  const pending = downloadReportFile("/api/planning/report", "token", "reporte.csv", {
    signal: controller.signal, documentObject: page,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) =>
      options.signal.addEventListener("abort", () => reject(new DOMException("Cancelada", "AbortError")), { once: true }))
  });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(downloadReportFile("/api/planning/report", "token", "reporte.csv", {
    documentObject: page,
    fetchImpl: async () => ({ ok: false, json: async () => ({ message: "Sin permiso" }) })
  }), /Sin permiso/);
  assert.equal(page.state.clicks, 0);
});
