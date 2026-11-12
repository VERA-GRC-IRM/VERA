import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { readWorkspace, removeWorkspaceItem } from "../services/personalWorkspace";
import "./PersonalWorkspace.css";

const GROUPS = [{ key: "favorites", title: "Guardados" }, { key: "views", title: "Vistas guardadas" },
  { key: "recent", title: "Recientes" }];

export default function PersonalWorkspace({ userId }) {
  const [workspace, setWorkspace] = useState(() => readWorkspace(userId));
  const [syncStatus, setSyncStatus] = useState(() => {
    try { return sessionStorage.getItem(`vera:workspace:status:${Number(userId)}`) || "syncing"; }
    catch { return "syncing"; }
  });
  useEffect(() => {
    const update = () => setWorkspace(readWorkspace(userId));
    window.addEventListener("vera:workspace-change", update);
    window.addEventListener("storage", update);
    const sync = (event) => { if (event.detail?.userId === Number(userId)) setSyncStatus(event.detail.status); };
    window.addEventListener("vera:workspace-sync-status", sync);
    return () => { window.removeEventListener("vera:workspace-change", update);
      window.removeEventListener("storage", update); window.removeEventListener("vera:workspace-sync-status", sync); };
  }, [userId]);
  if (!userId) return null;
  return <section className="personal-workspace" aria-labelledby="personal-workspace-title">
    <div className="personal-workspace-heading"><div><span className="dashboard-section-kicker">ACCESO RÁPIDO</span>
      <h2 id="personal-workspace-title">Tu espacio</h2></div>
      <small>{import.meta.env.VITE_VERA_WORKSPACE_SYNC_ENABLED === "true"
        ? { syncing: "Sincronizando…", synced: "Sincronizado entre dispositivos",
          pending: "Guardado aquí; sincronización pendiente",
          "import-ready": "Decide cómo combinar los guardados de este navegador" }[syncStatus]
        : "Guardado solo en este navegador"}</small></div>
    {syncStatus === "import-ready" && <div className="personal-workspace-import" role="group"
      aria-label="Primera sincronización del espacio personal">
      <p>Encontramos guardados en este navegador. Elige si quieres combinarlos con tu espacio sincronizado.</p>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("vera:workspace-sync-choice",
        { detail: { userId: Number(userId), action: "merge" } }))}>Combinar guardados</button>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("vera:workspace-sync-choice",
        { detail: { userId: Number(userId), action: "remote" } }))}>Usar espacio sincronizado</button>
    </div>}
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
