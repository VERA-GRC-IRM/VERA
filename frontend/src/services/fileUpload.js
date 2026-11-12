import { notifyDataChanged } from "./dataChange.js";

export const sendEvidenceUpload = (url, file, mime, token, { onProgress, signal } = {}) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Carga cancelada.", "AbortError")); return; }
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener("abort", cancel);
    signal?.addEventListener("abort", cancel, { once: true });
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(99, Math.round(100 * event.loaded / event.total)));
    };
    xhr.onerror = () => { cleanup(); reject(new Error("No se pudo conectar para cargar el archivo.")); };
    xhr.onabort = () => { cleanup(); reject(new DOMException("Carga cancelada.", "AbortError")); };
    xhr.onload = () => {
      cleanup();
      let data;
      try { data = JSON.parse(xhr.responseText); } catch { reject(new Error("El servidor devolvió una respuesta inválida.")); return; }
      if (xhr.status < 200 || xhr.status >= 300) { reject(new Error(data.message || "No se pudo cargar el archivo.")); return; }
      onProgress?.(100);
      notifyDataChanged();
      resolve(data);
    };
    xhr.send(file);
  });
