const test = require("node:test");
const assert = require("node:assert/strict");
const storage = require("../services/evidenceStorage");

const CSV = Buffer.from("Control,Estado\nAcceso,Aprobado\n");
const FILE = { bucket: "vera-evidence", path: "risk/RSK-1/11111111-1111-1111-1111-111111111111.csv",
  mime: "text/csv", size: CSV.length };

test("las rutas de evidencias conservan el espacio privado de archivos de IA", () => {
  const path = storage.pathFor("ai", "conversation-1", "text/plain",
    "11111111-1111-1111-1111-111111111111");
  assert.equal(path, "ai/conversation-1/11111111-1111-1111-1111-111111111111.txt");
  assert.throws(() => storage.pathFor("unexpected", "record-1", "text/plain"), { status: 400 });
});

test("Almacén privado: CSV UTF-8 válido se sube y descarga; la ruta queda acotada al bucket", async (t) => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    for (const [name, value] of [["SUPABASE_URL", previous.url], ["SUPABASE_SECRET_KEY", previous.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  global.fetch = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://supabase.example");
    assert.equal(options.headers.apikey, "sb_secret_test");
    assert.equal(options.headers.Authorization, undefined);
    if (options.method === "POST" && url.pathname.startsWith("/storage/v1/object/vera-evidence/")) {
      assert.equal(options.headers["Content-Type"], "text/csv");
      assert.deepEqual(Buffer.from(options.body), CSV);
      return new Response(null, { status: 200 });
    }
    if (!options.method || options.method === "GET") return new Response(CSV, { status: 200 });
    if (options.method === "DELETE") return new Response(null, { status: 204 });
    throw new Error("Petición inesperada");
  };
  const uploaded = await storage.upload({ entityType: "RISK", entityId: "RSK-1", mime: "text/csv", bytes: CSV });
  assert.equal(uploaded.mime, "text/csv");
  assert.match(uploaded.path, /^risk\/RSK-1\/[0-9a-f-]{36}\.csv$/);
  assert.deepEqual(await storage.downloadBytes(FILE), CSV);
  await storage.remove(FILE);
});

test("Almacén privado: rechaza suplantación, UTF-8 inválido y respuestas no confiables", async (t) => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    for (const [name, value] of [["SUPABASE_URL", previous.url], ["SUPABASE_SECRET_KEY", previous.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const upload = (mime, bytes) => storage.upload({ entityType: "RISK", entityId: "RSK-1", mime, bytes });
  await assert.rejects(() => upload("text/csv", "no es un buffer"), (error) => error.status === 400);
  await assert.rejects(() => upload("text/csv", Buffer.alloc(0)), (error) => error.status === 400);
  await assert.rejects(() => upload("text/csv", Buffer.from([0xff])), (error) => error.status === 415);
  await assert.rejects(() => upload("text/csv", Buffer.from("a\0b")), (error) => error.status === 415);
  await assert.rejects(() => upload("application/octet-stream", CSV), (error) => error.status === 415);
  await assert.rejects(() => storage.downloadBytes({ ...FILE, path: "../outside.csv" }),
    (error) => error.status === 400);
  global.fetch = async () => new Response("rechazado", { status: 403 });
  await assert.rejects(() => upload("text/csv", CSV), (error) => error.status === 503);
  await assert.rejects(() => storage.downloadBytes(FILE), (error) => error.status === 503);
  global.fetch = async () => new Response(Buffer.from([0xff]), { status: 200 });
  await assert.rejects(() => storage.downloadBytes(FILE), (error) => error.status === 503);
  global.fetch = async () => { throw new Error("red caída"); };
  await assert.rejects(() => upload("text/csv", CSV), (error) => error.status === 503);
  await assert.rejects(() => storage.downloadBytes(FILE), (error) => error.status === 503);
  await assert.rejects(() => storage.signedDownloadUrl(FILE), (error) => error.status === 503);
});
