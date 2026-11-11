const DATABASE = "vera-offline-v1";
const STORE = "vaults";
const ITERATIONS = 310000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let unlocked = null;

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
