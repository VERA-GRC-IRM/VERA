import test from "node:test";
import assert from "node:assert/strict";
import { sendEvidenceUpload } from "../src/services/fileUpload.js";

class FakeXMLHttpRequest {
  static latest;
  constructor() { this.upload = {}; this.headers = {}; FakeXMLHttpRequest.latest = this; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(name, value) { this.headers[name] = value; }
  send(file) { this.file = file; }
  abort() { this.onabort(); }
  respond(status, data) { this.status = status; this.responseText = JSON.stringify(data); this.onload(); }
}

globalThis.XMLHttpRequest = FakeXMLHttpRequest;
globalThis.localStorage = { getItem: () => "test-token", setItem: () => {} };
globalThis.window = new EventTarget();

const file = { name: "ejemplo.pdf", size: 1000 };
const upload = (options) => sendEvidenceUpload("/api/evidence/upload?title=Prueba", file, "application/pdf", "test-token", options);

test("la carga informa avance y espera confirmación del servidor antes de concluir", async () => {
  const values = [];
  let changed = 0;
  window.addEventListener("vera:data-change", () => { changed += 1; }, { once: true });
  const pending = upload({ onProgress: (value) => values.push(value) });
  const xhr = FakeXMLHttpRequest.latest;
  assert.equal(xhr.method, "POST");
  assert.equal(xhr.file, file);
  xhr.upload.onprogress({ lengthComputable: true, loaded: 1000, total: 1000 });
  assert.deepEqual(values, [99], "subir bytes no equivale a registrar el archivo");
  xhr.respond(201, { evidence: { id: "EVD-1" } });
  assert.deepEqual(await pending, { evidence: { id: "EVD-1" } });
  assert.deepEqual(values, [99, 100]);
  assert.equal(changed, 1);
});

test("cancelar y rechazar una carga no anuncian datos nuevos", async () => {
  const controller = new AbortController();
  const cancelled = upload({ signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });

  const rejected = upload();
  FakeXMLHttpRequest.latest.respond(413, { message: "Archivo demasiado grande" });
  await assert.rejects(rejected, /Archivo demasiado grande/);
});
