import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, History, Search } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { getRiskLibrary, getTemplateRevisions } from "../services/riskLibraryService";
import "./BibliotecaRiesgos.css";

const formatDate = (value) => value
  ? new Date(value).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" })
  : "Sin fecha";

const orderedCategories = (categories) => {
  const byParent = new Map();
  for (const category of categories) {
    const parent = category.parentId || "root";
    byParent.set(parent, [...(byParent.get(parent) || []), category]);
  }
  const result = [];
  const visit = (parent, depth) => {
    for (const category of (byParent.get(parent) || []).sort((a, b) => a.name.localeCompare(b.name, "es"))) {
      result.push({ ...category, depth });
      visit(category.id, depth + 1);
    }
  };
  visit("root", 0);
  return result;
};

function BibliotecaRiesgos() {
  const [library, setLibrary] = useState({ categories: [], templates: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [revisions, setRevisions] = useState([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState("");

  useEffect(() => {
    getRiskLibrary().then(setLibrary).catch((cause) => setError(cause.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    getTemplateRevisions(selectedId).then((items) => { if (active) setRevisions(items); })
      .catch((cause) => { if (active) setRevisionsError(cause.message); })
      .finally(() => { if (active) setRevisionsLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const categories = useMemo(() => orderedCategories(library.categories), [library.categories]);
  const categoryNames = useMemo(() => new Map(library.categories.map((item) => [item.id, item.name])), [library.categories]);
  const categoryIds = useMemo(() => {
    if (!categoryId) return null;
    const ids = new Set([categoryId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of library.categories) {
        if (ids.has(category.parentId) && !ids.has(category.id)) { ids.add(category.id); changed = true; }
      }
    }
    return ids;
  }, [categoryId, library.categories]);
  const filtered = library.templates.filter((template) => {
    if (categoryIds && !categoryIds.has(template.categoryId)) return false;
    const terms = [template.title, template.scenario, ...(template.causes || []), ...(template.consequences || [])].join(" ").toLocaleLowerCase("es");
    return terms.includes(search.trim().toLocaleLowerCase("es"));
  });
  const selected = library.templates.find((item) => item.templateId === selectedId);
  const openTemplate = (id) => {
    if (id === selectedId) { setSelectedId(""); return; }
    setRevisions([]); setRevisionsError(""); setRevisionsLoading(true); setSelectedId(id);
  };

  return <div className="dashboard-layout">
    <Sidebar active="biblioteca-riesgos" />
    <main className="dashboard-main">
      <section className="dashboard-content risk-library-page">
        <header className="dashboard-header">
          <div><span className="eyebrow">REFERENCIA DE ESCENARIOS</span><h1>Biblioteca de riesgos</h1>
            <p>Consulta categorías y plantillas. Una plantilla orienta la documentación; no es un riesgo registrado ni una política aprobada.</p></div>
        </header>
        {loading && <p role="status" className="risk-library-status">Cargando biblioteca…</p>}
        {error && <p role="alert" className="risk-library-status risk-library-error">{error}</p>}
        {!loading && !error && <>
          <div className="risk-library-overview" aria-label="Resumen de biblioteca">
            <span><strong>{library.categories.length}</strong> categorías</span>
            <span><strong>{library.templates.length}</strong> plantillas publicadas</span>
          </div>
          <div className="risk-library-filters">
            <label><Search size={17} aria-hidden="true" /> Buscar plantilla
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, escenario, causa…" />
            </label>
            <label>Familia de riesgos
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Todas las categorías</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{"  ".repeat(category.depth)}{category.name}</option>)}
              </select>
            </label>
          </div>
          {library.categories.length > 0 && <details className="risk-library-categories">
            <summary>Ver estructura de categorías</summary>
            <ul>{categories.map((category) => <li key={category.id} style={{ paddingInlineStart: `${category.depth * 1.25}rem` }}>
              <b>{category.name}</b><span>{category.code}</span><p>{category.description}</p>
            </li>)}</ul>
          </details>}
          {library.templates.length === 0 ? <div className="risk-library-empty"><BookOpen size={26} aria-hidden="true" />
            <h2>La biblioteca aún no tiene plantillas</h2><p>Se podrán consultar aquí cuando se publiquen escenarios de referencia.</p></div>
            : filtered.length === 0 ? <p className="risk-library-empty">Ninguna plantilla coincide con la búsqueda.</p>
              : <div className="risk-library-list">{filtered.map((template) => <article key={template.templateId} className="risk-library-card">
                <button type="button" aria-expanded={selectedId === template.templateId} onClick={() => openTemplate(template.templateId)}>
                  <span><small>PLANTILLA · {categoryNames.get(template.categoryId) || "Categoría"} · VERSIÓN {template.revision}</small>
                    <strong>{template.title}</strong><span>{template.scenario}</span></span>
                  <ChevronRight className={selectedId === template.templateId ? "open" : ""} size={20} aria-hidden="true" />
                </button>
                {selectedId === template.templateId && selected && <div className="risk-library-detail">
                  <div><h3>Causas</h3><ul>{selected.causes.map((cause) => <li key={cause}>{cause}</li>)}</ul></div>
                  <div><h3>Consecuencias</h3><ul>{selected.consequences.map((consequence) => <li key={consequence}>{consequence}</li>)}</ul></div>
                  <p><b>Referencia:</b> {selected.sourceNote || "No se indicó una fuente externa."}</p>
                  <p><b>Publicación:</b> {formatDate(selected.createdAt)} · versión {selected.revision}</p>
                  <section aria-label="Historial de versiones"><h3><History size={17} aria-hidden="true" /> Versiones publicadas</h3>
                    {revisionsLoading && <p role="status">Cargando historial…</p>}
                    {revisionsError && <p role="alert">{revisionsError}</p>}
                    {!revisionsLoading && !revisionsError && <ol>{revisions.map((revision) => <li key={revision.id}>
                      <b>Versión {revision.revision}</b> · {formatDate(revision.createdAt)}
                      <span>{revision.revisionReason}</span>
                    </li>)}</ol>}
                  </section>
                </div>}
              </article>)}</div>}
        </>}
      </section>
    </main>
  </div>;
}

export default BibliotecaRiesgos;
