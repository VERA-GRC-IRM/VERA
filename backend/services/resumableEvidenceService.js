const { createHash, randomUUID } = require("node:crypto");
const sessions = require("../repositories/evidenceUploadRepository");
const evidenceRepository = require("../repositories/evidenceRepository");
const userRepository = require("../repositories/userRepository");
const evidenceStorage = require("./evidenceStorage");
const { parseEvidence } = require("./evidenceCreationService");
const { RECORD_CREATE_ROLES, PLANNING_APPROVE_ROLES } = require("../config/roles");
const { logActivity } = require("./auditLogger");
const notificationEvents = require("./notificationEventService");
const { findEntity } = require("./evidenceCreationService");
const { indexFile } = require("./evidenceContentService");
const { SEARCHABLE_MIME } = require("./evidenceTextExtraction");
const { IMAGE_MIME } = require("./azureVisionOcrService");
const evidenceIndexCoverage = require("../repositories/evidenceIndexCoverage");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message, status) => { const error = new Error(message); error.status = status; return error; };
const enabled = () => process.env.VERA_RESUMABLE_UPLOADS_ENABLED === "true" &&
  (!(process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") ||
    (process.env.VERA_RESUMABLE_STORE === "supabase" && process.env.VERA_EVIDENCE_COMMENT_STORE === "supabase"));

const requireEnabled = () => {
  if (!enabled()) throw fail("La carga reanudable aún no está habilitada.", 503);
};

const authorize = async (user, session) => {
  if (session.userId !== String(user.id)) throw fail("Carga no encontrada.", 404);
  if (!RECORD_CREATE_ROLES.includes(user.role)) throw fail("Tu rol no puede registrar evidencias.", 403);
  if (session.data.entityType === "AUDIT" && !PLANNING_APPROVE_ROLES.includes(user.role)) {
    throw fail("Tu rol no puede adjuntar archivos a auditorías.", 403);
  }
  const data = await parseEvidence(user, session.data);
  if (Date.parse(session.expiresAt) <= Date.now()) throw fail("La carga expiró. Inicia una nueva.", 410);
  return data;
};

const findSession = async (user, id) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw fail("Carga no encontrada.", 404);
  const session = await sessions.findById(id);
  if (!session) throw fail("Carga no encontrada.", 404);
  await authorize(user, session);
  return session;
};

const describe = (session) => ({ id: session.id, size: session.size, mime: session.mime,
  sha256: session.sha256, expiresAt: session.expiresAt,
  received: Object.keys(session.parts || {}).map(Number).sort((a, b) => a - b),
  chunkSize: evidenceStorage.CHUNK_BYTES });

const start = async (user, body = {}) => {
  requireEnabled();
  if (!RECORD_CREATE_ROLES.includes(user.role)) throw fail("Tu rol no puede registrar evidencias.", 403);
  if (body.entityType === "AUDIT" && !PLANNING_APPROVE_ROLES.includes(user.role)) {
    throw fail("Tu rol no puede adjuntar archivos a auditorías.", 403);
  }
  const mime = String(body.mime || "");
  const size = Number(body.size);
  if (!evidenceStorage.MIME_EXTENSIONS[mime]) throw fail("Tipo de archivo no permitido.", 415);
  if (!Number.isInteger(size) || size < 1 || size > evidenceStorage.MAX_BYTES) {
    throw fail("El archivo debe tener entre 1 byte y 3 MB.", 400);
  }
  if (!/^[0-9a-f]{64}$/i.test(body.sha256 || "")) throw fail("Huella de archivo no válida.", 400);
  const data = await parseEvidence(user, { ...body, reference: "Archivo privado almacenado en VERA" });
  const session = await sessions.create({ id: randomUUID(), userId: String(user.id), data,
    mime, size, sha256: body.sha256.toLowerCase(), parts: {},
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  return describe(session);
};

const status = async (user, id) => {
  requireEnabled();
  return describe(await findSession(user, id));
};

const putPart = async (user, id, index, bytes) => {
  requireEnabled();
  const partIndex = Number(index);
  let session = await findSession(user, id);
  const total = Math.ceil(session.size / evidenceStorage.CHUNK_BYTES);
  if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= total) {
    throw fail("Número de parte no válido.", 400);
  }
  const expectedSize = Math.min(evidenceStorage.CHUNK_BYTES,
    session.size - partIndex * evidenceStorage.CHUNK_BYTES);
  if (!Buffer.isBuffer(bytes)) throw fail("La parte debe ser binaria.", 400);
  const chunk = Buffer.from(bytes);
  if (chunk.length !== expectedSize) throw fail("Parte incompleta.", 400);
  const hash = sha256(chunk);
  const existing = session.parts?.[partIndex];
  if (existing) {
    if (existing !== hash) throw fail("La parte existente pertenece a otro archivo.", 409);
    return describe(session);
  }
  try { await evidenceStorage.uploadChunk(id, partIndex, session.mime, chunk); }
  catch (error) {
    // Un POST pudo terminar en Storage aunque se perdiera la respuesta.
    let saved;
    try { saved = await evidenceStorage.downloadChunk(id, partIndex, session.mime); }
    catch { throw error; }
    if (sha256(saved) !== hash) throw fail("La parte existente pertenece a otro archivo.", 409);
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    session = await findSession(user, id);
    if (session.parts?.[partIndex]) {
      if (session.parts[partIndex] !== hash) throw fail("La parte existente pertenece a otro archivo.", 409);
      return describe(session);
    }
    try {
      return describe(await sessions.mutate(id, { parts: { ...session.parts, [partIndex]: hash } },
        session.storageVersion));
    } catch (error) { if (error.status !== 409 || attempt === 3) throw error; }
  }
};

const complete = async (user, id) => {
  requireEnabled();
  const session = await findSession(user, id);
  const prior = (await evidenceRepository.getAll()).find((item) => item.uploadSessionId === id);
  if (prior) return { evidence: prior, contentIndex: { status: "unknown" } };
  const count = Math.ceil(session.size / evidenceStorage.CHUNK_BYTES);
  if (Object.keys(session.parts || {}).length !== count) throw fail("Faltan partes del archivo.", 409);
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const bytes = await evidenceStorage.downloadChunk(id, index, session.mime);
    if (sha256(bytes) !== session.parts[index]) throw fail("Una parte cambió durante la carga.", 409);
    parts.push(bytes);
  }
  const bytes = Buffer.concat(parts);
  if (bytes.length !== session.size || sha256(bytes) !== session.sha256) {
    throw fail("El archivo no coincide con la carga iniciada.", 409);
  }
  const data = await parseEvidence(user, session.data);
  const file = await evidenceStorage.upload({ entityType: data.entityType, entityId: data.entityId,
    mime: session.mime, bytes });
  const author = await userRepository.findById(user.id);
  let evidence;
  try {
    evidence = await evidenceRepository.create({ ...data, file, uploadSessionId: id,
      author: { id: user.id, username: user.username, name: author?.name || user.username,
        role: user.role } });
  } catch (error) {
    try { await evidenceStorage.remove(file); }
    catch (cleanupError) { console.error("[EVIDENCE_FILE_CLEANUP_FAILED]", cleanupError.message); }
    if (error.status === 409) {
      const committed = (await evidenceRepository.getAll()).find((item) => item.uploadSessionId === id);
      if (committed) return { evidence: committed, contentIndex: { status: "unknown" } };
    }
    throw error;
  }
  try { await logActivity({ actor: user, action: "EVIDENCE_FILE_UPLOADED", details: {
    evidenceId: evidence.id, entityType: data.entityType, entityId: data.entityId,
    size: file.size, mime: file.mime, resumed: true } }); }
  catch (error) { console.error("[EVIDENCE_AUDIT_PENDING]", error.message); }
  try {
    const entity = await findEntity(data.entityType, data.entityId);
    if (entity) await notificationEvents.evidenceCreated(evidence, entity);
  } catch (error) { console.error("[EVIDENCE_NOTIFICATION_PENDING]", error.message); }
  let contentIndex = { status: "unsupported", chunks: 0, truncated: false };
  if (SEARCHABLE_MIME.has(file.mime)) {
    try { contentIndex = await indexFile(evidence, bytes); }
    catch { contentIndex = { status: "pending", chunks: 0, truncated: false }; }
  } else if (IMAGE_MIME.has(file.mime)) contentIndex = { status: "pending", chunks: 0, truncated: false };
  try { await evidenceIndexCoverage.set(evidence.id, contentIndex); }
  catch { contentIndex.unavailable = true; }
  try { await evidenceStorage.removeChunks(id, count, session.mime); }
  catch (error) { console.error("[EVIDENCE_PART_CLEANUP_FAILED]", { id, reason: error.message }); }
  return { evidence, contentIndex };
};

const cleanupExpired = async () => {
  requireEnabled();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const expired = (await sessions.getAll({ created_at: `lt.${cutoff}` })).filter((session) =>
    Date.parse(session.expiresAt) <= Date.now()).slice(0, 30);
  let removed = 0;
  for (const session of expired) {
    try {
      await evidenceStorage.removeChunks(session.id,
        Math.ceil(session.size / evidenceStorage.CHUNK_BYTES), session.mime);
      await sessions.remove(session.id);
      removed += 1;
    } catch (error) {
      console.error("[EVIDENCE_EXPIRED_UPLOAD_CLEANUP_FAILED]", { id: session.id, reason: error.message });
    }
  }
  return { examined: expired.length, removed };
};

module.exports = { start, status, putPart, complete, cleanupExpired, describe, sha256 };
