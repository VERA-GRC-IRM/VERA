import test from "node:test";
import assert from "node:assert/strict";
import { uploadEvidenceBatch } from "../src/services/evidenceBatchUpload.js";

const files = [
  { name: "uno.pdf", size: 12, lastModified: 1 },
  { name: "dos.pdf", size: 14, lastModified: 2 }
];

test("a partial batch retries only the failed file and keeps stable titles", async () => {
  const called = [];
  const upload = async (details, file) => {
    called.push([details.title, file.name]);
    if (file.name === "dos.pdf" && called.length === 2) throw new Error("Archivo rechazado");
    return { contentIndex: { status: "ready" } };
  };
  const first = await uploadEvidenceBatch(files, { title: "Respaldo" }, upload);
  assert.deepEqual(first.map((result) => result.status), ["saved", "error"]);
  const second = await uploadEvidenceBatch(files, { title: "Respaldo" }, upload, { previous: first });
  assert.deepEqual(second.map((result) => result.status), ["saved", "saved"]);
  assert.deepEqual(called, [
    ["Respaldo · uno.pdf", "uno.pdf"], ["Respaldo · dos.pdf", "dos.pdf"],
    ["Respaldo · dos.pdf", "dos.pdf"]
  ]);
});

test("cancellation stops before the next file and never marks it saved", async () => {
  const controller = new AbortController();
  const result = await uploadEvidenceBatch(files, { title: "Respaldo" }, async () => {
    controller.abort();
    throw new DOMException("Cancelada", "AbortError");
  }, { signal: controller.signal });
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "uncertain");
});

test("unconfirmed transport response is flagged for manual review", async () => {
  const result = await uploadEvidenceBatch(files.slice(0, 1), { title: "Respaldo" }, async () => {
    const error = new Error("Respuesta no confirmada"); error.uncertain = true; throw error;
  });
  assert.equal(result[0].status, "uncertain");
});
