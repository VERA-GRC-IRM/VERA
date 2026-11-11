import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { useDocumentTitle } from "../contexts/useDocumentTitle";
import { createOfflineVault, deleteOfflineVault, hasOfflineVault,
  lockOfflineVault, unlockOfflineVault } from "../services/offlineVault";
import { captureOfflineSnapshots, getOfflineSnapshots, SNAPSHOT_MODULES,
  SNAPSHOT_TTL_MS } from "../services/offlineSnapshots";
import "./OfflineWorkspace.css";

function OfflineWorkspace() {
  useDocumentTitle("Sin conexión");
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const [exists, setExists] = useState(null);
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selected, setSelected] = useState([]);
  const [snapshots, setSnapshots] = useState({});
  const [captureResults, setCaptureResults] = useState([]);
  const [checkedAt, setCheckedAt] = useState(0);

  useEffect(() => {
    let active = true;
    hasOfflineVault(user.id).then((value) => { if (active) setExists(value); })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => {
    const timer = setInterval(() => setCheckedAt(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!exists) {
        if (phrase !== confirmation) throw new Error("Las frases locales no coinciden.");
        if (!navigator.onLine) throw new Error("Conéctate para habilitar este espacio por primera vez.");
        const response = await fetch("/api/dashboard", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, cache: "no-store"
        });
        if (!response.ok) throw new Error("Inicia sesión de nuevo antes de habilitar una copia local.");
        await createOfflineVault(user.id, phrase);
        setExists(true);
      } else await unlockOfflineVault(user.id, phrase);
      setOpen(true);
      setSnapshots(getOfflineSnapshots());
      setCheckedAt(Date.now());
      setPhrase("");
      setConfirmation("");
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true);
    setError("");
    try {
      await deleteOfflineVault(user.id);
      setOpen(false);
      setExists(false);
      setSnapshots({});
      setCaptureResults([]);
      setConfirmDelete(false);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const capture = async () => {
    setBusy(true);
    setError("");
    setCaptureResults([]);
    try {
      const results = await captureOfflineSnapshots(selected);
      setCaptureResults(results);
      setSnapshots(getOfflineSnapshots());
      setCheckedAt(Date.now());
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const toggleSelection = (id) => setSelected((current) => current.includes(id)
    ? current.filter((value) => value !== id) : [...current, id]);

  return <div className="dashboard-layout">
    <Sidebar active="offline" />
    <main className="dashboard-main">
      <section className="dashboard-content offline-workspace">
        <header className="dashboard-header"><div>
          <span className="eyebrow">TRABAJO SIN CONEXIÓN</span>
          <h1>Espacio local</h1>
          <p>Prepara una copia privada para consultar trabajo autorizado cuando este dispositivo pierda la conexión.</p>
        </div></header>

        {user.roleTour ? <p role="status">El recorrido de otro rol es solo de lectura en línea. Vuelve a tu cuenta para crear un espacio local.</p>
          : <div className="offline-vault-card">
            {exists === null && !error ? <p role="status">Revisando este dispositivo…</p> : null}
            {error && <p className="planning-message error" role="alert">{error}</p>}
            {open ? <>
              <h2>Espacio desbloqueado</h2>
              <p>Elige qué secciones autorizadas quieres guardar en este dispositivo. La copia caduca a las 24 horas y nunca confirma cambios en el servidor.</p>
              <fieldset className="offline-snapshot-options">
                <legend>Secciones para consultar sin conexión</legend>
                {SNAPSHOT_MODULES.map((module) => {
                  const snapshot = snapshots[module.id];
                  const fresh = snapshot && checkedAt - Date.parse(snapshot.savedAt) <= SNAPSHOT_TTL_MS;
                  return <label key={module.id}>
                    <input type="checkbox" checked={selected.includes(module.id)} onChange={() => toggleSelection(module.id)} />
                    <span><strong>{module.label}</strong>{snapshot && <small>
                      {fresh ? "Guardado" : "Caducado"} · {new Date(snapshot.savedAt).toLocaleString("es-MX")}
                    </small>}</span>
                    {fresh && <Link to={module.link}>Abrir</Link>}
                  </label>;
                })}
              </fieldset>
              <div className="offline-vault-actions">
                <button type="button" className="primary-action" onClick={capture} disabled={busy || !selected.length || !navigator.onLine}>
                  {busy ? "Actualizando copia…" : "Actualizar secciones elegidas"}
                </button>
                <button type="button" className="secondary-action" onClick={() => { lockOfflineVault(); setOpen(false); setSnapshots({}); setCaptureResults([]); }}>Bloquear espacio local</button>
              </div>
              {captureResults.length > 0 && <div className="offline-snapshot-results" role="status">
                <strong>Resultado de la actualización</strong>
                <ul>{captureResults.map((result) => <li key={result.id}>
                  {SNAPSHOT_MODULES.find((module) => module.id === result.id)?.label}: {result.ok
                    ? `guardado${result.count === null ? "" : ` (${result.count} registros)`}` : result.message}
                </li>)}</ul>
              </div>}
            </> : exists !== null && <>
              <h2>{exists ? "Desbloquear copia local" : "Habilitar copia local"}</h2>
              <p>{exists ? "Introduce la frase que elegiste para este dispositivo." :
                "Elige una frase exclusiva para esta copia. No se envía a VERA y no podremos recuperarla."}</p>
              <form onSubmit={submit} className="offline-vault-form">
                <label>Frase local<input type="password" autoComplete="off" value={phrase}
                  onChange={(event) => setPhrase(event.target.value)} minLength={exists ? undefined : 15} required /></label>
                {!exists && <label>Repetir frase local<input type="password" autoComplete="off" value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)} minLength={15} required /></label>}
                <button className="primary-action" type="submit" disabled={busy}>{exists ? "Desbloquear" : "Crear espacio"}</button>
              </form>
            </>}
            {exists && <div className="offline-vault-delete">
              <button type="button" className="secondary-action" disabled={busy} onClick={remove}>
                {confirmDelete ? "Confirmar borrado de esta copia" : "Borrar copia de este dispositivo"}
              </button>
              {confirmDelete && <button type="button" className="secondary-action" onClick={() => setConfirmDelete(false)}>Cancelar</button>}
            </div>}
          </div>}
      </section>
    </main>
  </div>;
}

export default OfflineWorkspace;
