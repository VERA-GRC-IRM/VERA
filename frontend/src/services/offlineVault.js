const DATABASE = "vera-offline-v1";
const STORE = "vaults";
const ITERATIONS = 310000;
const MAX_BACKUP_BYTES = 40 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let unlocked = null;

const toBase64 = (bytes) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
};

const fromBase64 = (value, maxBytes) => {
  if (typeof value !== "string" || value.length > Math.ceil(maxBytes / 3) * 4 + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("El archivo de copia no tiene un formato válido.");
  }
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  if (bytes.length > maxBytes) throw new Error("El archivo de copia supera el límite permitido.");
  return bytes;
};

const scopeFor = (userId) => {
  const id = String(userId ?? "").trim();
  if (!id || id.length > 80) throw new Error("No se pudo identificar la cuenta.");
  return `${location.origin}|${id}`;
};

const openDatabase = () => new Promise((resolve, reject) => {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) {
    reject(new Error("Este navegador no admite el espacio local protegido."));
    return;
  }
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "scope" });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error("No se pudo abrir el espacio local."));
  request.onblocked = () => reject(new Error("Cierra otras pestañas de VERA e intenta de nuevo."));
});

const getRecord = async (scope) => {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(scope);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(new Error("No se pudo leer el espacio local."));
    });
  } finally { db.close(); }
};

const addRecord = async (record) => {
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).add(record);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(new Error("Ya existe una copia para esta cuenta o falta espacio en el dispositivo."));
      transaction.onabort = () => reject(new Error("No se pudo crear la copia local."));
    });
  } finally { db.close(); }
};

const updateRecord = async (scope, expectedRevision, encrypted) => {
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const request = store.get(scope);
      let conflict = false;
      request.onsuccess = () => {
        if (!request.result || request.result.revision !== expectedRevision) {
          conflict = true;
          transaction.abort();
          return;
        }
        store.put({ ...request.result, ...encrypted, revision: expectedRevision + 1 });
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(new Error("No se pudo guardar la copia local."));
      transaction.onabort = () => reject(new Error(conflict
        ? "La copia local cambió en otra pestaña. Vuelve a desbloquearla."
        : "No se pudo guardar la copia local."));
    });
  } finally { db.close(); }
};

const removeRecord = async (scope) => {
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(scope);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(new Error("No se pudo borrar la copia local."));
    });
  } finally { db.close(); }
};

const deriveKey = async (passphrase, salt) => {
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase.normalize("NFC")),
    "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
};

const encrypt = async (scope, key, data) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv,
    additionalData: encoder.encode(scope) }, key, encoder.encode(JSON.stringify(data)));
  return { iv, ciphertext: new Uint8Array(ciphertext) };
};

const decrypt = async (record, key) => {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM",
    iv: new Uint8Array(record.iv), additionalData: encoder.encode(record.scope) },
  key, new Uint8Array(record.ciphertext));
  const data = JSON.parse(decoder.decode(plaintext));
  if (data.schemaVersion !== 1) throw new Error("La versión de esta copia local no es compatible.");
  return data;
};

export const hasOfflineVault = async (userId) => Boolean(await getRecord(scopeFor(userId)));

export const createOfflineVault = async (userId, passphrase) => {
  if (typeof passphrase !== "string" || passphrase.normalize("NFC").length < 15) {
    throw new Error("Usa una frase local de al menos 15 caracteres.");
  }
  const scope = scopeFor(userId);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const data = { schemaVersion: 1, snapshots: {}, drafts: [], lastSyncAt: null };
  const encrypted = await encrypt(scope, key, data);
  await addRecord({ scope, salt, revision: 1, createdAt: new Date().toISOString(), ...encrypted });
  unlocked = { scope, key, revision: 1, data };
  return structuredClone(data);
};

export const unlockOfflineVault = async (userId, passphrase) => {
  const scope = scopeFor(userId);
  const record = await getRecord(scope);
  if (!record) throw new Error("No hay una copia local para esta cuenta.");
  let key;
  let data;
  try {
    key = await deriveKey(passphrase, new Uint8Array(record.salt));
    data = await decrypt(record, key);
  } catch { throw new Error("La frase local no coincide o la copia está dañada."); }
  unlocked = { scope, key, revision: record.revision, data };
  return structuredClone(data);
};

export const readOfflineVault = (userId) => {
  if (!unlocked || unlocked.scope !== scopeFor(userId)) throw new Error("Desbloquea tu espacio local.");
  return structuredClone(unlocked.data);
};

export const saveOfflineVault = async (userId, data) => {
  if (!unlocked || unlocked.scope !== scopeFor(userId)) throw new Error("Desbloquea tu espacio local.");
  if (data?.schemaVersion !== 1) throw new Error("La copia local no es válida.");
  const encrypted = await encrypt(unlocked.scope, unlocked.key, data);
  try { await updateRecord(unlocked.scope, unlocked.revision, encrypted); }
  catch (error) { unlocked = null; throw error; }
  unlocked = { ...unlocked, revision: unlocked.revision + 1, data: structuredClone(data) };
};

export const lockOfflineVault = () => {
  unlocked = null;
  window.dispatchEvent(new Event("vera:offline-vault-locked"));
};

export const deleteOfflineVault = async (userId) => {
  const scope = scopeFor(userId);
  if (unlocked?.scope === scope) unlocked = null;
  await removeRecord(scope);
};

export const exportOfflineVault = async (userId) => {
  const scope = scopeFor(userId);
  if (!unlocked || unlocked.scope !== scope) throw new Error("Desbloquea tu espacio local antes de exportar.");
  const record = await getRecord(scope);
  if (!record || record.revision !== unlocked.revision) {
    lockOfflineVault();
    throw new Error("La copia cambió en otra pestaña. Desbloquéala antes de exportar.");
  }
  const backup = { format: "vera-offline-backup-v1", scope, createdAt: record.createdAt,
    exportedAt: new Date().toISOString(), salt: toBase64(new Uint8Array(record.salt)),
    iv: toBase64(new Uint8Array(record.iv)),
    ciphertext: toBase64(new Uint8Array(record.ciphertext)) };
  return { fileName: `vera-copia-cifrada-${new Date().toISOString().slice(0, 10)}.json`,
    json: JSON.stringify(backup) };
};

export const importOfflineVault = async (userId, file, passphrase) => {
  const scope = scopeFor(userId);
  if (!(file instanceof File) || !file.size || file.size > MAX_BACKUP_BYTES) {
    throw new Error("Selecciona una copia cifrada de hasta 40 MiB.");
  }
  if (typeof passphrase !== "string" || passphrase.normalize("NFC").length < 15) {
    throw new Error("Escribe la frase local de la copia original.");
  }
  if (await getRecord(scope)) throw new Error("Ya existe una copia en este dispositivo. No se reemplazó.");
  let backup;
  try { backup = JSON.parse(await file.text()); }
  catch { throw new Error("El archivo de copia no es JSON válido."); }
  if (backup?.format !== "vera-offline-backup-v1" || backup.scope !== scope) {
    throw new Error("La copia pertenece a otra cuenta o dirección de VERA.");
  }
  const salt = fromBase64(backup.salt, 16);
  const iv = fromBase64(backup.iv, 12);
  const ciphertext = fromBase64(backup.ciphertext, 30 * 1024 * 1024);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) {
    throw new Error("El archivo de copia está incompleto.");
  }
  let key;
  let data;
  try {
    key = await deriveKey(passphrase, salt);
    data = await decrypt({ scope, iv, ciphertext }, key);
  } catch { throw new Error("La frase local no coincide o el archivo está dañado."); }
  if (!data.snapshots || !Array.isArray(data.drafts)) throw new Error("La copia local no es compatible.");
  await addRecord({ scope, salt, iv, ciphertext, revision: 1, createdAt: backup.createdAt || new Date().toISOString() });
  unlocked = { scope, key, revision: 1, data };
  return structuredClone(data);
};
