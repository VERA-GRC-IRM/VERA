const { createStore } = require("./supabaseDocumentStore");

const inMemory = new Map();
const memory = {
  async create(data) { inMemory.set(data.id, { ...data, storageVersion: 1 }); return { ...inMemory.get(data.id) }; },
  async getAll() { return [...inMemory.values()].map((item) => ({ ...item })); },
  async findById(id) { return inMemory.has(id) ? { ...inMemory.get(id) } : null; },
  async remove(id) { inMemory.delete(id); },
  async mutate(id, changes, version) {
    const current = inMemory.get(id);
    if (!current) return null;
    if (current.storageVersion !== version) {
      const error = new Error("La carga cambió mientras se procesaba. Intenta de nuevo."); error.status = 409; throw error;
    }
    const next = { ...current, ...changes, storageVersion: version + 1 };
    inMemory.set(id, next);
    return { ...next };
  }
};

module.exports = process.env.VERA_RESUMABLE_STORE === "supabase"
  ? createStore("vera_evidence_uploads") : memory;
