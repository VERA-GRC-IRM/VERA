const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { verifyToken } = require("../middleware/authMiddleware");
const { buildAssistantContext } = require("../services/assistantContextService");
const { readiness } = require("../services/azureOpenAiService");
const { answerAssistant } = require("../services/assistantAnswerService");
const { handleAssistantAction, isActionCommand, isCommitmentList } = require("../services/assistantActionService");
const { createAction } = require("../services/actionService");
const actionRepository = require("../repositories/actionRepository");
const { handleAssistantReport, parseReportRequest } = require("../services/assistantReportService");
const { handlePlanningTransition, isPlanningCommand } = require("../services/assistantPlanningService");
const { handleRiskEvaluation, isRiskCommand } = require("../services/assistantRiskEvaluationService");
const { handleControlEvaluation, isControlCommand } = require("../services/assistantControlEvaluationService");
const { handleCapabilityQuestion } = require("../services/assistantCapabilityService");
const { handleProposalCreate, isProposalCreateCommand } = require("../services/assistantProposalCreateService");
const { createProposalForUser } = require("../services/proposalService");
const { recoverCommittedCreation } = require("../services/assistantCreationRecovery");
const planningRepository = require("../repositories/planningRepository");
const { handleRiskCreate, isRiskCreateCommand } = require("../services/assistantRiskCreateService");
const { createRiskForUser } = require("../services/riskCreationService");
const riskRepository = require("../repositories/riskRepository");
const { handleControlCreate, isControlCreateCommand } = require("../services/assistantControlCreateService");
const { createControlForUser } = require("../services/controlCreationService");
const controlRepository = require("../repositories/controlRepository");
const { handleFindingCreate, isFindingCreateCommand } = require("../services/assistantFindingCreateService");
const { createFindingForUser } = require("../services/findingCreationService");
const findingRepository = require("../repositories/findingRepository");
const { handleFindingClose, isFindingCloseCommand } = require("../services/assistantFindingCloseService");
const { handleRoleRequest, isRoleRequestCommand } = require("../services/assistantRoleRequestService");
const { handleRoleReview, intent: isRoleReviewCommand } = require("../services/assistantRoleReviewService");
const { handleRecordEdit, isRecordEditCommand } = require("../services/assistantRecordEditService");
const { updateSingleFieldForUser } = require("../services/recordEditService");
const { handleNotification, intent: isNotificationCommand } = require("../services/assistantNotificationService");
const { changeReadStateForUser } = require("../services/notificationWorkflowService");
const { handleAuditDetails, intent: isAuditDetailsCommand } = require("../services/assistantAuditDetailsService");
const { handleAuditEdit, intent: isAuditEditCommand } = require("../services/assistantAuditEditService");
const { editAuditForUser } = require("../services/auditEditService");
const { handleUserDirectory, intent: isUserDirectoryCommand } = require("../services/assistantUserDirectoryService");
const { handleUserStatus, intent: isUserStatusCommand } = require("../services/assistantUserStatusService");
const { changeUserStatus } = require("../services/userStatusService");
const { reviewRoleRequestForUser } = require("../services/roleRequestService");
const roleRequestRepository = require("../repositories/roleRequestRepository");
const { handleProposalEdit, isProposalEditCommand } = require("../services/assistantProposalEditService");
const { handleEvidenceCreate, isEvidenceCreateCommand } = require("../services/assistantEvidenceCreateService");
const { createEvidenceForUser, createFileEvidenceForUser } = require("../services/evidenceCreationService");
const evidenceRepository = require("../repositories/evidenceRepository");
const { handleFileEvidence, isFileEvidenceCommand, sourceFor } = require("../services/assistantFileEvidenceService");
const { handleAuditComment, isAuditCommentCommand } = require("../services/assistantAuditCommentService");
const { createCommentForUser, findVisibleProposal } = require("../services/planningCommentService");
const commentRepository = require("../repositories/commentRepository");
const conversations = require("../repositories/assistantConversationRepository");
const projects = require("../repositories/assistantProjectRepository");
const memory = require("../repositories/assistantMemoryRepository");
const attachments = require("../repositories/assistantAttachmentRepository");
const evidenceStorage = require("../services/evidenceStorage");
const { extractEvidenceText, SEARCHABLE_MIME } = require("../services/evidenceTextExtraction");
const { askAttachment, IMAGE_MIME } = require("../services/assistantAttachmentService");
const { askProjectKnowledge, indexProjectFile } = require("../services/assistantProjectKnowledgeService");
const semanticIndex = require("../repositories/assistantSemanticIndexRepository");
const { embeddingConfiguration } = require("../services/azureEmbeddingService");
const { extractScannedPdf } = require("../services/assistantPdfOcrService");
const { currentScope } = require("../services/assistantConversationScope");
const { buildAuditDossier } = require("../services/assistantDossierService");
const { searchAssistantEvidence } = require("../services/assistantEvidenceSearchService");
const { buildDecisionInsights } = require("../services/assistantInsightService");
const { AUDIT_PROPOSAL_CREATE_ROLES, RECORD_CREATE_ROLES, ROLES } = require("../config/roles");
const { allowRoles } = require("../middleware/roleMiddleware");
const { buildProposalDraft } = require("../services/assistantProposalDraftService");
const { issueFeedbackToken, verifyFeedbackToken } = require("../services/assistantFeedbackToken");
const assistantFeedback = require("../repositories/assistantFeedbackRepository");
const userRepository = require("../repositories/userRepository");
const { randomUUID } = require("node:crypto");

const router = express.Router();
router.use(verifyToken);
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

router.get("/status", (req, res) => {
  try {
    res.json({ ...readiness(), mode: process.env.VERA_AI_CONVERSATIONS_ENABLED === "true" &&
      !req.user.roleTour && RECORD_CREATE_ROLES.includes(req.user.role)
      ? "consult-and-confirm" : "read-only",
      ...(process.env.VERA_AI_CONVERSATIONS_ENABLED === "true" && !req.user.roleTour
        ? { conversations: true,
          ...(process.env.VERA_AI_PROJECTS_ENABLED === "true" ? { projects: true } : {}),
          ...(process.env.VERA_AI_MEMORY_ENABLED === "true" ? { memory: true } : {}),
          ...(process.env.VERA_AI_ATTACHMENTS_ENABLED === "true" ? { attachments: true,
            ...(process.env.VERA_AI_PROJECTS_ENABLED === "true" &&
              process.env.VERA_AI_PROJECT_FILES_ENABLED === "true" ? { projectFiles: true,
                ...(process.env.VERA_AI_PROJECT_KNOWLEDGE_ENABLED === "true"
                  ? { projectKnowledge: true,
                    ...(embeddingConfiguration() ? { projectSemantic: true } : {}) } : {}) } : {}),
            ...(process.env.VERA_AI_PDF_OCR_ENABLED === "true" ? { pdfOcr: true } : {}) } : {}) } : {}) });
  } catch {
    res.json({ available: false, reason: "invalid-configuration", mode: "read-only" });
  }
});

const conversationEnabled = (req, res, next) => {
  if (req.user.roleTour) return res.status(403).json({ message: "El recorrido de rol no incluye conversaciones privadas." });
  return process.env.VERA_AI_CONVERSATIONS_ENABLED === "true"
    ? next() : res.status(503).json({ message: "El historial privado aún no está habilitado." });
};
const projectEnabled = (req, res, next) => process.env.VERA_AI_PROJECTS_ENABLED === "true"
  ? conversationEnabled(req, res, next)
  : res.status(503).json({ message: "Los proyectos privados aún no están habilitados." });
const memoryEnabled = (req, res, next) => process.env.VERA_AI_MEMORY_ENABLED === "true"
  ? conversationEnabled(req, res, next)
  : res.status(503).json({ message: "La memoria privada aún no está habilitada." });
const attachmentEnabled = (req, res, next) => process.env.VERA_AI_ATTACHMENTS_ENABLED === "true"
  ? conversationEnabled(req, res, next)
  : res.status(503).json({ message: "Los archivos privados del chat aún no están habilitados." });
const projectFilesEnabled = (req, res, next) => process.env.VERA_AI_PROJECT_FILES_ENABLED === "true" &&
  process.env.VERA_AI_ATTACHMENTS_ENABLED === "true" && process.env.VERA_AI_PROJECTS_ENABLED === "true"
  ? conversationEnabled(req, res, next)
  : res.status(503).json({ message: "La biblioteca privada del proyecto aún no está habilitada." });
const pdfOcrEnabled = (req, res, next) => process.env.VERA_AI_PDF_OCR_ENABLED === "true"
  ? next() : res.status(503).json({ message: "El OCR de PDF privados aún no está habilitado." });
const pdfOcrRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 2,
  keyGenerator: (req) => String(req.user.id), standardHeaders: "draft-8", legacyHeaders: false });
const conversationError = (res, error) => {
  if ([400, 403, 404, 409, 415, 422, 429, 503, 504].includes(error.status)) return res.status(error.status).json({ message: error.message });
  return res.status(502).json({ message: "No se pudo consultar el historial privado." });
};
const focusFrom = (value) => {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !["audit", "risk", "control", "finding"].includes(value.type) ||
      typeof value.id !== "string" || !value.id.trim() || value.id.length > 80) {
    const error = new Error("Selecciona un expediente válido."); error.status = 400; throw error;
  }
  return { type: value.type, id: value.id };
};

const projectIdFrom = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    const error = new Error("Selecciona un proyecto válido."); error.status = 400; throw error;
  }
  return value;
};
const validUuid = (value) => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

router.get("/conversations/:id/attachments", attachmentEnabled, async (req, res) => {
  try {
    if (!await conversations.get(req.user, req.params.id)) {
      return res.status(404).json({ message: "Conversación no disponible." });
    }
    return res.json({ attachments: await attachments.list(req.user, req.params.id) });
  } catch (error) { return conversationError(res, error); }
});

router.post("/conversations/:id/attachments", attachmentEnabled,
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 4, keyGenerator: (req) => String(req.user.id),
    standardHeaders: "draft-8", legacyHeaders: false }),
  express.raw({ type: () => true, limit: "2mb" }), async (req, res) => {
    const mime = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ message: "El cuerpo del archivo no es válido." });
    }
    const fileBytes = Buffer.from(req.body);
    let name;
    try { name = decodeURIComponent(String(req.headers["x-file-name"] || "")); }
    catch { return res.status(400).json({ message: "El nombre del archivo no es válido." }); }
    name = name.replace(/[\\/\x00-\x1f\x7f]/g, "").trim();
    if (!name || name.length > 120 || fileBytes.length === 0 ||
        fileBytes.length > 2 * 1024 * 1024 || !(SEARCHABLE_MIME.has(mime) || IMAGE_MIME.has(mime))) {
      return res.status(400).json({ message: "Adjunta un PDF, DOCX, TXT, CSV, PNG, JPEG o WebP de hasta 2 MB." });
    }
    try {
      if (!await conversations.get(req.user, req.params.id)) {
        return res.status(404).json({ message: "Conversación no disponible." });
      }
      if ((process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") &&
          process.env.VERA_EVIDENCE_COMMENT_STORE !== "supabase") {
        return res.status(503).json({ message: "Los archivos requieren almacenamiento privado persistente." });
      }
      if ((await attachments.list(req.user, req.params.id)).length >= attachments.MAX_PER_CONVERSATION ||
          await attachments.countForUser(req.user) >= attachments.MAX_PER_USER) {
        return res.status(409).json({ message: "Alcanzaste el límite de archivos del chat." });
      }
      let extracted = { chunks: [], status: "ready", truncated: false };
      if (SEARCHABLE_MIME.has(mime)) {
        try { extracted = await extractEvidenceText(fileBytes, mime); }
        catch (error) {
          const moduleMessage = String(error?.message || "");
          if (mime === "application/pdf") console.error(JSON.stringify({
            event: "VERA_AI_PDF_EXTRACT_FAILURE", error: error?.name || "unknown",
            code: error?.code || null,
            dependency: /@napi-rs\/canvas|pdfjs-dist|DOMMatrix|Path2D/.exec(moduleMessage)?.[0] || null,
            detail: error?.name === "Error" && /@napi-rs\/canvas|pdfjs-dist/.test(moduleMessage)
              ? moduleMessage.split("\n", 1)[0].slice(0, 260) : null
          }));
          return res.status(422).json({ message: "No se pudo extraer texto de este archivo." });
        }
      }
      const file = await evidenceStorage.upload({ entityType: "ai", entityId: req.params.id,
        mime, bytes: fileBytes });
      try {
        const saved = await attachments.create(req.user, req.params.id,
          { name, file, chunks: extracted.chunks, status: extracted.status, truncated: extracted.truncated });
        console.info(JSON.stringify({ event: "VERA_AI_ATTACHMENT", role: req.user.role,
          mime, bytes: file.size, chunks: extracted.chunks.length }));
        return res.status(201).json({ attachment: saved });
      } catch (error) {
        try { await evidenceStorage.remove(file); } catch { /* Cleanup may require operator review. */ }
        throw error;
      }
    } catch (error) { return conversationError(res, error); }
  });

router.get("/conversations/:id/attachments/:attachmentId/download", attachmentEnabled, async (req, res) => {
  try {
    if (!await conversations.get(req.user, req.params.id)) {
      return res.status(404).json({ message: "Conversación no disponible." });
    }
    const row = await attachments.get(req.user, req.params.id, req.params.attachmentId);
    if (!row) return res.status(404).json({ message: "Archivo no disponible." });
    const url = await evidenceStorage.signedDownloadUrl(row.file);
    return res.json({ url, expiresIn: 60 });
  } catch (error) { return conversationError(res, error); }
});

router.post("/conversations/:id/attachments/:attachmentId/ocr", attachmentEnabled,
  pdfOcrEnabled, pdfOcrRateLimit, async (req, res) => {
    try {
      if (!await conversations.get(req.user, req.params.id)) {
        return res.status(404).json({ message: "Conversación no disponible." });
      }
      const row = await attachments.get(req.user, req.params.id, req.params.attachmentId);
      if (!row) return res.status(404).json({ message: "Archivo no disponible." });
      if (row.file.mime !== "application/pdf" || row.status !== "no-text") {
        return res.status(409).json({ message: "Este archivo no requiere OCR de PDF." });
      }
      const extracted = await extractScannedPdf(await evidenceStorage.downloadBytes(row.file));
      const saved = await attachments.updateConversationExtraction(req.user, req.params.id, row.id, extracted);
      if (!saved) return res.status(409).json({ message: "El archivo cambió durante el OCR." });
      console.info(JSON.stringify({ event: "VERA_AI_PDF_OCR", role: req.user.role,
        pagesProcessed: extracted.pagesProcessed, totalPages: extracted.totalPages,
        chunks: saved.chunks, promptTokens: extracted.usage?.input_tokens ?? null,
        completionTokens: extracted.usage?.output_tokens ?? null }));
      return res.json({ attachment: saved });
    } catch (error) { return conversationError(res, error); }
  });

router.delete("/conversations/:id/attachments/:attachmentId", attachmentEnabled, async (req, res) => {
  try {
    if (!await conversations.get(req.user, req.params.id)) {
      return res.status(404).json({ message: "Conversación no disponible." });
    }
    const row = await attachments.get(req.user, req.params.id, req.params.attachmentId);
    if (!row) return res.status(404).json({ message: "Archivo no disponible." });
    await evidenceStorage.remove(row.file);
    await attachments.remove(req.user, req.params.id, row.id);
    return res.status(204).end();
  } catch (error) { return conversationError(res, error); }
});

router.get("/projects/:id/files", projectFilesEnabled, async (req, res) => {
  try {
    if (!await projects.get(req.user, req.params.id)) {
      return res.status(404).json({ message: "Proyecto no disponible." });
    }
    const files = await attachments.listProject(req.user, req.params.id);
    if (!embeddingConfiguration()) return res.json({ files });
    try {
      const indexed = await semanticIndex.status(req.user, req.params.id);
      return res.json({ files: files.map((file) => ({ ...file,
        semanticReady: file.chunks > 0 && indexed.get(file.id) === file.chunks })) });
    } catch {
      return res.json({ files: files.map((file) => ({ ...file, semanticReady: false,
        semanticUnavailable: true })),
        semanticUnavailable: true });
    }
  } catch (error) { return conversationError(res, error); }
});

router.post("/projects/:id/files/:fileId/semantic", projectFilesEnabled,
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, keyGenerator: (req) => String(req.user.id),
    standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
    try {
      if (!embeddingConfiguration()) return res.status(503).json({ message: "La búsqueda semántica no está habilitada." });
      if (!await projects.get(req.user, req.params.id)) {
        return res.status(404).json({ message: "Proyecto no disponible." });
      }
      const file = await attachments.getProject(req.user, req.params.id, req.params.fileId);
      if (!file) return res.status(404).json({ message: "Archivo no disponible." });
      const result = await indexProjectFile(req.user, req.params.id, file);
      console.info(JSON.stringify({ event: "VERA_AI_PROJECT_SEMANTIC_INDEX", role: req.user.role,
        chunks: result.chunks, alreadyIndexed: result.alreadyIndexed,
        promptTokens: result.usage?.prompt_tokens ?? null }));
      return res.json({ indexedChunks: result.chunks, alreadyIndexed: result.alreadyIndexed });
    } catch (error) {
      if (error.status === 502) return res.status(502).json({ message: error.message });
      return conversationError(res, error);
    }
  });

router.post("/projects/:id/files", projectFilesEnabled,
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 4, keyGenerator: (req) => String(req.user.id),
    standardHeaders: "draft-8", legacyHeaders: false }),
  express.raw({ type: () => true, limit: "2mb" }), async (req, res) => {
    const mime = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ message: "El cuerpo del archivo no es válido." });
    const fileBytes = Buffer.from(req.body);
    let name;
    try { name = decodeURIComponent(String(req.headers["x-file-name"] || "")); }
    catch { return res.status(400).json({ message: "El nombre del archivo no es válido." }); }
    name = name.replace(/[\\/\x00-\x1f\x7f]/g, "").trim();
    if (!name || name.length > 120 || fileBytes.length === 0 ||
        fileBytes.length > 2 * 1024 * 1024 || !(SEARCHABLE_MIME.has(mime) || IMAGE_MIME.has(mime))) {
      return res.status(400).json({ message: "Adjunta un PDF, DOCX, TXT, CSV, PNG, JPEG o WebP de hasta 2 MB." });
    }
    try {
      if (!await projects.get(req.user, req.params.id)) {
        return res.status(404).json({ message: "Proyecto no disponible." });
      }
      if ((process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") &&
          process.env.VERA_EVIDENCE_COMMENT_STORE !== "supabase") {
        return res.status(503).json({ message: "Los archivos requieren almacenamiento privado persistente." });
      }
      if ((await attachments.listProject(req.user, req.params.id)).length >= attachments.MAX_PER_PROJECT ||
          await attachments.countForUser(req.user) >= attachments.MAX_PER_USER) {
        return res.status(409).json({ message: "Alcanzaste el límite de archivos privados." });
      }
      let extracted = { chunks: [], status: "ready", truncated: false };
      if (SEARCHABLE_MIME.has(mime)) {
        try { extracted = await extractEvidenceText(fileBytes, mime); }
        catch { return res.status(422).json({ message: "No se pudo extraer texto de este archivo." }); }
      }
      const file = await evidenceStorage.upload({ entityType: "ai", entityId: req.params.id,
        mime, bytes: fileBytes });
      try {
        const saved = await attachments.createProject(req.user, req.params.id,
          { name, file, chunks: extracted.chunks, status: extracted.status, truncated: extracted.truncated });
        console.info(JSON.stringify({ event: "VERA_AI_PROJECT_FILE", role: req.user.role,
          mime, bytes: file.size, chunks: extracted.chunks.length }));
        return res.status(201).json({ file: saved });
      } catch (error) {
        try { await evidenceStorage.remove(file); } catch { /* Cleanup may require operator review. */ }
        throw error;
      }
    } catch (error) { return conversationError(res, error); }
  });

router.get("/projects/:id/files/:fileId/download", projectFilesEnabled, async (req, res) => {
  try {
    if (!await projects.get(req.user, req.params.id)) {
      return res.status(404).json({ message: "Proyecto no disponible." });
    }
    const row = await attachments.getProject(req.user, req.params.id, req.params.fileId);
    if (!row) return res.status(404).json({ message: "Archivo no disponible." });
    return res.json({ url: await evidenceStorage.signedDownloadUrl(row.file), expiresIn: 60 });
  } catch (error) { return conversationError(res, error); }
});

router.post("/projects/:id/files/:fileId/ocr", projectFilesEnabled,
  pdfOcrEnabled, pdfOcrRateLimit, async (req, res) => {
    try {
      if (!await projects.get(req.user, req.params.id)) {
        return res.status(404).json({ message: "Proyecto no disponible." });
      }
      const row = await attachments.getProject(req.user, req.params.id, req.params.fileId);
      if (!row) return res.status(404).json({ message: "Archivo no disponible." });
      if (row.file.mime !== "application/pdf" || row.status !== "no-text") {
        return res.status(409).json({ message: "Este archivo no requiere OCR de PDF." });
      }
      const extracted = await extractScannedPdf(await evidenceStorage.downloadBytes(row.file));
      const saved = await attachments.updateProjectExtraction(req.user, req.params.id, row.id, extracted);
      if (!saved) return res.status(409).json({ message: "El archivo cambió durante el OCR." });
      console.info(JSON.stringify({ event: "VERA_AI_PDF_OCR", role: req.user.role,
        pagesProcessed: extracted.pagesProcessed, totalPages: extracted.totalPages,
        chunks: saved.chunks, promptTokens: extracted.usage?.input_tokens ?? null,
        completionTokens: extracted.usage?.output_tokens ?? null }));
      return res.json({ file: saved });
    } catch (error) { return conversationError(res, error); }
  });

router.delete("/projects/:id/files/:fileId", projectFilesEnabled, async (req, res) => {
  try {
    if (!await projects.get(req.user, req.params.id)) {
      return res.status(404).json({ message: "Proyecto no disponible." });
    }
    const row = await attachments.getProject(req.user, req.params.id, req.params.fileId);
    if (!row) return res.status(404).json({ message: "Archivo no disponible." });
    await evidenceStorage.remove(row.file);
    await attachments.removeProject(req.user, req.params.id, row.id);
    semanticIndex.forget(row.id);
    return res.status(204).end();
  } catch (error) { return conversationError(res, error); }
});

router.get("/memories", memoryEnabled, async (req, res) => {
  try { return res.json({ memories: await memory.list(req.user) }); }
  catch (error) { return conversationError(res, error); }
});

router.post("/memories", memoryEnabled,
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, keyGenerator: (req) => String(req.user.id),
    standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
    const content = req.body?.content;
    if (typeof content !== "string" || !content.trim() || content.trim().length > 200) {
      return res.status(400).json({ message: "La nota debe tener entre 1 y 200 caracteres." });
    }
    try { return res.status(201).json({ memory: await memory.create(req.user, content.trim()) }); }
    catch (error) { return conversationError(res, error); }
  });

router.patch("/memories/:id", memoryEnabled, async (req, res) => {
  const { content, enabled, version } = req.body || {};
  if (typeof content !== "string" || !content.trim() || content.trim().length > 200 ||
      typeof enabled !== "boolean" || !Number.isInteger(version) || version < 1) {
    return res.status(400).json({ message: "La nota o la versión no son válidas." });
  }
  try {
    const updated = await memory.update(req.user, req.params.id, version,
      { content: content.trim(), enabled });
    if (!updated) return res.status(404).json({ message: "Nota no disponible." });
    return res.json({ memory: updated });
  } catch (error) { return conversationError(res, error); }
});

router.delete("/memories/:id", memoryEnabled, async (req, res) => {
  try {
    if (!await memory.remove(req.user, req.params.id)) {
      return res.status(404).json({ message: "Nota no disponible." });
    }
    return res.status(204).end();
  } catch (error) { return conversationError(res, error); }
});

router.get("/projects", projectEnabled, async (req, res) => {
  try { return res.json({ projects: await projects.list(req.user) }); }
  catch (error) { return conversationError(res, error); }
});

router.post("/projects", projectEnabled,
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, keyGenerator: (req) => String(req.user.id),
    standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
    const name = req.body?.name;
    const description = req.body?.description ?? "";
    const instructions = req.body?.instructions ?? "";
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80 ||
        typeof description !== "string" || description.length > 500 ||
        typeof instructions !== "string" || instructions.length > 800) {
      return res.status(400).json({ message: "El nombre, la descripción o las instrucciones no son válidos." });
    }
    try { return res.status(201).json({ project: await projects.create(req.user, name.trim(), description.trim(), instructions.trim()) }); }
    catch (error) { return conversationError(res, error); }
  });

router.patch("/projects/:id", projectEnabled, async (req, res) => {
  const { name, description, version } = req.body || {};
  const instructions = req.body?.instructions;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80 ||
      typeof description !== "string" || description.length > 500 ||
      (instructions !== undefined && (typeof instructions !== "string" || instructions.length > 800)) ||
      !Number.isInteger(version) || version < 1) {
    return res.status(400).json({ message: "El proyecto o la versión no son válidos." });
  }
  try {
    const project = await projects.update(req.user, req.params.id, version,
      { name: name.trim(), description: description.trim(),
        ...(instructions === undefined ? {} : { instructions: instructions.trim() }) });
    if (!project) return res.status(404).json({ message: "Proyecto no disponible." });
    return res.json({ project });
  } catch (error) { return conversationError(res, error); }
});

router.delete("/projects/:id", projectEnabled, async (req, res) => {
  try {
    if (!await projects.get(req.user, req.params.id)) {
      return res.status(404).json({ message: "Proyecto no disponible." });
    }
    if (process.env.VERA_AI_PROJECT_FILES_ENABLED === "true") {
      for (const item of await attachments.listProject(req.user, req.params.id)) {
        const stored = await attachments.getProject(req.user, req.params.id, item.id);
        await evidenceStorage.remove(stored.file);
        await attachments.removeProject(req.user, req.params.id, item.id);
        semanticIndex.forget(item.id);
      }
    }
    if (!await projects.remove(req.user, req.params.id)) {
      return res.status(404).json({ message: "Proyecto no disponible." });
    }
    await conversations.unlinkProject(req.user, req.params.id);
    return res.status(204).end();
  } catch (error) { return conversationError(res, error); }
});

router.get("/conversations", conversationEnabled, async (req, res) => {
  try { return res.json({ conversations: await conversations.list(req.user) }); }
  catch (error) { return conversationError(res, error); }
});

router.post("/conversations", conversationEnabled,
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: (req) => String(req.user.id),
    standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
    try {
      const focus = focusFrom(req.body?.focus);
      const projectId = projectIdFrom(req.body?.projectId);
      if (projectId && (process.env.VERA_AI_PROJECTS_ENABLED !== "true" ||
          !await projects.get(req.user, projectId))) {
        return res.status(404).json({ message: "Proyecto no disponible." });
      }
      const scopeHash = await currentScope(req.user, focus);
      const conversation = await conversations.create(req.user, focus, scopeHash, projectId);
      return res.status(201).json({ conversation: { ...conversation, scopeHash: undefined } });
    } catch (error) { return conversationError(res, error); }
  });

router.get("/conversations/:id", conversationEnabled, async (req, res) => {
  try {
    const conversation = await conversations.get(req.user, req.params.id);
    if (!conversation) return res.status(404).json({ message: "Conversación no disponible." });
    const scopeHash = await currentScope(req.user, conversation.focus);
    if (scopeHash !== conversation.scopeHash) return res.json({ conversation: {
      ...conversation, messages: [], scopeHash: undefined, stale: true } });
    return res.json({ conversation: { ...conversation, scopeHash: undefined, stale: false } });
  } catch (error) { return conversationError(res, error); }
});

router.patch("/conversations/:id", conversationEnabled, async (req, res) => {
  const title = req.body?.title;
  const version = req.body?.version;
  if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 80 ||
      !Number.isInteger(version) || version < 1) {
    return res.status(400).json({ message: "El nombre o la versión no son válidos." });
  }
  try {
    const conversation = await conversations.update(req.user, req.params.id, version, { title: title.trim() });
    if (!conversation) return res.status(404).json({ message: "Conversación no disponible." });
    return res.json({ conversation: { ...conversation, messages: undefined, scopeHash: undefined } });
  } catch (error) { return conversationError(res, error); }
});

router.patch("/conversations/:id/project", projectEnabled, async (req, res) => {
  if (!Number.isInteger(req.body?.version) || req.body.version < 1) {
    return res.status(400).json({ message: "La versión no es válida." });
  }
  try {
    const projectId = projectIdFrom(req.body?.projectId);
    if (projectId && !await projects.get(req.user, projectId)) {
      return res.status(404).json({ message: "Proyecto no disponible." });
    }
    const conversation = await conversations.update(req.user, req.params.id, req.body.version,
      { project_id: projectId });
    if (!conversation) return res.status(404).json({ message: "Conversación no disponible." });
    return res.json({ conversation: { ...conversation, messages: undefined, scopeHash: undefined } });
  } catch (error) { return conversationError(res, error); }
});

router.delete("/conversations/:id", conversationEnabled, async (req, res) => {
  try {
    if (!await conversations.get(req.user, req.params.id)) {
      return res.status(404).json({ message: "Conversación no disponible." });
    }
    if (process.env.VERA_AI_ATTACHMENTS_ENABLED === "true") {
      for (const row of await attachments.list(req.user, req.params.id)) {
        const stored = await attachments.get(req.user, req.params.id, row.id);
        await evidenceStorage.remove(stored.file);
        await attachments.remove(req.user, req.params.id, row.id);
      }
    }
    await conversations.remove(req.user, req.params.id);
    return res.status(204).end();
  } catch (error) { return conversationError(res, error); }
});

router.post("/conversations/:id/ask", conversationEnabled,
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: (req) => String(req.user.id),
    standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
    const question = req.body?.question;
    const withEvidence = req.body?.withEvidence === true;
    const attachmentId = req.body?.attachmentId ?? null;
    const useProjectFiles = req.body?.projectFiles === true;
    if (typeof question !== "string" || question.trim().length < 3 ||
        question.length > (withEvidence ? 500 : 800) ||
        (req.body?.withEvidence !== undefined && typeof req.body.withEvidence !== "boolean") ||
        (req.body?.projectFiles !== undefined && typeof req.body.projectFiles !== "boolean") ||
        (useProjectFiles && (attachmentId !== null || withEvidence ||
          process.env.VERA_AI_PROJECT_KNOWLEDGE_ENABLED !== "true" ||
          process.env.VERA_AI_PROJECT_FILES_ENABLED !== "true" ||
          process.env.VERA_AI_ATTACHMENTS_ENABLED !== "true" ||
          process.env.VERA_AI_PROJECTS_ENABLED !== "true")) ||
        (attachmentId !== null && (!validUuid(attachmentId) || withEvidence ||
          process.env.VERA_AI_ATTACHMENTS_ENABLED !== "true"))) {
      return res.status(400).json({ message: "Escribe una pregunta válida para esta conversación." });
    }
    const startedAt = Date.now();
    try {
      const thread = await conversations.get(req.user, req.params.id);
      if (!thread) return res.status(404).json({ message: "Conversación no disponible." });
      const scopeHash = await currentScope(req.user, thread.focus);
      if (scopeHash !== thread.scopeHash) return res.status(409).json({
        message: "Cambió el alcance de tus expedientes. Inicia una conversación nueva." });
      const history = thread.messages.slice(-6).map(({ role, text }) => ({ role, text: text.slice(0, 800) }));
      const attached = attachmentId ? await attachments.get(req.user, thread.id, attachmentId) ||
        (process.env.VERA_AI_PROJECT_FILES_ENABLED === "true" && thread.projectId
          ? await attachments.getProject(req.user, thread.projectId, attachmentId) : null) : null;
      if (attachmentId && !attached) return res.status(404).json({ message: "Archivo no disponible." });
      const project = thread.projectId ? await projects.get(req.user, thread.projectId) : null;
      if (useProjectFiles && !project) return res.status(404).json({ message: "Proyecto no disponible." });
      const projectFiles = useProjectFiles ? await attachments.listProject(req.user, thread.projectId) : [];
      const projectRows = useProjectFiles ? await Promise.all(projectFiles.map((item) =>
        attachments.getProject(req.user, thread.projectId, item.id))) : [];
      const prompt = question.trim();
      let result = null;
      if (isRoleReviewCommand(prompt)) result = await handleRoleReview(req.user, prompt, thread);
      if (isFileEvidenceCommand(prompt, thread)) {
        result = await handleFileEvidence(req.user, prompt, thread, attached);
      }
      if (!result && !attached && !useProjectFiles && !withEvidence) {
        // El orden es parte del contrato: una confirmación o comando reconocido nunca llega al modelo.
        const commands = [
          () => handleCapabilityQuestion(req.user, prompt, true),
          () => isRoleRequestCommand(prompt) ? handleRoleRequest(req.user, prompt, thread) : null,
          () => isProposalEditCommand(prompt) ? handleProposalEdit(req.user, prompt, thread) : null,
          () => isRecordEditCommand(prompt) ? handleRecordEdit(req.user, prompt, thread) : null,
          () => isNotificationCommand(prompt) ? handleNotification(req.user, prompt, thread) : null,
          () => isAuditDetailsCommand(prompt) ? handleAuditDetails(req.user, prompt, thread) : null,
          () => isAuditEditCommand(prompt) ? handleAuditEdit(req.user, prompt, thread) : null,
          () => isUserStatusCommand(prompt) ? handleUserStatus(req.user, prompt, thread) : null,
          () => isUserDirectoryCommand(prompt) ? handleUserDirectory(req.user, prompt, thread) : null,
          () => isProposalCreateCommand(prompt, thread) ? handleProposalCreate(req.user, prompt, thread) : null,
          () => isRiskCreateCommand(prompt, thread) ? handleRiskCreate(req.user, prompt, thread) : null,
          () => isControlCreateCommand(prompt, thread) ? handleControlCreate(req.user, prompt, thread) : null,
          () => isFindingCreateCommand(prompt, thread) ? handleFindingCreate(req.user, prompt, thread) : null,
          () => isFindingCloseCommand(prompt) ? handleFindingClose(req.user, prompt, thread) : null,
          () => isEvidenceCreateCommand(prompt, thread) ? handleEvidenceCreate(req.user, prompt, thread) : null,
          () => isAuditCommentCommand(prompt) ? handleAuditComment(req.user, prompt, thread) : null,
          () => isPlanningCommand(prompt, thread) ? handlePlanningTransition(req.user, prompt, thread) : null,
          () => isRiskCommand(prompt, thread) ? handleRiskEvaluation(req.user, prompt, thread) : null,
          () => isControlCommand(prompt) ? handleControlEvaluation(req.user, prompt, thread) : null,
          () => handleAssistantAction(req.user, prompt, thread),
          () => handleAssistantReport(req.user, prompt)
        ];
        for (const command of commands) {
          result = await command();
          if (result) break;
        }
      }
      if (!result) {
        result = attached ? await askAttachment(attached, prompt)
          : useProjectFiles ? await askProjectKnowledge(projectRows.filter(Boolean), thread.projectId, prompt,
            { user: req.user })
            : await answerAssistant(req.user, prompt, history, thread.focus, withEvidence,
              project?.instructions || "", thread.messages.at(-1)?.browse || null);
      }
      if (attached?.project_id) result.citations = (result.citations || []).map((citation) => ({
        ...citation, projectId: attached.project_id }));
      const currentUser = await userRepository.findById(req.user.id);
      const scopeAfter = await currentScope(req.user, thread.focus);
      if (currentUser?.status !== "ACTIVE" || currentUser.role !== req.user.role ||
          (result.mode !== "action-executed" && scopeAfter !== scopeHash)) {
        return res.status(409).json({ message: "Cambió tu acceso. Inicia una conversación nueva." });
      }
      if (result.mode === "action-pending") return res.status(409).json({ message: result.answer });
      const durationMs = Date.now() - startedAt;
      const userMessage = { id: randomUUID(), role: "user", text: question.trim(), asOf: new Date().toISOString(),
        ...(attached ? { attachmentId: attached.id, attachmentName: attached.name } : {}),
        ...(useProjectFiles ? { attachmentName: "Biblioteca del proyecto" } : {}) };
      const assistantMessage = { id: randomUUID(), role: "assistant", text: result.answer.slice(0, 4000),
        mode: result.mode, metric: result.metric || null, citations: (result.citations || []).slice(0, 8),
        references: (result.references || []).slice(0, 15), coverage: result.coverage || null,
        ...(result.roleReviewBrowse ? { roleReviewBrowse: result.roleReviewBrowse } : {}),
        ...(result.notificationBrowse ? { notificationBrowse: result.notificationBrowse } : {}),
        ...(result.auditDetailsBrowse ? { auditDetailsBrowse: result.auditDetailsBrowse } : {}),
        ...(result.userDirectoryBrowse ? { userDirectoryBrowse: result.userDirectoryBrowse } : {}),
        asOf: result.asOf, durationMs,
        ...(result.browse ? { browse: result.browse } : {}),
        ...(result.actionDraft ? { actionDraft: result.actionDraft } : {}),
        ...(result.actionOutcome ? { actionOutcome: result.actionOutcome } : {}) };
      const messages = [...thread.messages, userMessage, assistantMessage].slice(-40);
      while (Buffer.byteLength(JSON.stringify(messages), "utf8") > 140_000 && messages.length > 2) {
        messages.splice(0, 2);
      }
      if (result.mode === "action-reservation" && result.actionCreate?.type === "ACTION_CREATE") {
        const draft = result.actionCreate;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "ACTION_CREATE", operationId: draft.operationId,
          createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let createdAction = null;
        let executionError = null;
        try {
          createdAction = await createAction(req.user, draft, { operationId: draft.operationId });
        } catch (error) {
          createdAction = await recoverCommittedCreation(error, actionRepository, draft.operationId,
            () => createAction(req.user, draft, { operationId: draft.operationId }));
          if (!createdAction) executionError = error;
        }
        const finalMessage = { ...assistantMessage,
          mode: createdAction ? "action-executed" : "action-guidance",
          text: createdAction
            ? `Quedó creado el compromiso «${createdAction.title}» con identificador ${createdAction.id}, asignado a ${createdAction.assigneeName}.`
            : `No se creó el compromiso: ${executionError?.message || "no se pudo confirmar la operación"}. Solicita una vista previa nueva.`,
          ...(createdAction ? { actionOutcome: { id: createdAction.id, status: createdAction.status } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: createdAction ? await currentScope(req.user, thread.focus) : scopeHash });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_ACTION_HISTORY_STALE", operationId: draft.operationId }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_ACTION_CREATE", role: req.user.role,
          success: Boolean(createdAction), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.proposalCreate?.type === "PROPOSAL_CREATE") {
        const draft = result.proposalCreate;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "PROPOSAL_CREATE", operationId: draft.operationId,
          createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let proposal = null;
        let executionError = null;
        try {
          proposal = await createProposalForUser(req.user, draft.data, draft.operationId);
        } catch (error) {
          proposal = await recoverCommittedCreation(error, planningRepository, draft.operationId,
            () => createProposalForUser(req.user, draft.data, draft.operationId));
          if (!proposal) executionError = error;
        }
        const finalMessage = { ...assistantMessage,
          mode: proposal ? "action-executed" : "action-guidance",
          text: proposal
            ? `Quedó creada la propuesta «${proposal.title}» con identificador ${proposal.id}. Está abierta para revisión.`
            : `No se creó la propuesta: ${executionError?.message || "no se pudo confirmar la operación"}. Solicita una vista previa nueva.`,
          ...(proposal ? { actionOutcome: { id: proposal.id, status: proposal.status } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: proposal ? await currentScope(req.user, thread.focus) : scopeHash });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_PROPOSAL_HISTORY_STALE", operationId: draft.operationId }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_PROPOSAL_CREATE", role: req.user.role,
          success: Boolean(proposal), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.riskCreate?.type === "RISK_CREATE") {
        const draft = result.riskCreate;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "RISK_CREATE", operationId: draft.operationId,
          createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let risk = null;
        let executionError = null;
        try {
          risk = await createRiskForUser(req.user, draft.data, draft.operationId);
        } catch (error) {
          risk = await recoverCommittedCreation(error, riskRepository, draft.operationId,
            () => createRiskForUser(req.user, draft.data, draft.operationId));
          if (!risk) executionError = error;
        }
        const finalMessage = { ...assistantMessage,
          mode: risk ? "action-executed" : "action-guidance",
          text: risk
            ? `Quedó registrado el riesgo «${risk.title}» con identificador ${risk.id} y nivel ${risk.level}.`
            : `No se registró el riesgo: ${executionError?.message || "no se pudo confirmar la operación"}. Solicita una vista previa nueva.`,
          ...(risk ? { actionOutcome: { id: risk.id, status: risk.status } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: risk ? await currentScope(req.user, thread.focus) : scopeHash });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_RISK_HISTORY_STALE", operationId: draft.operationId }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_RISK_CREATE", role: req.user.role,
          success: Boolean(risk), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.controlCreate?.type === "CONTROL_CREATE") {
        const draft = result.controlCreate;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "CONTROL_CREATE", operationId: draft.operationId,
          createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let control = null;
        let executionError = null;
        try {
          control = await createControlForUser(req.user, draft.data, draft.operationId);
        } catch (error) {
          control = await recoverCommittedCreation(error, controlRepository, draft.operationId,
            () => createControlForUser(req.user, draft.data, draft.operationId));
          if (!control) executionError = error;
        }
        const finalMessage = { ...assistantMessage,
          mode: control ? "action-executed" : "action-guidance",
          text: control
            ? `Quedó registrado el control «${control.title}» con identificador ${control.id}, relacionado con ${control.riskIds.join(", ")}.`
            : `No se registró el control: ${executionError?.message || "no se pudo confirmar la operación"}. Solicita una vista previa nueva.`,
          ...(control ? { actionOutcome: { id: control.id, status: control.status } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: control ? await currentScope(req.user, thread.focus) : scopeHash });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_CONTROL_HISTORY_STALE", operationId: draft.operationId }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_CONTROL_CREATE", role: req.user.role,
          success: Boolean(control), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.findingCreate?.type === "FINDING_CREATE") {
        const draft = result.findingCreate;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "FINDING_CREATE", operationId: draft.operationId,
          createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let finding = null;
        let executionError = null;
        try {
          finding = await createFindingForUser(req.user, draft.data, draft.operationId,
            draft.controlEvaluationVersion);
        } catch (error) {
          finding = await recoverCommittedCreation(error, findingRepository, draft.operationId,
            () => createFindingForUser(req.user, draft.data, draft.operationId,
              draft.controlEvaluationVersion));
          if (!finding) executionError = error;
        }
        const finalMessage = { ...assistantMessage,
          mode: finding ? "action-executed" : "action-guidance",
          text: finding
            ? `Quedó registrado el hallazgo «${finding.title}» con identificador ${finding.id}, asociado al control ${finding.controlId} y al riesgo ${finding.riskId}.`
            : `No se registró el hallazgo: ${executionError?.message || "no se pudo confirmar la operación"}. Solicita una vista previa nueva.`,
          ...(finding ? { actionOutcome: { id: finding.id, status: finding.status } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: finding ? await currentScope(req.user, thread.focus) : scopeHash });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_FINDING_HISTORY_STALE", operationId: draft.operationId }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_FINDING_CREATE", role: req.user.role,
          success: Boolean(finding), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.evidenceCreate?.type === "EVIDENCE_CREATE") {
        const draft = result.evidenceCreate;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "EVIDENCE_CREATE", operationId: draft.operationId,
          data: draft.data, createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let evidence = null;
        let executionError = null;
        try {
          evidence = await createEvidenceForUser(req.user, draft.data, draft.operationId);
        } catch (error) {
          evidence = await recoverCommittedCreation(error, evidenceRepository, draft.operationId,
            () => createEvidenceForUser(req.user, draft.data, draft.operationId));
          if (!evidence) executionError = error;
        }
        const finalMessage = { ...assistantMessage,
          mode: evidence ? "action-executed" : "action-guidance",
          text: evidence
            ? `Quedó registrada la evidencia «${evidence.title}» con identificador ${evidence.id}, relacionada con ${evidence.entityType} ${evidence.entityId}.`
            : `No se registró la evidencia: ${executionError?.message || "no se pudo confirmar la operación"}. Solicita una vista previa nueva.`,
          ...(evidence ? { actionOutcome: { id: evidence.id } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: evidence ? await currentScope(req.user, thread.focus) : scopeHash });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_EVIDENCE_HISTORY_STALE", operationId: draft.operationId }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_EVIDENCE_CREATE", role: req.user.role,
          success: Boolean(evidence), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.fileEvidenceCreate?.type === "FILE_EVIDENCE_CREATE") {
        const draft = result.fileEvidenceCreate;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "FILE_EVIDENCE_CREATE", operationId: draft.operationId,
          data: draft.data, createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let evidence = null;
        let executionError = null;
        try {
          const sourceFile = await sourceFor(req.user, thread, draft.source);
          evidence = await createFileEvidenceForUser(req.user, draft.data, sourceFile, draft.operationId);
        } catch (error) {
          evidence = await recoverCommittedCreation(error, evidenceRepository, draft.operationId,
            async () => createFileEvidenceForUser(req.user, draft.data,
              await sourceFor(req.user, thread, draft.source), draft.operationId));
          if (!evidence) executionError = error;
        }
        const finalMessage = { ...assistantMessage,
          mode: evidence ? "action-executed" : "action-guidance",
          text: evidence
            ? `El archivo quedó registrado como evidencia ${evidence.id} en ${evidence.entityType} ${evidence.entityId}. La copia privada se conserva aunque elimines el adjunto del chat.`
            : `No se registró el archivo como evidencia: ${executionError?.message || "no se pudo confirmar la operación"}. Pide una vista previa nueva.`,
          ...(evidence ? { actionOutcome: { id: evidence.id } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: evidence ? await currentScope(req.user, thread.focus) : scopeHash });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_FILE_EVIDENCE_HISTORY_STALE", operationId: draft.operationId }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_FILE_EVIDENCE_CREATE", role: req.user.role,
          success: Boolean(evidence), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.roleReview?.type === "ROLE_REVIEW") {
        const draft = result.roleReview;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "ROLE_REVIEW", requestId: draft.requestId,
          userId: draft.userId, approve: draft.approve, createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let reviewed = null;
        let executionError = null;
        try { reviewed = await reviewRoleRequestForUser(req.user, draft.requestId, draft.approve, draft.targetRole); }
        catch (error) {
          const mine = await roleRequestRepository.listMine(draft.userId);
          reviewed = mine.find((item) => item.id === draft.requestId && item.reviewedBy === req.user.id &&
            item.status === (draft.approve ? "APPROVED" : "REJECTED")) || null;
          if (!reviewed) executionError = error;
        }
        const finalMessage = { ...assistantMessage,
          mode: reviewed ? "action-executed" : "action-guidance",
          text: reviewed ? `La solicitud de rol #${draft.requestId} quedó ${draft.approve ? "aprobada" : "rechazada"}. La cuenta afectada deberá iniciar sesión de nuevo para usar los permisos vigentes.`
            : `No se confirmó la revisión: ${executionError?.message || "estado desconocido"}. Consulta las solicitudes pendientes antes de intentar otra decisión.`,
          ...(reviewed ? { actionOutcome: { id: draft.requestId, status: reviewed.status } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: await currentScope(req.user, thread.focus) });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_ROLE_REVIEW_HISTORY_STALE", requestId: draft.requestId }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_ROLE_REVIEW", role: req.user.role,
          success: Boolean(reviewed), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.recordEdit?.type === "RECORD_EDIT") {
        const draft = result.recordEdit;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "RECORD_EDIT", entityType: draft.entityType,
          entityId: draft.entityId, operationId: draft.operationId, createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        const repo = draft.entityType === "RISK" ? riskRepository : controlRepository;
        let updated = null;
        let executionError = null;
        try {
          updated = await updateSingleFieldForUser(req.user, draft.entityType, draft.entityId,
            draft.field, draft.value, draft.reason, draft.expected, draft.operationId);
        } catch (error) {
          const current = await repo.findById(draft.entityId);
          if (current?.aiEditOperationId === draft.operationId) updated = current;
          else executionError = error;
        }
        const finalMessage = { ...assistantMessage,
          mode: updated ? "action-executed" : "action-guidance",
          text: updated ? `Quedó actualizada la ${draft.entityType === "RISK" ? "información del riesgo" : "información del control"} ${updated.id}. El motivo quedó en la bitácora.`
            : `No se confirmó la edición: ${executionError?.message || "estado desconocido"}. Revisa el registro y prepara otra vista previa.`,
          ...(updated ? { actionOutcome: { id: updated.id } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: await currentScope(req.user, thread.focus) });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_RECORD_EDIT_HISTORY_STALE", operationId: draft.operationId }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_RECORD_EDIT", entityType: draft.entityType,
          role: req.user.role, success: Boolean(updated), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.userStatus?.type === "USER_STATUS") {
        const draft = result.userStatus;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "USER_STATUS", id: draft.id,
          operationId: draft.operationId, createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let changed = null;
        let executionError = null;
        try {
          changed = await changeUserStatus(req.user, draft.id, draft.active,
            { status: draft.expectedStatus, version: draft.expectedVersion, reason: draft.reason });
        } catch (error) { executionError = error; }
        const finalMessage = { ...assistantMessage,
          mode: changed ? "action-executed" : "action-guidance",
          text: changed ? `La cuenta #${changed.id} quedó ${draft.active ? "habilitada" : "deshabilitada"}. El cambio se registró en la bitácora.`
            : `No se confirmó el cambio: ${executionError?.message || "estado desconocido"}. Consulta el directorio y prepara otra vista previa.`,
          ...(changed ? { actionOutcome: { id: changed.id, status: changed.status } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: await currentScope(req.user, thread.focus) });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_USER_STATUS_HISTORY_STALE", id: draft.id }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_USER_STATUS", role: req.user.role,
          success: Boolean(changed), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.auditEdit?.type === "AUDIT_EDIT") {
        const draft = result.auditEdit;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "AUDIT_EDIT", id: draft.id,
          operationId: draft.operationId, createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let updated = null;
        let executionError = null;
        try {
          updated = await editAuditForUser(req.user, draft.id, { [draft.field]: draft.value },
            { expected: draft.expected, reason: draft.reason, operationId: draft.operationId });
        } catch (error) {
          const current = await planningRepository.findById(draft.id);
          if (current?.aiEditOperationId === draft.operationId) updated = { audit: current };
          else executionError = error;
        }
        const finalMessage = { ...assistantMessage,
          mode: updated ? "action-executed" : "action-guidance",
          text: updated ? `La auditoría ${updated.audit.id} quedó actualizada. El motivo y el campo modificado están en la bitácora.`
            : `No se confirmó la edición: ${executionError?.message || "estado desconocido"}. Revisa el expediente y prepara otra vista previa.`,
          ...(updated ? { actionOutcome: { id: updated.audit.id } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: await currentScope(req.user, thread.focus) });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_AUDIT_EDIT_HISTORY_STALE", id: draft.id }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_AUDIT_EDIT", role: req.user.role,
          success: Boolean(updated), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.notificationRead?.type === "NOTIFICATION_READ") {
        const draft = result.notificationRead;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "NOTIFICATION_READ", id: draft.id,
          read: draft.read, createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let outcome = null;
        let executionError = null;
        try {
          outcome = await changeReadStateForUser(req.user, draft.id, draft.read,
            { expectedReadAt: draft.expectedReadAt });
        } catch (error) { executionError = error; }
        const finalMessage = { ...assistantMessage,
          mode: outcome ? "action-executed" : "action-guidance",
          text: outcome ? `El aviso ${outcome.notificationId} quedó ${draft.read ? "leído" : "sin leer"}. La tarea sigue pendiente hasta completarla.`
            : `No se cambió la lectura: ${executionError?.message || "estado desconocido"}. Consulta los avisos y prepara otra vista previa.`,
          ...(outcome ? { actionOutcome: { id: outcome.notificationId } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: await currentScope(req.user, thread.focus) });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_NOTIFICATION_HISTORY_STALE", id: draft.id }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_NOTIFICATION_READ", role: req.user.role,
          success: Boolean(outcome), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      if (result.mode === "action-reservation" && result.auditComment?.type === "AUDIT_COMMENT") {
        const draft = result.auditComment;
        assistantMessage.mode = "action-reserved";
        assistantMessage.actionReservation = { type: "AUDIT_COMMENT", proposalId: draft.proposalId,
          operationId: draft.operationId, createdAt: new Date().toISOString() };
        const reserved = await conversations.update(req.user, thread.id, thread.version, { messages });
        let comment = null;
        let executionError = null;
        try {
          comment = await createCommentForUser(req.user, draft.proposalId, { text: draft.text }, draft.operationId);
        } catch (error) {
          const existing = (await commentRepository.listByProposal(draft.proposalId))
            .find((item) => item.aiOperationId === draft.operationId);
          if (existing) { await findVisibleProposal(req.user, existing.proposalId); comment = existing; }
          if (!comment) executionError = error;
        }
        const finalMessage = { ...assistantMessage,
          mode: comment ? "action-executed" : "action-guidance",
          text: comment
            ? `Quedó registrado el comentario ${comment.id} en el expediente ${comment.proposalId}.`
            : `No se registró el comentario: ${executionError?.message || "no se pudo confirmar la operación"}. Pide una vista previa nueva.`,
          ...(comment ? { actionOutcome: { id: comment.id } } : {}) };
        delete finalMessage.actionReservation;
        let saved = reserved;
        let historySaved = false;
        try {
          saved = await conversations.update(req.user, thread.id, reserved.version,
            { messages: [...messages.slice(0, -1), finalMessage],
              scope_hash: comment ? await currentScope(req.user, thread.focus) : scopeHash });
          historySaved = true;
        } catch {
          console.warn(JSON.stringify({ event: "VERA_AI_COMMENT_HISTORY_STALE", operationId: draft.operationId }));
        }
        console.info(JSON.stringify({ event: "VERA_AI_COMMENT_CREATE", role: req.user.role,
          success: Boolean(comment), durationMs: Date.now() - startedAt }));
        return res.json({ conversationId: thread.id, version: saved.version, userMessage,
          message: finalMessage, historySaved });
      }
      const updated = await conversations.update(req.user, thread.id, thread.version,
        { messages, scope_hash: result.mode === "action-executed" ? scopeAfter : scopeHash });
      const channel = withEvidence ? "evidence-search" : "ask";
      const feedbackToken = issueFeedbackToken(req.user, channel, result.mode);
      console.info(JSON.stringify({ event: "VERA_AI_CONVERSATION", role: req.user.role,
        mode: result.mode, durationMs, promptTokens: result.usage?.prompt_tokens ?? null,
        completionTokens: result.usage?.completion_tokens ?? null }));
      return res.json({ conversationId: thread.id, version: updated.version, userMessage,
        ...(result.downloadCsv ? { downloadCsv: result.downloadCsv } : {}),
        ...(result.downloadFromReportEndpoint ? { downloadFromReportEndpoint: true } : {}),
        message: { ...assistantMessage, feedbackToken }, usage: result.usage ? {
          promptTokens: result.usage.prompt_tokens ?? null,
          completionTokens: result.usage.completion_tokens ?? null } : null });
    } catch (error) { return conversationError(res, error); }
  });

router.get("/brief", async (req, res) => {
  try {
    if (readiness().reason === "persistent-stores-required") {
      return res.status(503).json({ message: "Las prioridades requieren almacenes persistentes en producción." });
    }
    const { brief, coverage } = await buildAssistantContext(req.user, "prioridades de mi portafolio");
    return res.json({ role: req.user.role,
      signals: coverage.pendingActionsUnavailable ? brief.filter((item) => item.key !== "urgentPending") : brief,
      pendingActionsUnavailable: coverage.pendingActionsUnavailable });
  } catch {
    return res.status(502).json({ message: "No se pudieron consultar las prioridades." });
  }
});

router.get("/insights", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30,
  keyGenerator: (req) => String(req.user.id), standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
  try {
    if (readiness().reason === "persistent-stores-required") {
      return res.status(503).json({ message: "Las prioridades requieren almacenes persistentes en producción." });
    }
    const { visibleRecords, asOf } = await buildAssistantContext(req.user, "prioridades de mi portafolio");
    return res.json(buildDecisionInsights({ visibleRecords, asOf }));
  } catch {
    return res.status(502).json({ message: "No se pudieron calcular las prioridades." });
  }
});

router.post("/draft-proposal", rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  keyGenerator: (req) => String(req.user.id), standardHeaders: "draft-8", legacyHeaders: false }),
allowRoles(...AUDIT_PROPOSAL_CREATE_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const riskId = req.body?.riskId;
  if (typeof riskId !== "string" || !riskId.trim() || riskId.length > 80) {
    return res.status(400).json({ message: "Selecciona un riesgo válido para el borrador." });
  }
  try {
    const state = readiness();
    if (state.reason === "persistent-stores-required") {
      return res.status(503).json({ message: "El borrador requiere almacenes persistentes en producción." });
    }
    const result = await buildProposalDraft(req.user, riskId, { generate: state.available });
    console.info(JSON.stringify({ event: "VERA_AI_PROPOSAL_DRAFT", status: 200, role: req.user.role,
      mode: result.mode, durationMs: Date.now() - startedAt }));
    return res.json(result);
  } catch (error) {
    if ([400, 403, 404].includes(error.status)) return res.status(error.status).json({ message: error.message });
    console.warn(JSON.stringify({ event: "VERA_AI_PROPOSAL_DRAFT_ERROR", status: 502,
      durationMs: Date.now() - startedAt }));
    return res.status(502).json({ message: "No se pudo preparar el borrador." });
  }
});

router.post("/feedback", rateLimit({ windowMs: 15 * 60 * 1000, limit: 20,
  keyGenerator: (req) => String(req.user.id), standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
  if (typeof req.body?.feedbackToken !== "string" || req.body.feedbackToken.length > 1000 ||
      !["helpful", "unhelpful"].includes(req.body?.rating)) {
    return res.status(400).json({ message: "La valoración no es válida." });
  }
  try {
    const { interactionId, channel, mode } = verifyFeedbackToken(req.body.feedbackToken, req.user);
    await assistantFeedback.save({ interactionId, channel, mode, rating: req.body.rating });
    console.info(JSON.stringify({ event: "VERA_AI_FEEDBACK", channel, mode, rating: req.body.rating }));
    return res.status(201).json({ recorded: true });
  } catch (error) {
    if ([400, 409, 503].includes(error.status)) return res.status(error.status).json({ message: error.message });
    return res.status(502).json({ message: "No se pudo registrar la valoración." });
  }
});

router.get("/quality", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30,
  keyGenerator: (req) => String(req.user.id), standardHeaders: "draft-8", legacyHeaders: false }),
allowRoles(ROLES.SUPER_ADMIN), async (req, res) => {
  try { return res.json(await assistantFeedback.summary()); }
  catch { return res.status(503).json({ message: "No se pudo consultar la calidad del asistente." }); }
});

router.post("/dossier/:auditId", rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  keyGenerator: (req) => String(req.user.id), standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
  const startedAt = Date.now();
  const auditId = req.params.auditId;
  if (typeof auditId !== "string" || !auditId.trim() || auditId.length > 80) {
    return res.status(400).json({ message: "Selecciona una auditoría válida." });
  }
  try {
    const state = readiness();
    if (state.reason === "persistent-stores-required") {
      return res.status(503).json({ message: "El expediente requiere almacenes persistentes en producción." });
    }
    const dossier = await buildAuditDossier(req.user, auditId, { generate: state.available });
    console.info(JSON.stringify({ event: "VERA_AI_DOSSIER", status: 200, role: req.user.role,
      suggestionStatus: dossier.suggestionStatus, durationMs: Date.now() - startedAt,
      promptTokens: dossier.usage?.promptTokens ?? null, completionTokens: dossier.usage?.completionTokens ?? null }));
    return res.json({ ...dossier, durationMs: Date.now() - startedAt });
  } catch (error) {
    if (error.status === 400 || error.status === 403 || error.status === 404) {
      return res.status(error.status).json({ message: error.message });
    }
    console.warn(JSON.stringify({ event: "VERA_AI_DOSSIER_ERROR", status: 502,
      durationMs: Date.now() - startedAt }));
    return res.status(502).json({ message: "No se pudo preparar el briefing del expediente." });
  }
});

router.post("/search-evidence", rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  keyGenerator: (req) => String(req.user.id), standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
  const startedAt = Date.now();
  const question = req.body?.question;
  const focus = req.body?.focus ?? null;
  if (typeof question !== "string" || question.trim().length < 3 || question.length > 500 ||
      (focus !== null && (typeof focus !== "object" || Array.isArray(focus)))) {
    return res.status(400).json({ message: "Escribe una pregunta válida de 3 a 500 caracteres." });
  }
  try {
    if (!readiness().available || ((process.env.NODE_ENV === "production" ||
        process.env.VERCEL_ENV === "production") && process.env.VERA_EVIDENCE_COMMENT_STORE !== "supabase")) {
      return res.status(503).json({ message: "La búsqueda requiere Azure OpenAI y evidencias persistentes." });
    }
    const result = await searchAssistantEvidence(req.user, question.trim(), focus);
    const durationMs = Date.now() - startedAt;
    console.info(JSON.stringify({ event: "VERA_AI_EVIDENCE_SEARCH", status: 200, role: req.user.role,
      mode: result.mode, durationMs, promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null }));
    return res.json({ ...result, durationMs, feedbackToken: issueFeedbackToken(req.user, "evidence-search", result.mode), usage: result.usage ? {
      promptTokens: result.usage.prompt_tokens ?? null,
      completionTokens: result.usage.completion_tokens ?? null
    } : null });
  } catch (error) {
    console.warn(JSON.stringify({ event: "VERA_AI_EVIDENCE_SEARCH_ERROR", status: error.status || 502,
      durationMs: Date.now() - startedAt }));
    if ([400, 403, 404, 503].includes(error.status)) return res.status(error.status).json({ message: error.message });
    return res.status(502).json({ message: "No se pudo buscar en las evidencias." });
  }
});

router.post("/ask", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: (req) => String(req.user.id),
  standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
  const startedAt = Date.now();
  const question = req.body?.question;
  if (typeof question !== "string" || question.trim().length < 3 || question.length > 800) {
    return res.status(400).json({ message: "Escribe una pregunta de 3 a 800 caracteres." });
  }
  const history = req.body?.history ?? [];
  const focus = req.body?.focus ?? null;
  const lastBrowse = req.body?.lastBrowse ?? null;
  if (!Array.isArray(history) || history.length > 6 || history.some((item) =>
    !item || !["user", "assistant"].includes(item.role) ||
    typeof item.text !== "string" || item.text.length > 800) ||
    (focus !== null && (typeof focus !== "object" || Array.isArray(focus))) ||
    (lastBrowse !== null && (typeof lastBrowse !== "object" || Array.isArray(lastBrowse)))) {
    return res.status(400).json({ message: "El historial o el expediente solicitado no es válido." });
  }
  try {
    const capability = handleCapabilityQuestion(req.user, question.trim(), false);
    if (capability) return res.json({ ...capability, durationMs: Date.now() - startedAt });
    if (isProposalCreateCommand(question.trim(), { messages: [] })) {
      return res.json({ answer: "Para crear una propuesta, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isRiskCreateCommand(question.trim(), { messages: [] })) {
      return res.json({ answer: "Para registrar un riesgo, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isControlCreateCommand(question.trim(), { messages: [] })) {
      return res.json({ answer: "Para registrar un control, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isFindingCreateCommand(question.trim(), { messages: [] })) {
      return res.json({ answer: "Para registrar un hallazgo, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isFindingCloseCommand(question.trim())) {
      return res.json({ answer: "Para cerrar un hallazgo, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isEvidenceCreateCommand(question.trim(), { messages: [] })) {
      return res.json({ answer: "Para registrar una referencia de evidencia, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isFileEvidenceCommand(question.trim(), { messages: [] })) {
      return res.json({ answer: "Para vincular un archivo privado como evidencia, usa una conversación guardada y selecciona un adjunto individual. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isRoleReviewCommand(question.trim())) {
      return res.json({ answer: "Para revisar solicitudes de rol, usa una conversación guardada como Super Admin. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isRecordEditCommand(question.trim())) {
      return res.json({ answer: "Para editar un riesgo o control, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isNotificationCommand(question.trim())) {
      return res.json({ answer: "Para consultar o cambiar el estado de tus avisos, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isAuditDetailsCommand(question.trim())) {
      return res.json({ answer: "Para recorrer los detalles y relaciones de una auditoría, inicia una conversación guardada.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isAuditEditCommand(question.trim())) {
      return res.json({ answer: "Para editar una auditoría, inicia una conversación guardada y revisa la vista previa antes de confirmar.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isUserDirectoryCommand(question.trim())) {
      return res.json({ answer: "Para consultar el directorio de cuentas desde el asistente, inicia una conversación guardada. El acceso depende de tu rol.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isAuditCommentCommand(question.trim())) {
      return res.json({ answer: "Para comentar una auditoría, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isPlanningCommand(question.trim(), { messages: [] })) {
      return res.json({ answer: "Para decidir propuestas o cambiar estados de auditoría, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isRiskCommand(question.trim(), { messages: [] })) {
      return res.json({ answer: "Para evaluar riesgos, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (isControlCommand(question.trim())) {
      return res.json({ answer: "Para evaluar controles, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    if (parseReportRequest(question.trim())) {
      const result = await handleAssistantReport(req.user, question.trim());
      return res.json({ ...result, durationMs: Date.now() - startedAt });
    }
    if (isCommitmentList(question.trim())) {
      const result = await handleAssistantAction(req.user, question.trim(), { messages: [] });
      return res.json({ ...result, durationMs: Date.now() - startedAt });
    }
    if (isActionCommand(question.trim())) {
      return res.json({ answer: "Para crear o cambiar un compromiso, usa una conversación guardada. Aquí no se ejecutó ningún cambio.",
        mode: "action-guidance", citations: [], references: [], coverage: { partial: false },
        asOf: new Date().toISOString(), usage: null, durationMs: Date.now() - startedAt });
    }
    const result = await answerAssistant(req.user, question.trim(), history, focus, false, "", lastBrowse);
    const durationMs = Date.now() - startedAt;
    console.info(JSON.stringify({ event: result.mode === "computed" ? "VERA_AI_COMPUTED" : "VERA_AI_ANSWER",
      status: 200, role: req.user.role, durationMs, promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null }));
    return res.json({ ...result, feedbackToken: issueFeedbackToken(req.user, "ask", result.mode), durationMs,
      usage: result.usage ? { promptTokens: result.usage.prompt_tokens ?? null,
        completionTokens: result.usage.completion_tokens ?? null } : null });
  } catch (error) {
    console.warn(JSON.stringify({ event: "VERA_AI_ERROR", status: error.status || 502,
      durationMs: Date.now() - startedAt }));
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({ message: "El servicio de IA tardó demasiado. Intenta de nuevo." });
    }
    return res.status(502).json({ message: "No se pudo consultar el asistente en este momento." });
  }
});

module.exports = router;
