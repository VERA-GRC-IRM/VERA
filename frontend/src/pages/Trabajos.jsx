import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { cancelJob, downloadJob, listJobs } from "../services/jobService";
import "./Trabajos.css";

const LABELS = { QUEUED: "En espera", RUNNING: "Preparando", COMPLETED: "Listo",
  FAILED: "No se pudo completar", CANCELLED: "Cancelado" };

export default function Trabajos() {
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => { try { setJobs(await listJobs()); setError(""); }
    catch (cause) { setError(cause.message); } };
  useEffect(() => {
    let active = true;
    const refresh = async () => { try { const rows = await listJobs(); if (active) setJobs(rows); }
      catch (cause) { if (active) setError(cause.message); } };
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 10_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const act = async (operation) => { setBusy(true); try { await operation(); await load(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  return <div className="dashboard-layout"><Sidebar active="trabajos" /><main className="dashboard-main">
    <header className="page-heading"><span className="eyebrow">TU ACTIVIDAD</span>
      <h1>Centro de trabajos</h1><p>Las exportaciones siguen preparándose aunque cierres esta pantalla.</p></header>
    {error && <p role="alert" className="planning-message error">{error}</p>}
    <div className="job-toolbar"><button type="button" className="secondary-action" onClick={() => act(load)}
      disabled={busy}>Actualizar</button></div>
    {!jobs.length && <p>Todavía no hay trabajos. Inicia una exportación desde Buscar auditorías.</p>}
    <div className="job-list">{jobs.map((job) => <article key={job.id} className="job-card">
      <div><strong>Reporte {job.format.toUpperCase()}</strong><span>{LABELS[job.status] || job.status}</span></div>
      <small>Solicitado: {new Date(job.createdAt).toLocaleString("es-MX")} · ID {job.id}</small>
      <div className="job-actions">
        {job.status === "COMPLETED" && <button type="button" className="secondary-action" disabled={busy}
          onClick={() => act(() => downloadJob(job.id, job.format))}>Descargar</button>}
        {["QUEUED", "RUNNING"].includes(job.status) && <button type="button" className="secondary-action"
          disabled={busy} onClick={() => act(() => cancelJob(job.id))}>Cancelar</button>}
        {job.status === "FAILED" && <small>Vuelve a solicitar el reporte desde Buscar auditorías.</small>}
      </div>
    </article>)}</div>
  </main></div>;
}
