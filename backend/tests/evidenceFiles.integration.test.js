const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

process.env.JWT_SECRET ||= "evidence-files-test-secret-over-32-characters";
const app = require("../server");
const { startTestServer } = require("./helpers/testServer");
const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const auth = (id, extra = {}) => ({ Authorization: `Bearer ${tokenFor(id)}`, ...extra });

test("HU-16: carga archivo privado, vincula metadatos y firma descarga autorizada", async (context) => {
  const base = await startTestServer(context, app);
  const originalFetch = global.fetch;
  const before = { url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY,
    versions: process.env.VERA_EVIDENCE_VERSIONS_ENABLED,
    resumable: process.env.VERA_RESUMABLE_UPLOADS_ENABLED,
    largeResumable: process.env.VERA_LARGE_EVIDENCE_UPLOADS_ENABLED,
    resumableStore: process.env.VERA_RESUMABLE_STORE,
    evidenceStore: process.env.VERA_EVIDENCE_COMMENT_STORE,
    cronSecret: process.env.CRON_SECRET };
  context.after(() => {
    global.fetch = originalFetch;
    for (const [name, value] of [["SUPABASE_URL", before.url], ["SUPABASE_SECRET_KEY", before.secret],
      ["VERA_EVIDENCE_VERSIONS_ENABLED", before.versions],
      ["VERA_RESUMABLE_UPLOADS_ENABLED", before.resumable],
      ["VERA_LARGE_EVIDENCE_UPLOADS_ENABLED", before.largeResumable],
      ["VERA_RESUMABLE_STORE", before.resumableStore],
      ["VERA_EVIDENCE_COMMENT_STORE", before.evidenceStore],
      ["CRON_SECRET", before.cronSecret]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

  let uploaded = 0;
  const chunks = new Map();
  const tusObjects = new Map();
  global.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.hostname !== "supabase.example") return originalFetch(input, options);
    assert.equal(options.headers.apikey, "sb_secret_test");
    assert.equal(options.headers.Authorization, undefined);
    if (url.pathname.includes("/vera-evidence/uploads/")) {
      if (options.method === "POST") {
        chunks.set(url.pathname, Buffer.from(options.body));
        return Response.json({ Key: url.pathname });
      }
      const chunk = chunks.get(url.pathname);
      return chunk ? new Response(chunk, { headers: { "Content-Length": String(chunk.length) } })
        : Response.json({ message: "Not found" }, { status: 404 });
    }
    if (url.pathname === "/storage/v1/object/vera-evidence" && options.method === "DELETE") {
      for (const prefix of JSON.parse(options.body).prefixes) {
        chunks.delete(`/storage/v1/object/vera-evidence/${prefix}`);
        tusObjects.delete(prefix);
      }
      return Response.json({});
    }
    if (url.pathname.startsWith("/storage/v1/object/upload/sign/vera-evidence/") && options.method === "POST") {
      assert.equal(options.headers["x-upsert"], "false");
      return Response.json({ url: `${url.pathname.slice("/storage/v1".length)}?token=test-tus-signature` });
    }
    if (url.pathname.startsWith("/storage/v1/object/authenticated/vera-evidence/")) {
      const objectPath = url.pathname.slice("/storage/v1/object/authenticated/vera-evidence/".length);
      const stored = tusObjects.get(objectPath);
      if (!stored) return Response.json({ message: "Not found" }, { status: 404 });
      if (options.method === "HEAD") return new Response(null, { headers: {
        "Content-Type": stored.mime, "Content-Length": String(stored.bytes.length)
      } });
      const prefix = stored.bytes.subarray(0, 64 * 1024);
      return new Response(prefix, { status: 206, headers: {
        "Content-Type": stored.mime, "Content-Length": String(prefix.length)
      } });
    }
    if (url.pathname.startsWith("/storage/v1/object/vera-evidence/") && options.method === "POST") {
      uploaded += 1;
      assert.equal(options.method, "POST");
      assert.ok(["application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(options.headers["Content-Type"]));
      return Response.json({ Key: url.pathname });
    }
    if (url.pathname.startsWith("/storage/v1/object/sign/vera-evidence/")) {
      assert.equal(JSON.parse(options.body).expiresIn, 60);
      return Response.json({ signedURL: `${url.pathname.slice("/storage/v1".length)}?token=test-signature` });
    }
    if (url.pathname.startsWith("/storage/v1/object/vera-evidence/") && options.method === undefined) {
      return new Response(body, { headers: { "Content-Type": "application/pdf", "Content-Length": String(body.length) } });
    }
    throw new Error(`Unexpected storage request ${url.pathname}`);
  };

  const riskResponse = await fetch(`${base}/api/risks`, {
    method: "POST", headers: auth(3, { "Content-Type": "application/json" }),
    body: JSON.stringify({ title: `Riesgo de archivo ${Date.now()}`, description: "Evidencia de operación y revisión trimestral.",
      area: "Finanzas", ownerId: 5, likelihood: 2, impact: 2,
      note: "La muestra requiere documentar el soporte original." })
  });
  assert.equal(riskResponse.status, 201);
  const risk = (await riskResponse.json()).risk;
  const query = new URLSearchParams({ title: "Informe de muestra", description: "Documento de revisión de control.", evidenceType: "REPORT", entityType: "RISK", entityId: risk.id });
  const body = Buffer.from("%PDF-1.4\ncontenido de prueba");
  const upload = await fetch(`${base}/api/evidence/upload?${query}`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/pdf" }), body
  });
  assert.equal(upload.status, 201);
  const evidence = (await upload.json()).evidence;
  assert.equal(evidence.entityId, risk.id);
  assert.equal(evidence.evidenceType, "REPORT");
  assert.equal(evidence.file.bucket, "vera-evidence");
  assert.equal(evidence.file.size, body.length);
  assert.equal(uploaded, 1);

  const csv = Buffer.from("Control,Estado\nAcceso,Aprobado\nInventario,Pendiente\n");
  const csvUpload = await fetch(`${base}/api/evidence/upload?${query}`, {
    method: "POST", headers: auth(5, { "Content-Type": "text/csv" }), body: csv
  });
  assert.equal(csvUpload.status, 201);
  const csvResult = await csvUpload.json();
  assert.equal(csvResult.evidence.file.mime, "text/csv");
  assert.equal(csvResult.contentIndex.status, "ready");
  assert.equal(uploaded, 2);

  const docx = fs.readFileSync(path.join(__dirname, "fixtures", "sample-evidence.docx"));
  const docxUpload = await fetch(`${base}/api/evidence/upload?${query}`, {
    method: "POST", headers: auth(5, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }), body: docx
  });
  assert.equal(docxUpload.status, 201);
  const docxResult = await docxUpload.json();
  assert.equal(docxResult.evidence.file.mime, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(docxResult.contentIndex.status, "ready");
  assert.equal(uploaded, 3);

  const download = await fetch(`${base}/api/evidence/${evidence.id}/download`, { headers: auth(5) });
  assert.equal(download.status, 200);
  const signed = await download.json();
  assert.match(signed.url, /^https:\/\/supabase\.example\/storage\/v1\/object\/sign\/vera-evidence\//);
  assert.equal(signed.expiresIn, 60);
  assert.equal((await fetch(`${base}/api/evidence/${evidence.id}/download`)).status, 401);
  const content = await fetch(`${base}/api/evidence/${evidence.id}/content`, { headers: auth(5) });
  assert.equal(content.status, 200);
  assert.equal(content.headers.get("cache-control"), "private, no-store");
  assert.equal(content.headers.get("content-type"), "application/pdf");
  assert.equal(content.headers.get("x-vera-evidence-path"), evidence.file.path);
  assert.deepEqual(Buffer.from(await content.arrayBuffer()), body);
  assert.equal((await fetch(`${base}/api/evidence/${evidence.id}/content`)).status, 401);
  assert.equal((await fetch(`${base}/api/evidence`, { headers: auth(5) })).status, 200);

  const invalid = await fetch(`${base}/api/evidence/upload?${query}`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/pdf" }), body: "not a pdf"
  });
  assert.equal(invalid.status, 415);
  assert.equal(uploaded, 3);
  const tooLarge = await fetch(`${base}/api/evidence/upload?${query}`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/pdf" }),
    body: Buffer.alloc(3 * 1024 * 1024 + 1, 65)
  });
  assert.equal(tooLarge.status, 413);
  assert.equal(uploaded, 3);

  const revisionQuery = new URLSearchParams({ ...Object.fromEntries(query), revisionOf: evidence.id });
  const disabled = await fetch(`${base}/api/evidence/upload?${revisionQuery}`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/pdf" }), body
  });
  assert.equal(disabled.status, 503);
  process.env.VERA_EVIDENCE_VERSIONS_ENABLED = "true";
  const revision = await fetch(`${base}/api/evidence/upload?${revisionQuery}`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/pdf" }), body
  });
  assert.equal(revision.status, 201);
  const version2 = (await revision.json()).evidence;
  assert.equal(version2.previousVersionId, evidence.id);
  assert.equal(version2.versionRootId, evidence.id);
  assert.equal(version2.versionNumber, 2);
  assert.notEqual(version2.file.path, evidence.file.path);
  assert.equal((await fetch(`${base}/api/evidence/${evidence.id}/download`, { headers: auth(5) })).status, 200);
  const stale = await fetch(`${base}/api/evidence/upload?${revisionQuery}`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/pdf" }), body
  });
  assert.equal(stale.status, 409);
  const list = await fetch(`${base}/api/evidence`, { headers: auth(5) });
  const listed = (await list.json()).evidence;
  assert.ok(listed.some((item) => item.id === evidence.id));
  assert.ok(listed.some((item) => item.id === version2.id));

  process.env.VERA_RESUMABLE_UPLOADS_ENABLED = "true";
  const large = Buffer.from(`Registro,Estado\n${"Control,Revisado\n".repeat(20000)}`);
  assert.ok(large.length > 256 * 1024);
  const digest = createHash("sha256").update(large).digest("hex");
  const init = await fetch(`${base}/api/evidence/uploads`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/json" }),
    body: JSON.stringify({ ...Object.fromEntries(query), mime: "text/csv",
      size: large.length, sha256: digest })
  });
  assert.equal(init.status, 201);
  const session = await init.json();
  assert.equal(session.chunkSize, 256 * 1024);
  assert.deepEqual(session.received, []);
  assert.equal((await fetch(`${base}/api/evidence/uploads/${session.id}`)).status, 401);
  assert.equal((await fetch(`${base}/api/evidence/uploads/${session.id}`, { headers: auth(4) })).status, 404);
  const first = await fetch(`${base}/api/evidence/uploads/${session.id}/parts/0`, {
    method: "PUT", headers: auth(5, { "Content-Type": "application/octet-stream" }),
    body: large.subarray(0, session.chunkSize)
  });
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).received, [0]);
  const altered = Buffer.from(large.subarray(0, session.chunkSize));
  altered[0] ^= 1;
  const changed = await fetch(`${base}/api/evidence/uploads/${session.id}/parts/0`, {
    method: "PUT", headers: auth(5, { "Content-Type": "application/octet-stream" }), body: altered
  });
  assert.equal(changed.status, 409);
  const resumed = await fetch(`${base}/api/evidence/uploads/${session.id}`, { headers: auth(5) });
  assert.deepEqual((await resumed.json()).received, [0]);
  const premature = await fetch(`${base}/api/evidence/uploads/${session.id}/finish`, {
    method: "POST", headers: auth(5)
  });
  assert.equal(premature.status, 409);
  for (let index = 1; index < Math.ceil(large.length / session.chunkSize); index += 1) {
    const part = await fetch(`${base}/api/evidence/uploads/${session.id}/parts/${index}`, {
      method: "PUT", headers: auth(5, { "Content-Type": "application/octet-stream" }),
      body: large.subarray(index * session.chunkSize, (index + 1) * session.chunkSize)
    });
    assert.equal(part.status, 200);
  }
  const finished = await fetch(`${base}/api/evidence/uploads/${session.id}/finish`, {
    method: "POST", headers: auth(5)
  });
  assert.equal(finished.status, 200);
  const saved = (await finished.json()).evidence;
  assert.equal(saved.uploadSessionId, session.id);
  assert.equal(saved.file.size, large.length);
  const repeat = await fetch(`${base}/api/evidence/uploads/${session.id}/finish`, {
    method: "POST", headers: auth(5)
  });
  assert.equal((await repeat.json()).evidence.id, saved.id);
  assert.equal(chunks.size, 0);

  const staleStart = await fetch(`${base}/api/evidence/uploads`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/json" }),
    body: JSON.stringify({ ...Object.fromEntries(query), mime: "text/csv",
      size: large.length, sha256: digest })
  });
  const staleSession = await staleStart.json();
  const repository = require("../repositories/evidenceUploadRepository");
  const original = await repository.findById(staleSession.id);
  await repository.mutate(staleSession.id, { expiresAt: new Date(Date.now() - 1000).toISOString() },
    original.storageVersion);
  assert.equal((await fetch(`${base}/api/evidence/uploads/${staleSession.id}`, { headers: auth(5) })).status, 410);
  assert.equal((await fetch(`${base}/api/evidence/uploads/cleanup`)).status, 401);
  process.env.CRON_SECRET = "evidence-cleanup-secret";
  const cleanup = await fetch(`${base}/api/evidence/uploads/cleanup`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
  });
  assert.equal(cleanup.status, 200);
  assert.equal((await cleanup.json()).removed, 1);
  assert.equal(await repository.findById(staleSession.id), null);

  const directBody = (overrides = {}) => ({ ...Object.fromEntries(query),
    mime: "application/pdf", size: 3 * 1024 * 1024 + 1, ...overrides });
  const disabledDirect = await fetch(`${base}/api/evidence/uploads/direct`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/json" }),
    body: JSON.stringify(directBody())
  });
  assert.equal(disabledDirect.status, 503);

  process.env.VERA_LARGE_EVIDENCE_UPLOADS_ENABLED = "true";
  process.env.VERA_RESUMABLE_STORE = "supabase";
  process.env.VERA_EVIDENCE_COMMENT_STORE = "supabase";
  const directStart = await fetch(`${base}/api/evidence/uploads/direct`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/json" }),
    body: JSON.stringify(directBody())
  });
  assert.equal(directStart.status, 201);
  const directSession = await directStart.json();
  assert.equal(directSession.uploadMode, "tus");
  assert.equal(directSession.chunkSize, 6 * 1024 * 1024);
  assert.equal(directSession.size, 3 * 1024 * 1024 + 1);
  assert.match(directSession.endpoint, /^https:\/\/supabase\.example\/storage\/v1\/upload\/resumable$/);
  assert.equal(directSession.token, "test-tus-signature");
  assert.match(directSession.objectPath, /^risk\/.+\/[0-9a-f-]{36}\.pdf$/i);
  assert.equal((await fetch(`${base}/api/evidence/uploads/${directSession.id}`, {
    headers: auth(4)
  })).status, 404);
  const tooLargeDirect = await fetch(`${base}/api/evidence/uploads/direct`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/json" }),
    body: JSON.stringify(directBody({ size: 200 * 1024 * 1024 + 1 }))
  });
  assert.equal(tooLargeDirect.status, 413);
  const maxBoundaryResponse = await fetch(`${base}/api/evidence/uploads/direct`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/json" }),
    body: JSON.stringify(directBody({ size: 200 * 1024 * 1024 }))
  });
  assert.equal(maxBoundaryResponse.status, 201);
  const maxBoundary = await maxBoundaryResponse.json();
  assert.equal(maxBoundary.size, 200 * 1024 * 1024);
  tusObjects.set(maxBoundary.objectPath, { bytes: Buffer.from("pending"), mime: "application/pdf" });
  const maxBoundaryStored = await repository.findById(maxBoundary.id);
  await repository.mutate(maxBoundary.id, { expiresAt: new Date(Date.now() - 1000).toISOString() },
    maxBoundaryStored.storageVersion);

  const authorizeDirect = await fetch(`${base}/api/evidence/uploads/${directSession.id}/direct-authorize`, {
    method: "POST", headers: auth(5)
  });
  assert.equal(authorizeDirect.status, 200);
  assert.equal((await authorizeDirect.json()).token, "test-tus-signature");
  assert.equal((await fetch(`${base}/api/evidence/uploads/${directSession.id}/direct-authorize`, {
    method: "POST", headers: auth(4)
  })).status, 404);

  const validLargePdf = Buffer.alloc(directSession.size, 65);
  Buffer.from("%PDF-").copy(validLargePdf);
  tusObjects.set(directSession.objectPath, { bytes: validLargePdf, mime: "application/pdf" });
  const directFinish = await fetch(`${base}/api/evidence/uploads/${directSession.id}/direct-finish`, {
    method: "POST", headers: auth(5)
  });
  assert.equal(directFinish.status, 200);
  const directResult = await directFinish.json();
  assert.equal(directResult.evidence.file.size, directSession.size);
  assert.equal(directResult.evidence.file.path, directSession.objectPath);
  assert.equal(directResult.contentIndex.status, "too-large");
  const directList = await fetch(`${base}/api/evidence`, { headers: auth(5) });
  const directListed = (await directList.json()).evidence.find((item) => item.id === directResult.evidence.id);
  assert.equal(directListed.contentIndex.status, "too-large");
  const directRepeat = await fetch(`${base}/api/evidence/uploads/${directSession.id}/direct-finish`, {
    method: "POST", headers: auth(5)
  });
  assert.equal((await directRepeat.json()).evidence.id, directResult.evidence.id);

  const invalidDirectResponse = await fetch(`${base}/api/evidence/uploads/direct`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/json" }),
    body: JSON.stringify(directBody())
  });
  assert.equal(invalidDirectResponse.status, 201);
  const invalidDirect = await invalidDirectResponse.json();
  tusObjects.set(invalidDirect.objectPath, { bytes: Buffer.alloc(invalidDirect.size, 65), mime: "application/pdf" });
  const invalidDirectFinish = await fetch(`${base}/api/evidence/uploads/${invalidDirect.id}/direct-finish`, {
    method: "POST", headers: auth(5)
  });
  assert.equal(invalidDirectFinish.status, 415);
  assert.equal(tusObjects.has(invalidDirect.objectPath), false);
  assert.equal(await repository.findById(invalidDirect.id), null);

  const expiredDirectResponse = await fetch(`${base}/api/evidence/uploads/direct`, {
    method: "POST", headers: auth(5, { "Content-Type": "application/json" }),
    body: JSON.stringify(directBody({ size: 200 * 1024 * 1024 }))
  });
  assert.equal(expiredDirectResponse.status, 201);
  const expiredDirect = await expiredDirectResponse.json();
  tusObjects.set(expiredDirect.objectPath, { bytes: Buffer.from("pending"), mime: "application/pdf" });
  const expiredStored = await repository.findById(expiredDirect.id);
  await repository.mutate(expiredDirect.id, { expiresAt: new Date(Date.now() - 1000).toISOString() },
    expiredStored.storageVersion);
  const directCleanup = await fetch(`${base}/api/evidence/uploads/cleanup`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
  });
  assert.equal(directCleanup.status, 200);
  assert.equal((await directCleanup.json()).removed, 2);
  assert.equal(tusObjects.has(expiredDirect.objectPath), false);
  assert.equal(tusObjects.has(maxBoundary.objectPath), false);
  assert.equal(await repository.findById(expiredDirect.id), null);
  assert.equal(await repository.findById(maxBoundary.id), null);
});
