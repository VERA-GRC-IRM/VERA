import { useState } from "react";
import { Link2 } from "lucide-react";
import "./ShareLinkButton.css";

export default function ShareLinkButton({ path, label = "Copiar enlace" }) {
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState(false);
  const url = new URL(path, window.location.origin).href;
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
    <button type="button" className="secondary-action share-link-button" onClick={copy}>
      <Link2 size={15} aria-hidden="true" /> {label}
    </button>
    {message && <small role="status">{message}</small>}
    {manual && <input readOnly aria-label="Enlace para copiar" value={url}
      onFocus={(event) => event.target.select()} onClick={(event) => event.target.select()} />}
  </span>;
}
