const evidenceRepository = require("../repositories/evidenceRepository");
const userRepository = require("../repositories/userRepository");
const { logActivity } = require("../services/auditLogger");
const { ENTITY_TYPES, EVIDENCE_TYPES, findEntity, canAccessEntity,
  createEvidenceForUser } = require("../services/evidenceCreationService");
const evidenceStorage = require("../services/evidenceStorage");
const { indexFile, askEvidenceContent } = require("../services/evidenceContentService");
const { SEARCHABLE_MIME, makeChunks } = require("../services/evidenceTextExtraction");
const evidenceTextIndex = require("../repositories/evidenceTextIndex");
const evidenceIndexCoverage = require("../repositories/evidenceIndexCoverage");
const { IMAGE_MIME, extractImageText } = require("../services/azureVisionOcrService");
const { readiness } = require("../services/azureOpenAiService");

const text = (value) => String(value ?? "").trim();

const listEvidence = async (req, res) => {
  const { entityType, entityId, search } = req.query;
  const needle = text(search).toLowerCase();
  const items = [];
  const accessByEntity = new Map();
  for (const item of await evidenceRepository.getAll()) {
    if (entityType && item.entityType !== entityType) continue;
    if (entityId && item.entityId !== entityId) continue;
    if (needle && !`${item.title} ${item.description} ${item.reference} ${item.entityTitle}`.toLowerCase().includes(needle)) continue;
    const key = `${item.entityType}:${item.entityId}`;
    if (!accessByEntity.has(key)) accessByEntity.set(key,
      await canAccessEntity(item.entityType, item.entityId, req.user));
    if (accessByEntity.get(key)) items.push(item);
  }
  const fileIds = items.filter((item) => item.file).map((item) => item.id);
  try {
    const coverage = await evidenceIndexCoverage.getMany(fileIds);
    res.json({ evidence: items.map((item) => item.file ? { ...item,
      contentIndex: coverage.get(item.id) || { status: "unknown" } } : item) });
  } catch {
    res.json({ evidence: items.map((item) => item.file ? { ...item,
      contentIndex: { status: "unknown", unavailable: true } } : item),
    indexCoverageUnavailable: true });
  }
};

const createEvidence = async (req, res) => {
  try {
    const evidence = await createEvidenceForUser(req.user, req.body);
    return res.status(201).json({ evidence });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    throw error;
  }
};

const uploadEvidence = async (req, res) => {
  const title = text(req.query.title);
  const description = text(req.query.description);
  const evidenceType = text(req.query.evidenceType);
  const entityType = text(req.query.entityType);
  const entityId = text(req.query.entityId);
  const mime = text(req.headers["content-type"]).split(";")[0].toLowerCase();
  if (title.length < 3 || title.length > 120) return res.status(400).json({ message: "El nombre debe tener entre 3 y 120 caracteres." });
  if (description.length < 10 || description.length > 1000) return res.status(400).json({ message: "La descripción debe tener entre 10 y 1,000 caracteres." });
  if (!EVIDENCE_TYPES.includes(evidenceType)) return res.status(400).json({ message: "Selecciona un tipo de evidencia válido." });
  if (!ENTITY_TYPES.includes(entityType) || !entityId) return res.status(400).json({ message: "Selecciona un riesgo, control o auditoría." });
  if (!evidenceStorage.MIME_EXTENSIONS[mime]) return res.status(415).json({ message: "Tipo de archivo no permitido." });
  const entity = await findEntity(entityType, entityId);
  if (!entity || !await canAccessEntity(entityType, entityId, req.user)) {
    return res.status(404).json({ message: "El elemento relacionado no existe." });
  }
  const file = await evidenceStorage.upload({ entityType, entityId, mime, bytes: req.body });
  const author = await userRepository.findById(req.user.id);
  let evidence;
  try {
    evidence = await evidenceRepository.create({
      title, description, evidenceType,
      reference: "Archivo privado almacenado en VERA", entityType, entityId, entityTitle: entity.title,
      file, author: { id: req.user.id, username: req.user.username, name: author?.name || req.user.username, role: req.user.role }
    });
  } catch (error) {
    try { await evidenceStorage.remove(file); } catch (cleanupError) {
      console.error("[EVIDENCE_FILE_CLEANUP_FAILED]", cleanupError.message);
    }
    throw error;
  }
  await logActivity({ actor: req.user, action: "EVIDENCE_FILE_UPLOADED", details: {
    evidenceId: evidence.id, entityType, entityId, size: file.size, mime: file.mime
  } });
  let contentIndex = { status: "unsupported", chunks: 0, truncated: false };
  if (SEARCHABLE_MIME.has(file.mime)) {
    try { contentIndex = await indexFile(evidence, req.body); }
    catch { contentIndex = { status: "pending", chunks: 0, truncated: false }; }
  } else if (IMAGE_MIME.has(file.mime)) {
    contentIndex = { status: "pending", chunks: 0, truncated: false };
  }
  try { await evidenceIndexCoverage.set(evidence.id, contentIndex); }
  catch { contentIndex = { status: "unknown", chunks: 0, truncated: false, unavailable: true }; }
  res.status(201).json({ evidence, contentIndex });
};

const downloadEvidence = async (req, res) => {
  const evidence = await evidenceRepository.findById(req.params.id);
  if (!evidence?.file || !await canAccessEntity(evidence.entityType, evidence.entityId, req.user)) {
    return res.status(404).json({ message: "Archivo de evidencia no encontrado." });
  }
  const url = await evidenceStorage.signedDownloadUrl(evidence.file);
  res.set("Cache-Control", "no-store");
  res.json({ url, expiresIn: 60 });
};

const indexImageEvidence = async (req, res) => {
  const startedAt = Date.now();
  const evidence = await evidenceRepository.findById(req.params.id);
  if (!evidence?.file || !await canAccessEntity(evidence.entityType, evidence.entityId, req.user)) {
    return res.status(404).json({ message: "Archivo de evidencia no encontrado." });
  }
  if (!IMAGE_MIME.has(evidence.file.mime)) return res.status(415).json({ message: "Selecciona una imagen PNG, JPEG o WebP." });
  if ((process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") &&
      process.env.VERA_EVIDENCE_COMMENT_STORE !== "supabase") {
    return res.status(503).json({ message: "El OCR requiere evidencias persistentes en producción." });
  }
  if (!readiness().available) return res.status(503).json({ message: "El OCR requiere Azure OpenAI activo y un modelo con visión." });
  try {
    const existing = await evidenceTextIndex.get(evidence.id);
    if (existing.length) return res.set("Cache-Control", "no-store").json({ status: "ready", chunks: existing.length,
      cached: true, truncated: false, durationMs: Date.now() - startedAt, usage: null });
    const bytes = await evidenceStorage.downloadBytes(evidence.file);
    const ocr = await extractImageText(bytes, evidence.file.mime);
    const indexed = makeChunks([{ pageNumber: null, text: ocr.text }]);
    if (indexed.chunks.length) await evidenceTextIndex.replace(evidence.id, indexed.chunks);
    const contentIndex = { status: indexed.chunks.length ? "ready" : "no-text",
      chunks: indexed.chunks.length, truncated: ocr.truncated || indexed.truncated };
    try { await evidenceIndexCoverage.set(evidence.id, contentIndex); }
    catch { contentIndex.unavailable = true; }
    console.info(JSON.stringify({ event: "VERA_AI_IMAGE_OCR", status: 200, role: req.user.role,
      chunks: indexed.chunks.length, durationMs: Date.now() - startedAt,
      promptTokens: ocr.usage?.prompt_tokens ?? null, completionTokens: ocr.usage?.completion_tokens ?? null }));
    return res.set("Cache-Control", "no-store").json({ ...contentIndex, cached: false,
      durationMs: Date.now() - startedAt, usage: ocr.usage ? {
        promptTokens: ocr.usage.prompt_tokens ?? null, completionTokens: ocr.usage.completion_tokens ?? null
      } : null });
  } catch (error) {
    console.warn(JSON.stringify({ event: "VERA_AI_IMAGE_OCR_ERROR", status: error.status || 502,
      durationMs: Date.now() - startedAt }));
    return res.status(error.status === 415 || error.status === 503 ? error.status : 502)
      .json({ message: error.status ? error.message : "No se pudo extraer texto de la imagen." });
  }
};

const askEvidence = async (req, res) => {
  const startedAt = Date.now();
  const evidence = await evidenceRepository.findById(req.params.id);
  if (!evidence?.file || !await canAccessEntity(evidence.entityType, evidence.entityId, req.user)) {
    return res.status(404).json({ message: "Archivo de evidencia no encontrado." });
  }
  const question = req.body?.question;
  if (typeof question !== "string" || question.trim().length < 3 || question.length > 500) {
    return res.status(400).json({ message: "Escribe una pregunta de 3 a 500 caracteres." });
  }
  try {
    if ((process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") &&
        process.env.VERA_EVIDENCE_COMMENT_STORE !== "supabase") {
      return res.status(503).json({ message: "La consulta de archivos requiere evidencias persistentes." });
    }
    if (!readiness().available) return res.status(503).json({ message: "La consulta de archivos requiere Azure OpenAI activo." });
    const result = await askEvidenceContent(evidence, question.trim(), req.user.role);
    const durationMs = Date.now() - startedAt;
    console.info(JSON.stringify({ event: "VERA_AI_EVIDENCE", status: 200, role: req.user.role,
      mode: result.mode, durationMs, promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null }));
    return res.set("Cache-Control", "no-store").json({ ...result, durationMs,
      usage: result.usage ? { promptTokens: result.usage.prompt_tokens ?? null,
        completionTokens: result.usage.completion_tokens ?? null } : null });
  } catch (error) {
    console.warn(JSON.stringify({ event: "VERA_AI_EVIDENCE_ERROR", status: error.status || 502,
      durationMs: Date.now() - startedAt }));
    if ([415, 422, 503].includes(error.status)) return res.status(error.status).json({ message: error.message });
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({ message: "La consulta tardó demasiado. Intenta de nuevo." });
    }
    return res.status(502).json({ message: "No se pudo consultar el contenido de la evidencia." });
  }
};

module.exports = { listEvidence, createEvidence, uploadEvidence, downloadEvidence, askEvidence, indexImageEvidence };
