import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Network } from "lucide-react";
import { getBusinessGraph } from "../services/businessContextService";

const GROUPS = [
  { title: "Organización", kinds: ["UNIT"] },
  { title: "Operación y objetivos", kinds: ["PROCESS", "SERVICE", "OBJECTIVE"] },
  { title: "Riesgo y auditoría", kinds: ["RISK", "CONTROL", "AUDIT"] }
];
const KIND_LABELS = { UNIT: "Ámbito", PROCESS: "Proceso", SERVICE: "Servicio", OBJECTIVE: "Objetivo",
  RISK: "Riesgo", CONTROL: "Control", AUDIT: "Auditoría" };

export default function BusinessGraph() {
  const [graph, setGraph] = useState(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    getBusinessGraph().then((result) => { if (active) setGraph(result); })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);
  const byId = useMemo(() => new Map((graph?.nodes || []).map((node) => [node.id, node])), [graph]);
  const selected = byId.get(selectedId);
  const related = useMemo(() => (graph?.edges || []).filter((edge) =>
    edge.source === selectedId || edge.target === selectedId).map((edge) => ({
    edge, node: byId.get(edge.source === selectedId ? edge.target : edge.source)
  })).filter(({ node }) => node), [graph, selectedId, byId]);
  const needle = search.trim().toLocaleLowerCase("es");

  return <section className="business-graph" aria-label="Mapa de relaciones del negocio">
    <div className="business-graph-heading"><div><span className="eyebrow">RELACIONES DECLARADAS</span>
      <h2>Cómo se conecta el negocio</h2><p>Selecciona un elemento para recorrer sus relaciones registradas y abrir su expediente.</p></div>
      <Network aria-hidden="true" size={25} /></div>
    {error && <p role="alert" className="business-context-error">{error}</p>}
    {!graph && !error && <p role="status">Preparando mapa visible para tu cuenta…</p>}
    {graph && <>
      <label className="business-graph-search">Buscar en el mapa
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="Nombre, código o tipo" /></label>
      <div className="business-graph-columns">
        {GROUPS.map((group) => {
          const matches = graph.nodes.filter((node) => group.kinds.includes(node.kind) &&
            `${node.label} ${node.detail} ${KIND_LABELS[node.kind]}`.toLocaleLowerCase("es").includes(needle));
          return <div className="business-graph-column" key={group.title}><h3>{group.title} <span>{matches.length}</span></h3>
            {matches.length === 0 ? <p>Sin elementos visibles.</p> : <div className="business-graph-node-list">
              {matches.slice(0, 60).map((node) => <button type="button" key={node.id}
                className="business-graph-node" aria-pressed={selectedId === node.id}
                onClick={() => setSelectedId(node.id)}><small>{KIND_LABELS[node.kind]}</small>
                <strong>{node.label}</strong><span>{node.detail}</span></button>)}
              {matches.length > 60 && <p>Se muestran 60 de {matches.length}. Usa la búsqueda para encontrar otro elemento.</p>}
            </div>}</div>;
        })}
      </div>
      <div className="business-graph-detail" aria-live="polite">
        {selected ? <><div className="business-graph-detail-head"><div><small>{KIND_LABELS[selected.kind]}</small>
          <h3>{selected.label}</h3><p>{selected.detail}</p></div>
          {selected.href && <a href={selected.href}>Abrir expediente <ArrowUpRight aria-hidden="true" size={17} /></a>}</div>
          <h4>Relaciones registradas · {related.length}</h4>
          {related.length ? <ul>{related.map(({ edge, node }) => <li key={edge.id}>
            <span>{edge.label}{edge.revision ? ` · versión vinculada ${edge.revision}` : ""}</span>
            <button type="button" onClick={() => setSelectedId(node.id)}>{node.label} <small>({KIND_LABELS[node.kind]})</small></button>
          </li>)}</ul> : <p>Aún no hay relaciones registradas para este elemento.</p>}</>
          : <p>Selecciona una ficha del mapa para ver sus vínculos.</p>}
      </div>
      <p className="business-graph-footnote">El mapa muestra únicamente relaciones explícitas y registros visibles para tu cuenta. Un vínculo no implica impacto calculado, eficacia de un control ni aprobación empresarial.</p>
    </>}
  </section>;
}
