import { Upload } from "tus-js-client";
import { notifyDataChanged } from "./dataChange.js";

const API = "/api/evidence/uploads";
const sha256Text = async (value) => [...new Uint8Array(await crypto.subtle.digest(
  "SHA-256", new TextEncoder().encode(value)))].map((part) => part.toString(16).padStart(2, "0")).join("");

const request = async (path, options = {}) => {
  const response = await fetch(`${API}${path}`, { ...options, headers: {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...options.headers
  } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "No se pudo completar la carga.");
    error.status = response.status;
    throw error;
  }
  return body;
};

const resumeKey = async (userId, details, file) => {
  const identity = JSON.stringify([String(userId), details.entityType, String(details.entityId),
    details.revisionOf || "", file.name, file.size, file.lastModified]);
  return `vera:large-evidence:${await sha256Text(identity)}`;
};

const uploadWithTus = (file, ticket, userId, mime, { onProgress, signal }) => new Promise((resolve, reject) => {
  let settled = false;
  const finish = (action, value) => {
    if (settled) return;
    settled = true;
    signal?.removeEventListener("abort", abort);
    action(value);
  };
  const headers = { "x-signature": ticket.token,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY };
  headers["x-upsert"] = "false";
  const upload = new Upload(file, {
    endpoint: ticket.endpoint,
    retryDelays: [0, 3000, 5000, 10000, 20000],
    headers,
    metadata: { bucketName: "vera-evidence", objectName: ticket.objectPath,
      contentType: mime, cacheControl: "3600" },
    chunkSize: ticket.chunkSize,
    storeFingerprintForResuming: true,
    removeFingerprintOnSuccess: true,
    fingerprint: () => Promise.resolve(`vera-tus-evidence-v1:${userId}:${ticket.id}`),
    onError: (error) => {
      error.resumable = true;
      finish(reject, error);
    },
    onProgress: (bytesUploaded, bytesTotal) => {
      onProgress?.(bytesTotal ? Math.round(bytesUploaded / bytesTotal * 100) : 0);
    },
    onSuccess: () => finish(resolve, true)
  });
  const abort = async () => {
    try { await upload.abort(false); } catch { /* Keep the server-side upload resumable. */ }
    const error = new DOMException("Carga pausada. Selecciona el mismo archivo para reanudarla.", "AbortError");
    error.resumable = true;
    finish(reject, error);
  };
  if (signal?.aborted) { void abort(); return; }
  signal?.addEventListener("abort", abort, { once: true });
  upload.findPreviousUploads().then((previous) => {
    if (settled) return;
    if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
  }).catch((error) => {
    error.resumable = true;
    finish(reject, error);
  });
});

export const uploadDirectTusEvidence = async (details, file, mime, { onProgress, signal } = {}) => {
  if (!import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("La carga reanudable no está configurada para este despliegue.");
  }
  if (!globalThis.crypto?.subtle || typeof file?.slice !== "function") {
    throw new Error("La carga reanudable requiere un navegador actualizado y una conexión segura.");
  }
  if (signal?.aborted) {
    const error = new DOMException("Carga pausada.", "AbortError");
    error.resumable = true;
    throw error;
  }
  const userId = JSON.parse(localStorage.getItem("user") || "null")?.id;
  if (!userId) throw new Error("Inicia sesión de nuevo para cargar archivos.");
  const key = await resumeKey(userId, details, file);
  let sessionId = localStorage.getItem(key);
  let ticket;

  if (sessionId) {
    try {
      const session = await request(`/${encodeURIComponent(sessionId)}`, { signal });
      if (session.uploadMode !== "tus" || session.size !== file.size || session.mime !== mime) {
        throw Object.assign(new Error("La sesión de carga no coincide con el archivo seleccionado."), { status: 409 });
      }
      if (session.completed) {
        localStorage.removeItem(key);
        notifyDataChanged();
        return { evidence: session.evidence, contentIndex: session.evidence.contentIndex || { status: "unknown" } };
      }
      // Covers a lost response after Storage committed the object but before VERA saved its metadata.
      try {
        const result = await request(`/${encodeURIComponent(sessionId)}/direct-finish`, { method: "POST", signal });
        localStorage.removeItem(key);
        notifyDataChanged();
        return result;
      } catch (error) { if (error.status !== 409) throw error; }
      ticket = await request(`/${encodeURIComponent(sessionId)}/direct-authorize`, { method: "POST", signal });
    } catch (error) {
      if ([404, 410].includes(error.status)) {
        localStorage.removeItem(key);
        sessionId = null;
      } else {
        if ([413, 415].includes(error.status)) localStorage.removeItem(key);
        throw error;
      }
    }
  }

  if (!sessionId) {
    ticket = await request("/direct", { method: "POST", signal,
      body: JSON.stringify({ ...details, mime, size: file.size }) });
    sessionId = ticket.id;
    localStorage.setItem(key, sessionId);
  }

  if (ticket?.id && ticket?.endpoint && ticket?.token && ticket?.objectPath) {
    try {
      await uploadWithTus(file, ticket, String(userId), mime, { onProgress, signal });
      const result = await request(`/${encodeURIComponent(sessionId)}/direct-finish`, { method: "POST", signal });
      localStorage.removeItem(key);
      notifyDataChanged();
      return result;
    } catch (error) {
      if ([413, 415].includes(error.status)) localStorage.removeItem(key);
      else error.resumable = true;
      throw error;
    }
  }
  throw new Error("No se pudo preparar la autorización reanudable de Storage.");
};
