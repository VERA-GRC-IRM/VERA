import { useEffect, useState } from "react";
import { Bookmark, Save } from "lucide-react";
import { readWorkspace, saveView, toggleFavorite } from "../services/personalWorkspace";
import "./WorkspaceActions.css";

export function BookmarkButton({ userId, path, label }) {
  const [saved, setSaved] = useState(() => readWorkspace(userId).favorites.some((item) => item.path === path));
  const [error, setError] = useState("");
  useEffect(() => {
    const update = () => setSaved(readWorkspace(userId).favorites.some((item) => item.path === path));
    window.addEventListener("vera:workspace-change", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("vera:workspace-change", update); window.removeEventListener("storage", update); };
  }, [userId, path]);
  if (!userId) return null;
  return <span className="workspace-action">
    <button type="button" className="secondary-action" aria-pressed={saved}
      onClick={() => { const next = toggleFavorite(userId, path, label);
        if (next === null) setError("No se pudo guardar en este navegador."); else { setSaved(next); setError(""); } }}>
      <Bookmark size={15} aria-hidden="true" /> {saved ? "Guardado" : "Guardar"}
    </button>{error && <small role="alert">{error}</small>}
  </span>;
}

export function SaveViewButton({ userId, path, defaultName }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [message, setMessage] = useState("");
  if (!userId) return null;
  const submit = (event) => {
    event.preventDefault();
    if (saveView(userId, path, name)) { setMessage(import.meta.env.VITE_VERA_WORKSPACE_SYNC_ENABLED === "true"
      ? "Vista guardada; sincronización en curso" : "Vista guardada en este navegador"); setOpen(false); }
    else setMessage("No se pudo guardar la vista.");
  };
  return <span className="workspace-action">
    <button type="button" className="secondary-action" onClick={() => { setOpen((value) => !value); setMessage(""); }}
      aria-expanded={open}><Save size={15} aria-hidden="true" /> Guardar vista</button>
    {open && <form className="workspace-save-form" onSubmit={submit}>
      <label>Nombre de la vista<input required minLength={3} maxLength={80} value={name}
        onChange={(event) => setName(event.target.value)} /></label>
      <button type="submit">Guardar</button>
    </form>}
    {message && <small role="status">{message}</small>}
  </span>;
}
