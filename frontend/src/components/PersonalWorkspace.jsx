import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { readWorkspace, removeWorkspaceItem } from "../services/personalWorkspace";
import "./PersonalWorkspace.css";

const GROUPS = [{ key: "favorites", title: "Guardados" }, { key: "views", title: "Vistas guardadas" },
  { key: "recent", title: "Recientes" }];

export default function PersonalWorkspace({ userId }) {
  const [workspace, setWorkspace] = useState(() => readWorkspace(userId));
  useEffect(() => {
    const update = () => setWorkspace(readWorkspace(userId));
    window.addEventListener("vera:workspace-change", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("vera:workspace-change", update); window.removeEventListener("storage", update); };
  }, [userId]);
  if (!userId) return null;
  return <section className="personal-workspace" aria-labelledby="personal-workspace-title">
    <div className="personal-workspace-heading"><div><span className="dashboard-section-kicker">ACCESO RÁPIDO</span>
      <h2 id="personal-workspace-title">Tu espacio</h2></div>
      <small>Guardado solo en este navegador</small></div>
    <div className="personal-workspace-groups">{GROUPS.map(({ key, title }) =>
      <div className="personal-workspace-group" key={key}><h3>{title}</h3>
        {workspace[key].length ? <ul>{workspace[key].slice(0, 5).map((item) => <li key={item.path}>
          <Link to={item.path}>{item.label}</Link>
          <button type="button" onClick={() => removeWorkspaceItem(userId, key, item.path)}
            aria-label={`Quitar ${item.label} de ${title.toLowerCase()}`}>Quitar</button>
        </li>)}</ul> : <p>{key === "recent" ? "Las secciones que abras aparecerán aquí." :
          key === "views" ? "Guarda una búsqueda con sus filtros." : "Guarda los registros que consultas más."}</p>}
      </div>)}</div>
  </section>;
}
