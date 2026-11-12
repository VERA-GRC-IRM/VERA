import test from "node:test";
import assert from "node:assert/strict";
import { uploadResumableEvidence } from "../src/services/resumableEvidenceUpload.js";

test("a reload resumes only the missing chunk and confirms a single evidence", async (context) => {
  const priorFetch = globalThis.fetch;
  const priorStorage = globalThis.localStorage;
  const priorWindow = globalThis.window;
  const entries = new Map();
  globalThis.localStorage = { getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key) };
  globalThis.localStorage.setItem("user", JSON.stringify({ id: 5 }));
  globalThis.window = new EventTarget();
  context.after(() => { globalThis.fetch = priorFetch; globalThis.localStorage = priorStorage;
    globalThis.window = priorWindow; });
  const file = new Blob(["a".repeat(300000)]);
  const details = { title: "Respaldo", description: "Documento de control.", evidenceType: "DOCUMENT",
    entityType: "RISK", entityId: "RSK-1" };
  const calls = [];
  let failedOnce = false;
  globalThis.fetch = async (url, options) => {
    calls.push([url, options.method || "GET"]);
    if (url === "/api/evidence/uploads" && options.method === "POST") {
      const body = JSON.parse(options.body);
      return Response.json({ id: "session-1", size: body.size, mime: body.mime,
        sha256: body.sha256, received: [], chunkSize: 256 * 1024 });
    }
    if (url === "/api/evidence/uploads/session-1" && !options.method) {
      return Response.json({ id: "session-1", size: file.size, mime: "text/plain",
        sha256: digest,
        received: [0], chunkSize: 256 * 1024 });
    }
    if (url.endsWith("/parts/1") && !failedOnce) { failedOnce = true; throw new Error("offline"); }
    if (url.includes("/parts/")) return Response.json({ received: [0, 1] });
    if (url.endsWith("/finish")) return Response.json({ evidence: { id: "EVD-2" } });
    throw new Error(`Unexpected ${url}`);
  };
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))]
    .map((part) => part.toString(16).padStart(2, "0")).join("");
  await assert.rejects(uploadResumableEvidence(details, file, "text/plain", "token"), /offline/);
  assert.ok([...entries.keys()].some((key) => key.startsWith("vera:evidence-upload:")));
  const result = await uploadResumableEvidence(details, file, "text/plain", "token");
  assert.equal(result.evidence.id, "EVD-2");
  assert.equal(calls.filter(([url]) => url.endsWith("/parts/0")).length, 1);
  assert.equal(calls.filter(([url]) => url.endsWith("/parts/1")).length, 2);
  assert.equal(calls.filter(([url, method]) => url === "/api/evidence/uploads" && method === "POST").length, 1);
  assert.equal([...entries.keys()].filter((key) => key.startsWith("vera:evidence-upload:")).length, 0);
});
