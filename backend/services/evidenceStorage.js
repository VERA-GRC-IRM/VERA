const { randomUUID } = require("node:crypto");

const BUCKET = "vera-evidence";
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_LARGE_UPLOAD_BYTES = 200 * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const PREFIX_BYTES = 64 * 1024;
const MIME_EXTENSIONS = {
  "application/pdf": "pdf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/plain": "txt",
  "text/csv": "csv",
};

class EvidenceStorageError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
    this.evidenceStorage = true;
  }
}

const config = () => {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new EvidenceStorageError("Falta configurar Supabase Storage para archivos de evidencia.");
  let root;
  try { root = new URL(process.env.SUPABASE_URL); } catch {
    throw new EvidenceStorageError("La URL de Supabase no es válida.");
  }
  if (root.protocol !== "https:") throw new EvidenceStorageError("La URL de Supabase debe usar HTTPS.");
  return { root, key };
};

const headersFor = (key) => ({
  apikey: key,
  ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` })
});

const pathFor = (entityType, entityId, mime, objectId = randomUUID()) => {
  const extension = MIME_EXTENSIONS[mime];
  if (!extension || !/^(risk|control|audit|ai)$/i.test(String(entityType)) || !String(entityId).trim() ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(objectId)) {
    throw new EvidenceStorageError("Ruta de evidencia no válida.", 400);
  }
  return `${entityType.toLowerCase()}/${encodeURIComponent(entityId)}/${objectId}.${extension}`;
};

const safeObjectPath = (path) => typeof path === "string" &&
  /^(risk|control|audit|ai)\/[^/]+\/[0-9a-f-]{36}\.(pdf|xls|xlsx|doc|docx|png|jpg|webp|csv|txt)$/i.test(path);

const createTusUploadToken = async (path) => {
  if (!safeObjectPath(path)) throw new EvidenceStorageError("Ruta de carga no válida.", 400);
  const { root, key } = config();
  const url = new URL(`/storage/v1/object/upload/sign/${BUCKET}/${path}`, root);
  let response;
  try {
    response = await fetch(url, { method: "POST", headers: {
      ...headersFor(key), "Content-Type": "application/json", "x-upsert": "false"
    }, body: "{}", signal: AbortSignal.timeout(10_000) });
  } catch { throw new EvidenceStorageError("No se pudo preparar la carga reanudable."); }
  if (!response.ok) {
    throw new EvidenceStorageError("El almacén rechazó la preparación de la carga.", response.status === 409 ? 409 : 503);
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new EvidenceStorageError("El almacén respondió con un formato no válido."); }
  const signed = payload.url || payload.signedURL;
  if (typeof signed !== "string" || signed.length > 4096) {
    throw new EvidenceStorageError("El almacén no devolvió una autorización de carga válida.");
  }
  let token;
  try { token = new URL(signed, root).searchParams.get("token"); }
  catch { throw new EvidenceStorageError("El almacén no devolvió una autorización de carga válida."); }
  if (typeof token !== "string" || token.length < 16 || token.length > 2048) {
    throw new EvidenceStorageError("El almacén no devolvió una autorización de carga válida.");
  }
  const hostname = root.hostname.endsWith(".supabase.co")
    ? `${root.hostname.slice(0, -".supabase.co".length)}.storage.supabase.co` : root.hostname;
  const port = root.port ? `:${root.port}` : "";
  return { endpoint: `https://${hostname}${port}/storage/v1/upload/resumable`, token };
};

const readTusObjectInfo = async (path) => {
  if (!safeObjectPath(path)) throw new EvidenceStorageError("Ruta de carga no válida.", 400);
  const { root, key } = config();
  const url = new URL(`/storage/v1/object/authenticated/${BUCKET}/${path}`, root);
  let response;
  try { response = await fetch(url, { method: "HEAD", headers: headersFor(key), signal: AbortSignal.timeout(10_000) }); }
  catch { throw new EvidenceStorageError("No se pudo verificar el archivo en Storage."); }
  if (!response.ok) throw new EvidenceStorageError("El archivo final no está disponible en Storage.", response.status === 404 ? 409 : 503);
  const size = Number(response.headers.get("content-length"));
  const mime = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_LARGE_UPLOAD_BYTES || !mime) {
    throw new EvidenceStorageError("El archivo final no cumple los límites permitidos.", 413);
  }
  return { size, mime };
};

const readTusObjectPrefix = async (path) => {
  if (!safeObjectPath(path)) throw new EvidenceStorageError("Ruta de carga no válida.", 400);
  const { root, key } = config();
  const url = new URL(`/storage/v1/object/authenticated/${BUCKET}/${path}`, root);
  let response;
  try {
    response = await fetch(url, { headers: { ...headersFor(key), Range: `bytes=0-${PREFIX_BYTES - 1}` },
      signal: AbortSignal.timeout(10_000) });
  } catch { throw new EvidenceStorageError("No se pudo verificar el contenido del archivo."); }
  if (!response.ok) throw new EvidenceStorageError("No se pudo verificar el contenido del archivo.", response.status === 404 ? 409 : 503);
  if (!response.body) throw new EvidenceStorageError("El almacén no devolvió el contenido del archivo.");
  const reader = response.body.getReader();
  const pieces = [];
  let length = 0;
  try {
    while (length < PREFIX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = Buffer.from(value).subarray(0, PREFIX_BYTES - length);
      pieces.push(part);
      length += part.length;
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(pieces, length);
};

const removeObjectPath = async (path) => {
  if (!safeObjectPath(path)) throw new EvidenceStorageError("Ruta de archivo no válida.", 400);
  const { root, key } = config();
  const url = new URL(`/storage/v1/object/${BUCKET}`, root);
  const response = await fetch(url, { method: "DELETE", headers: {
    ...headersFor(key), "Content-Type": "application/json"
  }, body: JSON.stringify({ prefixes: [path] }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok && response.status !== 404) throw new EvidenceStorageError("No se pudo retirar el archivo incompleto.");
};

const chunkPath = (sessionId, index, mime) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) ||
      !Number.isInteger(index) || index < 0 || index >= MAX_BYTES / CHUNK_BYTES ||
      !MIME_EXTENSIONS[mime]) throw new EvidenceStorageError("Parte de archivo no válida.", 400);
  return `uploads/${sessionId}/${index}.${MIME_EXTENSIONS[mime]}`;
};

const uploadChunk = async (sessionId, index, mime, bytes) => {
  const path = chunkPath(sessionId, index, mime);
  if (!Buffer.isBuffer(bytes)) {
    throw new EvidenceStorageError("La parte debe ser binaria.", 400);
  }
  const chunk = Buffer.from(bytes);
  if (chunk.length === 0 || chunk.length > CHUNK_BYTES) {
    throw new EvidenceStorageError("La parte supera el tamaño permitido.", 400);
  }
  const { root, key } = config();
  const url = new URL(`/storage/v1/object/${BUCKET}/${path}`, root);
  let response;
  try { response = await fetch(url, { method: "POST", headers: {
    ...headersFor(key), "Content-Type": mime, "x-upsert": "false"
  }, body: chunk, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new EvidenceStorageError("No se pudo guardar la parte del archivo."); }
  if (!response.ok) throw new EvidenceStorageError("No se pudo guardar la parte del archivo.", response.status === 409 ? 409 : 503);
  return path;
};

const downloadChunk = async (sessionId, index, mime) => {
  const path = chunkPath(sessionId, index, mime);
  const { root, key } = config();
  const url = new URL(`/storage/v1/object/${BUCKET}/${path}`, root);
  let response;
  try { response = await fetch(url, { headers: headersFor(key), signal: AbortSignal.timeout(15_000) }); }
  catch { throw new EvidenceStorageError("No se pudo leer una parte del archivo."); }
  if (!response.ok || Number(response.headers.get("content-length")) > CHUNK_BYTES) {
    throw new EvidenceStorageError("No se pudo leer una parte del archivo.", response.status === 404 ? 404 : 503);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > CHUNK_BYTES) throw new EvidenceStorageError("Parte del archivo incompleta.");
  return bytes;
};

const hasValidSignature = (bytes, mime) => {
  const data = Buffer.from(bytes);

  // PDF
  if (mime === "application/pdf") {
    return data.subarray(0, 5).toString() === "%PDF-";
  }

  // Word DOCX y Excel XLSX (contenedores ZIP)
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return data.subarray(0, 4).equals(
      Buffer.from([0x50, 0x4b, 0x03, 0x04])
    );
  }

  // Word DOC y Excel XLS (formato OLE)
  if (
    mime === "application/msword" ||
    mime === "application/vnd.ms-excel"
  ) {
    return data.subarray(0, 8).equals(
      Buffer.from([
        0xD0, 0xCF, 0x11, 0xE0,
        0xA1, 0xB1, 0x1A, 0xE1
      ])
    );
  }

  // PNG
  if (mime === "image/png") {
    return data.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
  }

  // JPEG
  if (mime === "image/jpeg") {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }

  // WebP
  if (mime === "image/webp") {
    return data.subarray(0, 4).toString() === "RIFF" &&
      data.subarray(8, 12).toString() === "WEBP";
  }

  // Text + csv
  if (mime === "text/plain" || mime === "text/csv") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(data);
      return !data.includes(0);
    } catch {
      return false;
    }
  }

  return false;
};

const verifyTusObject = async ({ path, mime, expectedSize }) => {
  const info = await readTusObjectInfo(path);
  if (info.size !== expectedSize || info.mime !== mime) {
    throw new EvidenceStorageError("El archivo final no coincide con su tamaño o tipo declarado.", 415);
  }
  const prefix = await readTusObjectPrefix(path);
  const signatureBytes = mime === "text/plain" || mime === "text/csv"
    ? prefix.subarray(0, Math.max(0, prefix.length - 4)) : prefix;
  if (prefix.length === 0 || !hasValidSignature(signatureBytes, mime)) {
    throw new EvidenceStorageError("El contenido no coincide con el tipo de archivo.", 415);
  }
  return info;
};

const upload = async ({ entityType, entityId, mime, bytes }) => {
  if (!Buffer.isBuffer(bytes)) {
    throw new EvidenceStorageError("El cuerpo debe ser un archivo binario.", 400);
  }
  const fileBytes = Buffer.from(bytes);
  if (fileBytes.length === 0 || fileBytes.length > MAX_BYTES) {
    throw new EvidenceStorageError("El archivo debe tener entre 1 byte y 3 MB.", 400);
  }
  if (!hasValidSignature(fileBytes, mime)) throw new EvidenceStorageError("El contenido no coincide con el tipo de archivo.", 415);
  const path = pathFor(entityType, entityId, mime);
  const { root, key } = config();
  const url = new URL(`/storage/v1/object/${BUCKET}/${path}`, root);
  let response;
  try {
    response = await fetch(url, {
      method: "POST", headers: { ...headersFor(key), "Content-Type": mime, "cache-control": "max-age=3600", "x-upsert": "false" },
      body: fileBytes, signal: AbortSignal.timeout(15_000)
    });
  } catch { throw new EvidenceStorageError("No se pudo conectar con el almacén de archivos."); }
  if (!response.ok) throw new EvidenceStorageError("El almacén de archivos rechazó la carga.");
  return { bucket: BUCKET, path, mime, size: fileBytes.length };
};

const remove = async (file) => {
  const { root, key } = config();
  const url = new URL(`/storage/v1/object/${BUCKET}`, root);
  const response = await fetch(url, {
    method: "DELETE", headers: { ...headersFor(key), "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [file.path] }), signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new EvidenceStorageError("No se pudo retirar un archivo sin metadatos.");
};

const removeChunks = async (sessionId, count, mime) => {
  if (!Number.isInteger(count) || count < 1 || count > MAX_BYTES / CHUNK_BYTES) {
    throw new EvidenceStorageError("Cantidad de partes no válida.", 400);
  }
  const prefixes = Array.from({ length: count }, (_, index) => chunkPath(sessionId, index, mime));
  const { root, key } = config();
  const url = new URL(`/storage/v1/object/${BUCKET}`, root);
  const response = await fetch(url, { method: "DELETE", headers: {
    ...headersFor(key), "Content-Type": "application/json"
  }, body: JSON.stringify({ prefixes }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new EvidenceStorageError("No se pudieron retirar las partes temporales.");
};

const validFile = (file) => file && file.bucket === BUCKET &&
  /^(risk|control|audit|ai)\/[^/]+\/[0-9a-f-]{36}\.(pdf|xls|xlsx|doc|docx|png|jpg|webp|csv|txt)$/.test(file.path) &&
  MIME_EXTENSIONS[file.mime] && file.path.endsWith(`.${MIME_EXTENSIONS[file.mime]}`);

const downloadBytes = async (file) => {
  if (!validFile(file)) throw new EvidenceStorageError("Archivo de evidencia no válido.", 400);
  const { root, key } = config();
  const url = new URL(`/storage/v1/object/${BUCKET}/${file.path}`, root);
  let response;
  try { response = await fetch(url, { headers: headersFor(key), signal: AbortSignal.timeout(15_000) }); }
  catch { throw new EvidenceStorageError("No se pudo conectar con el almacén de archivos."); }
  if (!response.ok || Number(response.headers.get("content-length")) > MAX_BYTES) {
    throw new EvidenceStorageError("No se pudo leer el archivo privado.");
  }
  let bytes;
  try { bytes = Buffer.from(await response.arrayBuffer()); }
  catch { throw new EvidenceStorageError("No se pudo leer el archivo privado."); }
  if (bytes.length === 0 || bytes.length > MAX_BYTES || !hasValidSignature(bytes, file.mime)) {
    throw new EvidenceStorageError("El archivo privado no coincide con sus metadatos.");
  }
  return bytes;
};

const signedDownloadUrl = async (file) => {
  if (!validFile(file)) {
    throw new EvidenceStorageError("Archivo de evidencia no válido.", 400);
  }
  const { root, key } = config();
  const url = new URL(`/storage/v1/object/sign/${BUCKET}/${file.path}`, root);
  let response;
  try {
    response = await fetch(url, {
      method: "POST", headers: { ...headersFor(key), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }), signal: AbortSignal.timeout(10_000)
    });
  } catch { throw new EvidenceStorageError("No se pudo conectar con el almacén de archivos."); }
  if (!response.ok) throw new EvidenceStorageError("No se pudo preparar la descarga.");
  const data = await response.json();
  if (typeof data.signedURL !== "string" || !data.signedURL.startsWith(`/object/sign/${BUCKET}/`)) {
    throw new EvidenceStorageError("El almacén devolvió una dirección de descarga no válida.");
  }
  return new URL(`/storage/v1${data.signedURL}`, root).toString();
};

module.exports = { MAX_BYTES, MAX_LARGE_UPLOAD_BYTES, CHUNK_BYTES, TUS_CHUNK_BYTES, MIME_EXTENSIONS,
  EvidenceStorageError, pathFor, createTusUploadToken, verifyTusObject, removeObjectPath,
  upload, uploadChunk, downloadChunk, chunkPath, remove, removeChunks, signedDownloadUrl, downloadBytes };
