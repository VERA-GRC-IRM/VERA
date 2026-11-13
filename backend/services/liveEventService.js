const auditLogger = require("./auditLogger");
const userRepository = require("../repositories/userRepository");
const evidenceRepository = require("../repositories/evidenceRepository");
const { visibleRecordForUser } = require("./recordReadAccessService");
const { canAccessEntity } = require("./evidenceCreationService");

const enabled = () => process.env.VERA_LIVE_UPDATES_ENABLED === "true" &&
  (!(process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") ||
    process.env.VERA_AUDIT_STORE === "supabase");

const eventType = (action) => {
  if (action.startsWith("VERA_RISKS_")) return "RISK";
  if (action.startsWith("VERA_CONTROLS_")) return "CONTROL";
  if (action.startsWith("VERA_FINDINGS_")) return "FINDING";
  if (action.startsWith("VERA_AUDIT_PROPOSALS_")) return "AUDIT";
  if (action.startsWith("VERA_EVIDENCE_")) return "EVIDENCE";
  return null;
};

const eventVisible = async (user, event) => {
  const type = eventType(String(event.action || ""));
  const id = typeof event.target?.id === "string" ? event.target.id : "";
  if (!type || !id || String(event.action).endsWith("_DELETE")) return false;
  if (type !== "EVIDENCE") return Boolean(await visibleRecordForUser(user, type, id));
  const evidence = await evidenceRepository.findById(id);
  return Boolean(evidence && await canAccessEntity(evidence.entityType, evidence.entityId, user));
};

const stream = (req, res) => {
  if (!enabled()) return res.status(404).json({ message: "Actualización en vivo no disponible." });
  res.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform", Connection: "keep-alive",
    "X-Accel-Buffering": "no" });
  res.flushHeaders?.();
  res.write(": conectado\n\n");
  const seen = new Set();
  let since = new Date(Date.now() - 5_000).toISOString();
  let busy = false;
  let closed = false;
  const stop = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    clearTimeout(expiry);
    res.end();
  };
  const poll = async () => {
    if (closed || busy) return;
    busy = true;
    try {
      const current = await userRepository.findById(req.user.id);
      if (closed) return;
      if (!current || current.status !== "ACTIVE" || current.role !== req.user.role) { stop(); return; }
      const events = await auditLogger.query({ from: since, limit: 100 });
      if (closed) return;
      for (const event of [...events].reverse()) {
        const time = Date.parse(event.date);
        if (Number.isFinite(time) && time > Date.parse(since)) {
          since = new Date(time - 1_000).toISOString();
        }
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        if (await eventVisible(req.user, event)) {
          if (closed) return;
          // Nunca se envían títulos, IDs ni datos de la bitácora al navegador.
          res.write("event: change\ndata: {}\n\n");
          break;
        }
      }
      if (seen.size > 500) seen.clear();
    } catch {
      // La consulta periódica de las vistas permanece como respaldo.
      stop();
    } finally { busy = false; }
  };
  const timer = setInterval(poll, 2_000);
  const expiry = setTimeout(stop, 20_000);
  res.on("close", stop);
  poll();
};

module.exports = { enabled, eventType, eventVisible, stream };
