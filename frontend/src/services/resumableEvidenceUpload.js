import { notifyDataChanged } from "./dataChange.js";

const CHUNK_BYTES = 256 * 1024;
const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map((part) => part.toString(16).padStart(2, "0")).join("");

const request = async (path, token, options = {}) => {
  const response = await fetch(`/api/evidence/uploads${path}`, {
    ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "No se pudo completar la carga.");
    error.status = response.status;
    throw error;
  }
  return body;
};

export const uploadResumableEvidence = async (details, file, mime, token, { onProgress, signal } = {}) => {
  if (!globalThis.crypto?.subtle) throw new Error("La carga reanudable requiere una conexión segura.");
  const digest = await sha256(await file.arrayBuffer());
  const userId = JSON.parse(localStorage.getItem("user") || "null")?.id;
  if (!userId) throw new Error("Inicia sesión de nuevo para cargar archivos.");
  const identity = await sha256(new TextEncoder().encode(JSON.stringify([
    String(userId), digest, details.entityType, details.entityId
  ])));
  const key = `vera:evidence-upload:${identity}`;
  let session;
  const savedId = localStorage.getItem(key);
  if (savedId) {
    try { session = await request(`/${encodeURIComponent(savedId)}`, token, { signal }); }
    catch (error) {
      if (![404, 410].includes(error.status)) throw error;
      localStorage.removeItem(key);
    }
  }
  if (session && (session.sha256 !== digest || session.size !== file.size || session.mime !== mime)) {
    localStorage.removeItem(key);
    session = null;
  }
  if (!session) {
    session = await request("", token, { method: "POST", signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...details, mime, size: file.size, sha256: digest }) });
    localStorage.setItem(key, session.id);
  }
  const total = Math.ceil(file.size / CHUNK_BYTES);
  const received = new Set(session.received || []);
  onProgress?.(Math.round(received.size / total * 100));
  for (let index = 0; index < total; index += 1) {
    if (received.has(index)) continue;
    const bytes = file.slice(index * CHUNK_BYTES, Math.min(file.size, (index + 1) * CHUNK_BYTES));
    try { await request(`/${encodeURIComponent(session.id)}/parts/${index}`, token, {
      method: "PUT", signal, headers: { "Content-Type": "application/octet-stream" }, body: bytes
    }); }
    catch (error) { error.resumable = true; throw error; }
    received.add(index);
    onProgress?.(Math.round(received.size / total * 100));
  }
  try {
    const result = await request(`/${encodeURIComponent(session.id)}/finish`, token,
      { method: "POST", signal });
    localStorage.removeItem(key);
    notifyDataChanged();
    return result;
  } catch (error) { error.resumable = true; throw error; }
};
