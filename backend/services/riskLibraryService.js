const { randomUUID } = require("node:crypto");
const repository = require("../repositories/riskLibraryRepository");
const { ROLES } = require("../config/roles");
const { logActivity } = require("./auditLogger");

const errorFor = (message, status) => Object.assign(new Error(message), { status });
const requireAdmin = (actor) => {
  if (actor.role !== ROLES.SUPER_ADMIN) throw errorFor("Tu rol no puede publicar en la biblioteca.", 403);
};
const textField = (value, label, min, max) => {
  if (typeof value !== "string") throw errorFor(`${label}: escribe texto válido.`, 400);
  const valueTrimmed = value.trim();
  if (valueTrimmed.length < min || valueTrimmed.length > max) {
    throw errorFor(`${label}: usa entre ${min} y ${max} caracteres.`, 400);
  }
  return valueTrimmed;
};
const optionalText = (value, label, max) => value == null || value === ""
  ? null : textField(value, label, 1, max);
const shortList = (value, label) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw errorFor(`${label}: incluye de 1 a 8 elementos.`, 400);
  }
  return value.map((item) => textField(item, label, 5, 300));
};
const creator = (actor) => ({ id: actor.id, username: actor.username });
const revisionsOf = async (templateId) => (await repository.listRevisions(templateId))
  .sort((a, b) => a.revision - b.revision);

const listLibrary = async () => {
  const records = await repository.getAll();
  const categories = records.filter((record) => record.kind === "CATEGORY")
    .sort((a, b) => a.code.localeCompare(b.code));
  const current = new Map();
  for (const record of records) {
    if (record.kind === "TEMPLATE" &&
        (!current.has(record.templateId) || current.get(record.templateId).revision < record.revision)) {
      current.set(record.templateId, record);
    }
  }
  return { categories, templates: [...current.values()]
    .sort((a, b) => a.title.localeCompare(b.title)) };
};
const listTemplateRevisions = async (templateId) => {
  const revisions = await revisionsOf(templateId);
  if (!revisions.length) throw errorFor("Plantilla no encontrada.", 404);
  return revisions;
};
const createCategoryForUser = async (actor, body) => {
  requireAdmin(actor);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw errorFor("Envía una categoría válida.", 400);
  const code = String(body.code ?? "").trim().toUpperCase();
  const name = textField(body.name, "Nombre", 3, 120);
  const description = textField(body.description, "Descripción", 10, 1000);
  const parentId = body.parentId == null ? null : String(body.parentId).trim();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) throw errorFor("El código no es válido.", 400);
  if (parentId !== null && !/^RISK-CAT-[0-9a-f-]{36}$/.test(parentId)) throw errorFor("Categoría superior no válida.", 400);
  if (await repository.findCategoryByCode(code)) throw errorFor("Ya existe una categoría con ese código.", 409);
  if (parentId) {
    const parent = await repository.findById(parentId);
    if (!parent || parent.kind !== "CATEGORY") throw errorFor("La categoría superior no existe.", 400);
  }
  const category = await repository.create({
    id: `RISK-CAT-${randomUUID()}`, kind: "CATEGORY", code, name, description, parentId,
    status: "ACTIVE", createdAt: new Date().toISOString(), createdBy: creator(actor)
  });
  await logActivity({ actor, action: "RISK_CATEGORY_CREATED", details: { categoryId: category.id, code } });
  return category;
};
const templateFields = async (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw errorFor("Envía una plantilla válida.", 400);
  const categoryId = String(body.categoryId ?? "").trim();
  const category = await repository.findById(categoryId);
  if (!category || category.kind !== "CATEGORY" || category.status !== "ACTIVE") {
    throw errorFor("Selecciona una categoría activa de la biblioteca.", 400);
  }
  return {
    categoryId,
    title: textField(body.title, "Título", 5, 160),
    scenario: textField(body.scenario, "Escenario", 20, 2000),
    causes: shortList(body.causes, "Causas"),
    consequences: shortList(body.consequences, "Consecuencias"),
    sourceNote: optionalText(body.sourceNote, "Referencia", 500)
  };
};
const publishTemplateForUser = async (actor, body) => {
  requireAdmin(actor);
  const fields = await templateFields(body);
  const templateId = `RISK-TPL-${randomUUID()}`;
  const template = await repository.create({ ...fields, kind: "TEMPLATE",
    id: `${templateId}:1`, templateId, revision: 1, status: "PUBLISHED",
    revisionReason: "Versión inicial", createdAt: new Date().toISOString(), createdBy: creator(actor)
  });
  await logActivity({ actor, action: "RISK_TEMPLATE_PUBLISHED",
    details: { templateId, revision: 1, categoryId: fields.categoryId } });
  return template;
};
const reviseTemplateForUser = async (actor, templateId, body) => {
  requireAdmin(actor);
  const revisions = await listTemplateRevisions(templateId);
  const revisionReason = textField(body?.revisionReason, "Motivo de revisión", 10, 500);
  const fields = await templateFields(body);
  const revision = revisions.at(-1).revision + 1;
  const template = await repository.create({ ...fields, kind: "TEMPLATE",
    id: `${templateId}:${revision}`, templateId, revision, status: "PUBLISHED",
    revisionReason, createdAt: new Date().toISOString(), createdBy: creator(actor)
  });
  await logActivity({ actor, action: "RISK_TEMPLATE_REVISED",
    details: { templateId, revision, categoryId: fields.categoryId } });
  return template;
};

module.exports = { listLibrary, listTemplateRevisions, createCategoryForUser,
  publishTemplateForUser, reviseTemplateForUser };
