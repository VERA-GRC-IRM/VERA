import { useState } from "react";
import { ExternalLink, Link2 } from "lucide-react";
import { buildTeamsShareUrl } from "../utils/teamsShare";
import "./ShareLinkButton.css";

export default function ShareLinkButton({ path, label = "Copiar enlace" }) {
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState(false);
  const url = new URL(path, window.location.origin).href;
  const teamsUrl = buildTeamsShareUrl(path, window.location.origin);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Enlace copiado");
      setManual(false);
    } catch {
      setMessage("Selecciona y copia el enlace");
      setManual(true);
    }
  };
  return <span className="share-link-control">
    <button type="button" className="secondary-action share-link-button" aria-label={label}
      onClick={(event) => { event.stopPropagation(); copy(); }}>
      <Link2 size={15} aria-hidden="true" /> <span>{label}</span>
    </button>
    {teamsUrl && <a className="secondary-action share-link-teams" href={teamsUrl}
      target="_blank" rel="noopener noreferrer" aria-label="Compartir enlace en Microsoft Teams"
      title="Elegir destinatarios en Microsoft Teams">
      <ExternalLink size={15} aria-hidden="true" /> Teams
    </a>}
    {message && <small role="status">{message}</small>}
    {manual && <input readOnly aria-label="Enlace para copiar" value={url}
      onFocus={(event) => event.target.select()} onClick={(event) => { event.stopPropagation(); event.target.select(); }} />}
  </span>;
}
