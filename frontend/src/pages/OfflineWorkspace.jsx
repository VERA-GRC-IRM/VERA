import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { useDocumentTitle } from "../contexts/useDocumentTitle";
import { createOfflineVault, deleteOfflineVault, exportOfflineVault, hasOfflineVault,
  importOfflineVault, lockOfflineVault, unlockOfflineVault } from "../services/offlineVault";
import { captureOfflineSnapshots, getOfflineSnapshots, purgeDeniedOfflineSnapshots,
  SNAPSHOT_MODULES, SNAPSHOT_TTL_MS, removeOfflineSnapshot } from "../services/offlineSnapshots";
import { searchOfflineRecords } from "../services/offlineSearch";
import { getOfflineEvidenceBlob, getOfflineEvidenceFiles,
  removeOfflineEvidenceFile, saveOfflineEvidenceFile } from "../services/offlineEvidenceFiles";
import { getEditableOfflineRecords, inspectOfflineRecordConflict,
  saveOfflineRecordDescription, syncOfflineRecordDescription } from "../services/offlineRecordDrafts";
import { cleanupOfflineVault } from "../services/offlineCleanup";
import { deleteOfflineDraft, getDraftableActions, getOfflineDrafts, inspectOfflineActionConflict,
  getEvidenceDraftTargets, getFindingDraftTargets, saveOfflineDraft, saveOfflineEvidenceDraft,
  saveOfflineFindingDraft, syncOfflineDraft, syncOfflineEvidenceDraft,
  syncOfflineFindingDraft } from "../services/offlineDrafts";
import "./OfflineWorkspace.css";

const readStorageStatus = async () => {
  if (!navigator.storage?.estimate || !navigator.storage?.persisted) return { available: false };
  try {
    const [estimate, persistent] = await Promise.all([
      navigator.storage.estimate(), navigator.storage.persisted()
    ]);
    return { available: true, persistent, usage: estimate.usage, quota: estimate.quota };
  } catch { return { available: false }; }
};
const readSavedEvidenceFiles = () => {
  try { return getOfflineEvidenceFiles(); }
  catch { return []; }
};

const PREPARATION_PACKS = [
  { id: "overview", label: "Portafolio y pendientes", sections: ["dashboard", "planning", "activeAudits", "notifications"] },
  { id: "fieldwork", label: "Trabajo de auditoría", sections: ["activeAudits", "risks", "riskOwners", "controls", "findings", "actions", "evidence"] },
  { id: "report", label: "Informe local", sections: ["report"] }
];

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
  const [selected, setSelected] = useState(() => {
    const section = new URLSearchParams(window.location.search).get("seccion");
    return SNAPSHOT_MODULES.some((module) => module.id === section) ? [section] : [];
  });
  const [snapshots, setSnapshots] = useState({});
  const [captureResults, setCaptureResults] = useState([]);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [drafts, setDrafts] = useState([]);
  const [queueFilter, setQueueFilter] = useState("all");
  const [draftableActions, setDraftableActions] = useState([]);
  const [draftType, setDraftType] = useState("GENERAL_NOTE");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftActionId, setDraftActionId] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftProgress, setDraftProgress] = useState("0");
  const [deleteDraftId, setDeleteDraftId] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [evidenceTargets, setEvidenceTargets] = useState([]);
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [evidenceType, setEvidenceType] = useState("DOCUMENT");
  const [evidenceTargetIndex, setEvidenceTargetIndex] = useState("");
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceInputKey, setEvidenceInputKey] = useState(0);
  const [findingTargets, setFindingTargets] = useState([]);
  const [findingTargetIndex, setFindingTargetIndex] = useState("");
  const [findingTitle, setFindingTitle] = useState("");
  const [findingDescription, setFindingDescription] = useState("");
  const [storageStatus, setStorageStatus] = useState(null);
  const [storageMessage, setStorageMessage] = useState("");
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchModule, setSearchModule] = useState("");
  const [backupFile, setBackupFile] = useState(null);
  const [restorePhrase, setRestorePhrase] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [conflictDetails, setConflictDetails] = useState({});
  const [savedEvidenceFiles, setSavedEvidenceFiles] = useState([]);
  const [recordType, setRecordType] = useState("RISK");
  const [recordId, setRecordId] = useState("");
  const [recordDescription, setRecordDescription] = useState("");
  const [recordReason, setRecordReason] = useState("");
  let editableRecords = [];
  if (open && ["SUPER_ADMIN", "GERENTE"].includes(user.role)) {
    try { editableRecords = getEditableOfflineRecords(recordType); }
    catch { editableRecords = []; }
  }
  const currentTime = checkedAt;
  const savedSections = Object.values(snapshots);
  const readySections = savedSections.filter((item) => {
    const age = currentTime - Date.parse(item.savedAt);
    return Number.isFinite(age) && age >= 0 && age <= SNAPSHOT_TTL_MS;
  });
  const pendingDrafts = drafts.filter((item) => item.state === "DRAFT" && item.type !== "GENERAL_NOTE").length;
  const reviewDrafts = drafts.filter((item) => ["CONFLICT", "NEEDS_REVIEW"].includes(item.state)).length;
  const completedDrafts = drafts.filter((item) => item.state === "SYNCED").length;
  const noteDrafts = drafts.filter((item) => item.type === "GENERAL_NOTE").length;
  const queueFilters = [
    { id: "all", label: "Todos", count: drafts.length },
    { id: "ready", label: "Para enviar", count: pendingDrafts },
    { id: "review", label: "Revisar", count: reviewDrafts },
    { id: "notes", label: "Notas", count: noteDrafts },
    { id: "sent", label: "Enviados", count: completedDrafts }
  ];
  const visibleDrafts = drafts.filter((draft) => {
    if (queueFilter === "ready") return draft.state === "DRAFT" && draft.type !== "GENERAL_NOTE";
    if (queueFilter === "review") return ["CONFLICT", "NEEDS_REVIEW"].includes(draft.state);
    if (queueFilter === "notes") return draft.type === "GENERAL_NOTE";
    if (queueFilter === "sent") return draft.state === "SYNCED";
    return true;
  });
  const searchResults = open ? searchOfflineRecords(snapshots, SNAPSHOT_MODULES, {
    query: searchTerm, moduleId: searchModule, now: currentTime, ttlMs: SNAPSHOT_TTL_MS
  }) : [];

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

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    readStorageStatus().then((status) => { if (active) setStorageStatus(status); });
    return () => { active = false; };
  }, [open, snapshots, drafts]);

  const saveEvidenceForOffline = async (id) => {
    setBusy(true); setError("");
    try {
      await saveOfflineEvidenceFile(id);
      setSavedEvidenceFiles(readSavedEvidenceFiles());
    } catch (cause) {
      try { setSnapshots(getOfflineSnapshots()); setSavedEvidenceFiles(readSavedEvidenceFiles()); }
      catch { /* El espacio pudo bloquearse. */ }
      setError(cause.message);
    } finally { setBusy(false); }
  };

  const removeSavedEvidence = async (id) => {
    setBusy(true); setError("");
    try { await removeOfflineEvidenceFile(id); setSavedEvidenceFiles(readSavedEvidenceFiles()); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const downloadSavedEvidence = (id) => {
    setError("");
    try {
      const { blob, name } = getOfflineEvidenceBlob(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = name;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (cause) { setError(cause.message); }
  };

  const requestStoragePersistence = async () => {
    setStorageMessage("");
    if (!navigator.storage?.persist) return;
    try {
      const granted = await navigator.storage.persist();
      setStorageStatus(await readStorageStatus());
      setStorageMessage(granted
        ? "El navegador concedió conservación reforzada. Borrar los datos del sitio seguirá eliminando la copia."
        : "El navegador no concedió conservación reforzada. Mantén suficiente espacio y no borres los datos del sitio.");
    } catch { setStorageMessage("No se pudo solicitar conservación al navegador."); }
  };

  const cleanCompletedLocalData = async () => {
    if (!confirmCleanup) { setConfirmCleanup(true); return; }
    setBusy(true); setError(""); setCleanupMessage("");
    try {
      const result = await cleanupOfflineVault();
      setSnapshots(getOfflineSnapshots()); setDrafts(getOfflineDrafts());
      setSavedEvidenceFiles(readSavedEvidenceFiles()); setCheckedAt(Date.now());
      try { setDraftableActions(getDraftableActions()); } catch { setDraftableActions([]); }
      setEvidenceTargets(getEvidenceDraftTargets()); setFindingTargets(getFindingDraftTargets());
      setCleanupMessage(`Limpieza local terminada: ${result.removedSections} secciones caducadas, ${result.removedDrafts} borradores enviados y ${result.removedFiles} archivos sin copia vigente. Los pendientes y conflictos se conservaron.`);
      setConfirmCleanup(false);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const downloadBackup = async () => {
    setError(""); setBackupMessage(""); setBusy(true);
    try {
      const backup = await exportOfflineVault(user.id);
      const url = URL.createObjectURL(new Blob([backup.json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = backup.fileName;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setBackupMessage("Copia cifrada descargada. Guarda el archivo y la frase local por separado.");
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const restoreBackup = async (event) => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      await importOfflineVault(user.id, backupFile, restorePhrase);
      await purgeDeniedOfflineSnapshots();
      setExists(true); setOpen(true);
      setSnapshots(getOfflineSnapshots()); setDrafts(getOfflineDrafts());
      setSavedEvidenceFiles(readSavedEvidenceFiles());
      try { setDraftableActions(getDraftableActions()); } catch { setDraftableActions([]); }
      setEvidenceTargets(getEvidenceDraftTargets()); setFindingTargets(getFindingDraftTargets());
      setCheckedAt(Date.now()); setBackupFile(null); setRestorePhrase("");
      setBackupMessage("Copia restaurada en este dispositivo. Revisa la vigencia de cada sección antes de usarla.");
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

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
      await purgeDeniedOfflineSnapshots();
      setOpen(true);
      setSnapshots(getOfflineSnapshots());
      setDrafts(getOfflineDrafts());
      setSavedEvidenceFiles(readSavedEvidenceFiles());
      try { setDraftableActions(getDraftableActions()); } catch { setDraftableActions([]); }
      setEvidenceTargets(getEvidenceDraftTargets());
      setFindingTargets(getFindingDraftTargets());
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
      setDrafts([]);
      setSavedEvidenceFiles([]);
      setConfirmDelete(false);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const capture = async (moduleIds = selected) => {
    setBusy(true);
    setError("");
    setCaptureResults([]);
    try {
      const results = await captureOfflineSnapshots(moduleIds);
      setCaptureResults(results);
      setSnapshots(getOfflineSnapshots());
      setSavedEvidenceFiles(readSavedEvidenceFiles());
      try { setDraftableActions(getDraftableActions()); } catch { setDraftableActions([]); }
      setEvidenceTargets(getEvidenceDraftTargets());
      setFindingTargets(getFindingDraftTargets());
      setCheckedAt(Date.now());
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const toggleSelection = (id) => setSelected((current) => current.includes(id)
    ? current.filter((value) => value !== id) : [...current, id]);

  const removeSnapshot = async (id) => {
    setBusy(true);
    setError("");
    try {
      await removeOfflineSnapshot(id);
      setSnapshots(getOfflineSnapshots());
      setSavedEvidenceFiles(readSavedEvidenceFiles());
      setFindingTargets(getFindingDraftTargets());
      setSelected((current) => current.filter((value) => value !== id));
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const submitDraft = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveOfflineDraft({ type: draftType, title: draftTitle, actionId: draftActionId,
        note: draftNote, progressPercent: draftProgress });
      setDrafts(getOfflineDrafts());
      setDraftTitle(""); setDraftNote(""); setDraftActionId(""); setDraftProgress("0");
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const removeDraft = async (id) => {
    if (deleteDraftId !== id) { setDeleteDraftId(id); return; }
    setBusy(true);
    setError("");
    try {
      await deleteOfflineDraft(id); setDrafts(getOfflineDrafts()); setDeleteDraftId("");
      setConflictDetails((current) => { const next = { ...current }; delete next[id]; return next; });
    }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const compareConflict = async (id) => {
    setBusy(true); setError("");
    try {
      const draft = drafts.find((item) => item.id === id);
      const current = draft?.type === "RECORD_DESCRIPTION"
        ? await inspectOfflineRecordConflict(id) : await inspectOfflineActionConflict(id);
      setConflictDetails((details) => ({ ...details, [id]: current }));
    } catch (cause) {
      setConflictDetails((current) => { const next = { ...current }; delete next[id]; return next; });
      setError(cause.message);
    }
    finally { setBusy(false); }
  };

  const sendDraft = async (id) => {
    setBusy(true);
    setError("");
    try {
      const draft = drafts.find((item) => item.id === id);
      if (draft?.type === "EVIDENCE_UPLOAD") await syncOfflineEvidenceDraft(id);
      else if (draft?.type === "FINDING_CREATE") await syncOfflineFindingDraft(id);
      else if (draft?.type === "RECORD_DESCRIPTION") await syncOfflineRecordDescription(id);
      else await syncOfflineDraft(id);
    }
    catch (cause) { setError(cause.message); }
    finally {
      try { setDrafts(getOfflineDrafts()); }
      catch { setOpen(false); setDrafts([]); }
      setBusy(false);
    }
  };

  const stageEvidence = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const target = evidenceTargets[Number(evidenceTargetIndex)];
      if (!target) throw new Error("Selecciona un expediente guardado.");
      await saveOfflineEvidenceDraft({ title: evidenceTitle, description: evidenceDescription,
        evidenceType, entityType: target.entityType, entityId: target.entityId }, evidenceFile);
      setDrafts(getOfflineDrafts());
      setEvidenceTitle(""); setEvidenceDescription(""); setEvidenceFile(null);
      setEvidenceTargetIndex(""); setEvidenceInputKey((value) => value + 1);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const stageFinding = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const target = findingTargets[Number(findingTargetIndex)];
      if (!target) throw new Error("Selecciona un control y riesgo guardados.");
      await saveOfflineFindingDraft({ ...target, title: findingTitle, description: findingDescription });
      setDrafts(getOfflineDrafts());
      setFindingTitle(""); setFindingDescription(""); setFindingTargetIndex("");
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const stageRecordDescription = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await saveOfflineRecordDescription({ recordType, recordId,
        description: recordDescription, reason: recordReason });
      setDrafts(getOfflineDrafts()); setRecordId(""); setRecordDescription(""); setRecordReason("");
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

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
              <section className="offline-readiness" aria-labelledby="offline-readiness-title">
                <div className="offline-readiness-heading">
                  <h3 id="offline-readiness-title">Estado de este dispositivo</h3>
                  <span>{online ? "Red detectada por el dispositivo" : "Sin red detectada"}</span>
                </div>
                <div className="offline-readiness-grid">
                  <p><strong>{readySections.length}</strong><span>Secciones vigentes</span></p>
                  <p><strong>{savedSections.length - readySections.length}</strong><span>Copias caducadas</span></p>
                  <p><strong>{pendingDrafts}</strong><span>Trabajos pendientes de envío</span></p>
                  <p><strong>{reviewDrafts}</strong><span>Trabajos que requieren revisión</span></p>
                </div>
                <p className="offline-readiness-hint">{readySections.length
                  ? "Estas copias se pueden consultar sin red hasta 24 horas después de guardarlas. Los pendientes aún no están en el servidor."
                  : "Guarda al menos una sección con conexión antes de trabajar sin red."}</p>
                {drafts.length > 0 && <a className="offline-queue-link" href="#offline-work-queue">Ver trabajo local guardado</a>}
                {readySections.length > 0 && <p className="offline-readiness-hint">Copia más reciente: {new Date(Math.max(
                  ...readySections.map((item) => Date.parse(item.savedAt))
                )).toLocaleString("es-MX")}. Consulta la fecha individual de cada sección antes de usarla.</p>}
                <div className="offline-storage-status">
                  <strong>Conservación en este navegador</strong>
                  <p>{!storageStatus ? "Consultando almacenamiento…" : storageStatus.available
                    ? `Uso estimado de este sitio: ${typeof storageStatus.usage === "number" ? `${(storageStatus.usage / 1048576).toFixed(1)} MiB` : "no disponible"}${typeof storageStatus.quota === "number" ? ` de ${(storageStatus.quota / 1048576).toFixed(0)} MiB informados por el navegador` : ""}. Conservación reforzada: ${storageStatus.persistent ? "concedida" : "no concedida"}.`
                    : "Este navegador no informa si puede conservar la copia de forma reforzada."}</p>
                  {storageStatus?.available && !storageStatus.persistent && navigator.storage?.persist &&
                    <button type="button" className="secondary-action" onClick={requestStoragePersistence}>Solicitar conservación al navegador</button>}
                  {storageMessage && <p role="status">{storageMessage}</p>}
                  <p>El espacio indicado incluye datos y archivos de este sitio; es una estimación, no una reserva. Si borras los datos del navegador, perderás la copia local.</p>
                  <button type="button" className="secondary-action" disabled={busy} onClick={downloadBackup}>Descargar copia cifrada</button>
                  {backupMessage && <p role="status">{backupMessage}</p>}
                  <p>El archivo se guarda en tu dispositivo, nunca en el servidor. Quien tenga el archivo y la frase podrá leerlo; consérvalos por separado.</p>
                  {(savedSections.length - readySections.length > 0 || completedDrafts > 0) && <div className="offline-cleanup">
                    <p>Hay {savedSections.length - readySections.length} secciones caducadas y {completedDrafts} borradores ya enviados que puedes retirar de este dispositivo. Los trabajos pendientes y con conflicto se conservarán.</p>
                    <button type="button" className="secondary-action" disabled={busy} onClick={cleanCompletedLocalData}>
                      {confirmCleanup ? "Confirmar limpieza local" : "Limpiar datos finalizados"}
                    </button>
                    {confirmCleanup && <button type="button" className="secondary-action" disabled={busy} onClick={() => setConfirmCleanup(false)}>Cancelar</button>}
                  </div>}
                  {cleanupMessage && <p role="status">{cleanupMessage}</p>}
                </div>
              </section>
              <section className="offline-local-search" aria-labelledby="offline-local-search-title">
                <h3 id="offline-local-search-title">Buscar en copias vigentes</h3>
                <p>La búsqueda ocurre solo en este dispositivo y no consulta al servidor. Incluye únicamente las secciones guardadas y vigentes.</p>
                <div className="offline-local-search-fields">
                  <label>Buscar registro<input type="search" value={searchTerm} maxLength={120}
                    onChange={(event) => setSearchTerm(event.target.value)} placeholder="Nombre, folio, área o estado" /></label>
                  <label>Sección<select value={searchModule} onChange={(event) => setSearchModule(event.target.value)}>
                    <option value="">Todas las copias</option>
                    {SNAPSHOT_MODULES.filter((module) => module.listKey && snapshots[module.id])
                      .map((module) => <option key={module.id} value={module.id}>{module.label}</option>)}
                  </select></label>
                </div>
                {searchTerm.trim().length >= 2 && <div role="status" aria-live="polite">
                  <p>{searchResults.length ? `${searchResults.length}${searchResults.length === 50 ? " o más" : ""} ${searchResults.length === 1 ? "coincidencia" : "coincidencias"} en copias locales.`
                    : "No hay coincidencias en las copias vigentes. Amplía la búsqueda o actualiza las secciones con conexión."}</p>
                  {searchResults.length > 0 && <ul>{searchResults.map((result, index) => <li key={`${result.moduleId}:${result.id}:${index}`}>
                    <div><strong>{result.title}</strong><small>{result.moduleLabel}{result.id ? ` · ${result.id}` : ""}{result.status ? ` · ${result.status}` : ""} · copia del {new Date(result.savedAt).toLocaleString("es-MX")}</small></div>
                    <Link to={result.link}>Abrir sección</Link>
                  </li>)}</ul>}
                </div>}
              </section>
              <fieldset className="offline-snapshot-options">
                <legend>Secciones para consultar sin conexión</legend>
                <div className="offline-preparation-packs" role="group" aria-label="Selección rápida de secciones">
                  <p>Elige un conjunto o selecciona cada sección. Nada se descarga hasta que pulses «Actualizar secciones elegidas»; el servidor comprobará tus permisos en cada una.</p>
                  <div>{PREPARATION_PACKS.map((pack) => <button key={pack.id} type="button"
                    className="secondary-action" disabled={busy}
                    onClick={() => setSelected(pack.sections)}>{pack.label}</button>)}
                    <button type="button" className="secondary-action" disabled={busy || !selected.length}
                      onClick={() => setSelected([])}>Limpiar selección</button></div>
                  <small>{selected.length} de {SNAPSHOT_MODULES.length} secciones seleccionadas. Límite: 2 MiB por sección y 8 MiB en conjunto; una sección que exceda el límite no reemplaza su copia anterior.</small>
                </div>
                {SNAPSHOT_MODULES.map((module) => {
                  const snapshot = snapshots[module.id];
                  const fresh = snapshot && checkedAt - Date.parse(snapshot.savedAt) <= SNAPSHOT_TTL_MS;
                  return <div className="offline-snapshot-row" key={module.id}>
                    <label><input type="checkbox" checked={selected.includes(module.id)} onChange={() => toggleSelection(module.id)} />
                      <span><strong>{module.label}</strong>{snapshot && <small>
                        {fresh ? "Guardado" : "Caducado"} · {new Date(snapshot.savedAt).toLocaleString("es-MX")}
                      </small>}</span></label>
                    {fresh && <Link to={module.link}>Abrir</Link>}
                    {snapshot && <button type="button" className="secondary-action" disabled={busy} onClick={() => removeSnapshot(module.id)}>Quitar copia</button>}
                  </div>;
                })}
              </fieldset>
              <div className="offline-vault-actions">
                <button type="button" className="primary-action" onClick={() => capture()} disabled={busy || !selected.length || !online}>
                  {busy ? "Actualizando copia…" : "Actualizar secciones elegidas"}
                </button>
                {Object.keys(snapshots).length > 0 && <button type="button" className="secondary-action"
                  onClick={() => capture(Object.keys(snapshots))} disabled={busy || !online}>
                  Revalidar copias guardadas
                </button>}
                <button type="button" className="secondary-action" onClick={() => { lockOfflineVault(); setOpen(false); setSnapshots({}); setSavedEvidenceFiles([]); setCaptureResults([]); }}>Bloquear espacio local</button>
              </div>
              {captureResults.length > 0 && <div className="offline-snapshot-results" role="status">
                <strong>Resultado de la actualización</strong>
                <ul>{captureResults.map((result) => <li key={result.id}>
                  {SNAPSHOT_MODULES.find((module) => module.id === result.id)?.label}: {result.ok
                    ? `guardado${result.count === null ? "" : ` (${result.count} registros)`}` : `${result.message}${result.retained ? " (la copia anterior permanece)" : ""}`}
                </li>)}</ul>
              </div>}
              <section className="offline-evidence-reading" aria-labelledby="offline-evidence-reading-title">
                <h3 id="offline-evidence-reading-title">Archivos para consulta sin red</h3>
                <p>Guarda explícitamente hasta dos archivos autorizados de Evidencias. Quedan cifrados en este dispositivo y se pueden descargar mientras la copia de Evidencias esté vigente. Las referencias externas no se guardan.</p>
                {snapshots.evidence && checkedAt - Date.parse(snapshots.evidence.savedAt) <= SNAPSHOT_TTL_MS
                  ? <ul>{snapshots.evidence.data.evidence.filter((item) => item.file).map((item) => {
                    const saved = savedEvidenceFiles.find((file) => String(file.id) === String(item.id));
                    return <li key={item.id}><div><strong>{item.title}</strong><small>{Math.ceil(item.file.size / 1024)} KiB · {item.entityType} {item.entityId}{saved ? ` · guardado el ${new Date(saved.savedAt).toLocaleString("es-MX")}` : ""}</small></div>
                      <div>{saved ? <><button type="button" className="secondary-action" onClick={() => downloadSavedEvidence(item.id)}>Descargar copia local</button>
                        <button type="button" className="secondary-action" disabled={busy} onClick={() => removeSavedEvidence(item.id)}>Quitar archivo</button></>
                        : <button type="button" className="secondary-action" disabled={busy || !online} onClick={() => saveEvidenceForOffline(item.id)}>Guardar archivo autorizado</button>}</div></li>;
                  })}</ul>
                  : <p role="status">Actualiza la sección Evidencias con conexión antes de elegir archivos.</p>}
                <small>{savedEvidenceFiles.length} de 2 archivos guardados; máximo 6 MiB en conjunto. Al revalidar Evidencias, los archivos retirados o cambiados se eliminan de la copia.</small>
              </section>
              <div className="offline-drafts">
                <h3>Borradores de trabajo</h3>
                <p>Quedan solo en este dispositivo hasta que los uses o los borres. No son cambios enviados ni aprobados.</p>
                <form className="offline-vault-form" onSubmit={submitDraft}>
                  <label>Tipo de borrador<select value={draftType} onChange={(event) => setDraftType(event.target.value)}>
                    <option value="GENERAL_NOTE">Nota de trabajo</option>
                    <option value="ACTION_COMMENT">Comentario de plan de acción</option>
                    <option value="ACTION_PROGRESS">Avance de plan de acción</option>
                  </select></label>
                  {draftType === "GENERAL_NOTE" ? <label>Título<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={120} required /></label>
                    : <label>Plan de acción guardado<select value={draftActionId} onChange={(event) => setDraftActionId(event.target.value)} required>
                      <option value="">Selecciona un plan</option>
                      {draftableActions.map((action) => <option key={action.id} value={action.id}>{action.title}</option>)}
                    </select></label>}
                  {draftType === "ACTION_PROGRESS" && <label>Avance (%)<input type="number" min="0" max="100" step="1" value={draftProgress} onChange={(event) => setDraftProgress(event.target.value)} required /></label>}
                  <label>{draftType === "GENERAL_NOTE" ? "Nota" : "Explicación"}<textarea value={draftNote} onChange={(event) => setDraftNote(event.target.value)} maxLength={draftType === "GENERAL_NOTE" ? 5000 : 1000} required /></label>
                  {draftType !== "GENERAL_NOTE" && draftableActions.length === 0 && <p role="status">Actualiza primero la sección Planes de acción con conexión.</p>}
                  <button type="submit" className="primary-action" disabled={busy || (draftType !== "GENERAL_NOTE" && !draftableActions.length)}>Guardar borrador local</button>
                </form>
                {["SUPER_ADMIN", "GERENTE"].includes(user.role) && <form className="offline-vault-form offline-record-form" onSubmit={stageRecordDescription}>
                  <h4>Preparar descripción de riesgo o control</h4>
                  <p>Guarda una descripción revisada como borrador cifrado. Al enviarla, VERA comprobará el permiso, el valor original y la versión del registro. Las evaluaciones y decisiones siguen en línea.</p>
                  <label>Tipo de registro<select value={recordType} onChange={(event) => { setRecordType(event.target.value); setRecordId(""); }}>
                    <option value="RISK">Riesgo</option><option value="CONTROL">Control</option>
                  </select></label>
                  <label>Registro guardado<select value={recordId} onChange={(event) => setRecordId(event.target.value)} required>
                    <option value="">Selecciona un registro</option>
                    {editableRecords.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
                  </select></label>
                  <label>Descripción revisada<textarea value={recordDescription} onChange={(event) => setRecordDescription(event.target.value)} minLength={10} maxLength={recordType === "RISK" ? 2000 : 1000} required /></label>
                  <label>Motivo del cambio<textarea value={recordReason} onChange={(event) => setRecordReason(event.target.value)} minLength={10} maxLength={300} required /></label>
                  {!editableRecords.length && <p role="status">Actualiza la sección {recordType === "RISK" ? "Riesgos" : "Controles"} con conexión. Solo aparecerán registros versionados en una copia vigente.</p>}
                  <button type="submit" className="primary-action" disabled={busy || !editableRecords.length}>Guardar descripción local</button>
                </form>}
                {["SUPER_ADMIN", "GERENTE", "AUDITOR"].includes(user.role) && <form className="offline-vault-form" onSubmit={stageFinding}>
                  <h4>Preparar hallazgo</h4>
                  <p>Elige un control con efectividad insuficiente y un riesgo vinculado de las copias vigentes. El registro se intentará solo cuando lo confirmes con conexión; el servidor volverá a validar la relación y tus permisos.</p>
                  <label>Control y riesgo guardados<select value={findingTargetIndex} onChange={(event) => setFindingTargetIndex(event.target.value)} required>
                    <option value="">Selecciona un control y riesgo</option>
                    {findingTargets.map((target, index) => <option key={`${target.controlId}:${target.riskId}`} value={index}>{target.controlTitle} · {target.riskTitle}</option>)}
                  </select></label>
                  <label>Nombre del hallazgo<input value={findingTitle} onChange={(event) => setFindingTitle(event.target.value)} minLength={3} maxLength={120} required /></label>
                  <label>Descripción del hallazgo<textarea value={findingDescription} onChange={(event) => setFindingDescription(event.target.value)} minLength={10} maxLength={2000} required /></label>
                  {!findingTargets.length && <p role="status">Actualiza primero Controles y Riesgos con conexión. Solo aparecerán relaciones elegibles en las copias vigentes.</p>}
                  <button type="submit" className="primary-action" disabled={busy || !findingTargets.length}>Guardar hallazgo local</button>
                </form>}
                {["SUPER_ADMIN", "GERENTE", "AUDITOR", "JEFATURA"].includes(user.role) && <form className="offline-vault-form offline-evidence-form" onSubmit={stageEvidence}>
                  <h4>Preparar archivo de evidencia</h4>
                  <p>El archivo quedará cifrado en este dispositivo. Solo se vinculará al expediente cuando lo cargues con conexión y el servidor lo confirme.</p>
                  <label>Nombre de evidencia<input value={evidenceTitle} onChange={(event) => setEvidenceTitle(event.target.value)} minLength={3} maxLength={120} required /></label>
                  <label>Descripción de evidencia<textarea value={evidenceDescription} onChange={(event) => setEvidenceDescription(event.target.value)} minLength={10} maxLength={1000} required /></label>
                  <label>Tipo de evidencia<select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)}>
                    <option value="DOCUMENT">Documento</option><option value="SCREENSHOT">Captura</option>
                    <option value="REPORT">Informe</option><option value="OTHER">Otro</option>
                  </select></label>
                  <label>Expediente guardado<select value={evidenceTargetIndex} onChange={(event) => setEvidenceTargetIndex(event.target.value)} required>
                    <option value="">Selecciona un expediente</option>
                    {evidenceTargets.filter((target) => target.entityType !== "AUDIT" || ["SUPER_ADMIN", "GERENTE"].includes(user.role))
                      .map((target) => <option key={`${target.entityType}:${target.entityId}`} value={evidenceTargets.indexOf(target)}>{target.entityType} · {target.title}</option>)}
                  </select></label>
                  <label>Archivo (hasta 3 MiB)<input key={evidenceInputKey} type="file" accept=".pdf,.xls,.xlsx,.doc,.docx,.csv,.png,.jpg,.jpeg,.webp,.txt" onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)} required /></label>
                  <button type="submit" className="primary-action" disabled={busy || !evidenceTargets.length}>Guardar archivo local</button>
                </form>}
                {drafts.length > 0 && <section id="offline-work-queue" className="offline-work-queue" aria-labelledby="offline-work-queue-title">
                  <h4 id="offline-work-queue-title">Trabajo local guardado</h4>
                  <p>Filtra los borradores de este dispositivo. Enviar o revisar requiere conexión y permisos vigentes; las notas no se envían.</p>
                  <div className="offline-queue-filters" role="group" aria-label="Filtrar trabajo local">
                    {queueFilters.map((filter) => <button key={filter.id} type="button" aria-pressed={queueFilter === filter.id}
                      onClick={() => setQueueFilter(filter.id)}>{filter.label} ({filter.count})</button>)}
                  </div>
                  <p role="status" aria-live="polite">{visibleDrafts.length} de {drafts.length} trabajos locales visibles.</p>
                  {visibleDrafts.length === 0 && <p>No hay trabajos en esta vista. Elige otro filtro para ver los demás.</p>}
                  {visibleDrafts.length > 0 && <ul className="offline-draft-list">{visibleDrafts.map((draft) => <li key={draft.id}>
                  <div><strong>{draft.title}</strong><small>{{ GENERAL_NOTE: "Nota", ACTION_PROGRESS: "Avance", ACTION_COMMENT: "Comentario", EVIDENCE_UPLOAD: "Archivo de evidencia", FINDING_CREATE: "Hallazgo", RECORD_DESCRIPTION: "Descripción de registro" }[draft.type] || draft.type} · {new Date(draft.createdAt).toLocaleString("es-MX")} · {{ DRAFT: "Pendiente de usar", SYNCED: "Enviado al servidor", CONFLICT: "Conflicto de versión", NEEDS_REVIEW: "Confirmación pendiente" }[draft.state] || draft.state}</small>
                    {draft.note && <p>{draft.note}</p>}{draft.type === "ACTION_PROGRESS" && <small>Avance propuesto: {draft.progressPercent}%</small>}
                    {draft.type === "FINDING_CREATE" && <><p>{draft.description}</p><small>{draft.controlTitle} · {draft.riskTitle}</small></>}
                    {draft.type === "RECORD_DESCRIPTION" && <><p>{draft.description}</p><small>{draft.recordType === "RISK" ? "Riesgo" : "Control"} {draft.recordId} · versión de origen {draft.expected.storageVersion} · Motivo: {draft.reason}</small></>}
                    {draft.type === "EVIDENCE_UPLOAD" && <small>{draft.fileName} · {Math.ceil(draft.fileBytes / 1024)} KiB · {draft.entityType} {draft.entityId}</small>}</div>
                  <div className="offline-draft-actions">
                    {draft.type !== "GENERAL_NOTE" && draft.state === "DRAFT" && <button type="button" className="primary-action" disabled={busy || !online} onClick={() => sendDraft(draft.id)}>{{ EVIDENCE_UPLOAD: "Cargar evidencia", FINDING_CREATE: "Registrar hallazgo", RECORD_DESCRIPTION: "Enviar descripción" }[draft.type] || "Enviar al servidor"}</button>}
                    {draft.type === "RECORD_DESCRIPTION" && draft.state === "NEEDS_REVIEW" && <p>La respuesta del envío se perdió. Revisa el registro actual; VERA no repetirá esta edición automáticamente.</p>}
                    {draft.type === "FINDING_CREATE" && draft.state === "NEEDS_REVIEW" && <>
                      <p>La respuesta anterior se perdió. Al continuar, VERA comprobará la misma operación; si no se había guardado, intentará registrarla ahora.</p>
                      <button type="button" className="primary-action" disabled={busy || !online} onClick={() => sendDraft(draft.id)}>Comprobar o reintentar hallazgo</button>
                    </>}
                    {["ACTION_PROGRESS", "ACTION_COMMENT"].includes(draft.type) && draft.state === "NEEDS_REVIEW" && <>
                      <p>La respuesta anterior se perdió. VERA comprobará la misma operación antes de aplicar algún cambio.</p>
                      <button type="button" className="primary-action" disabled={busy || !online} onClick={() => sendDraft(draft.id)}>Comprobar o reintentar plan</button>
                    </>}
                    {["ACTION_PROGRESS", "ACTION_COMMENT"].includes(draft.type) && draft.state === "CONFLICT" && <>
                      <button type="button" className="secondary-action" disabled={busy || !online}
                        onClick={() => compareConflict(draft.id)}>Comparar con plan actual</button>
                      {conflictDetails[draft.id] && <div className="offline-conflict-compare">
                        <strong>Comparación para decidir</strong>
                        <div className="offline-conflict-grid">
                          <section><h4>Tu borrador local</h4><p>{draft.note}</p>
                            {draft.type === "ACTION_PROGRESS" && <small>Avance propuesto: {draft.progressPercent}%</small>}
                            <small>Versión de origen: {draft.version}</small></section>
                          <section><h4>Plan actual en VERA</h4><p>{conflictDetails[draft.id].title}</p>
                            <small>Estado: {conflictDetails[draft.id].status} · Versión: {conflictDetails[draft.id].version}</small>
                            {Number.isInteger(conflictDetails[draft.id].progressPercent) &&
                              <small>Avance actual: {conflictDetails[draft.id].progressPercent}%</small>}
                            {conflictDetails[draft.id].lastChange?.note &&
                              <p>Último cambio: {conflictDetails[draft.id].lastChange.note}</p>}</section>
                        </div>
                        <p>Revisa el plan actual antes de crear un borrador nuevo. VERA no combina ni sobrescribe cambios automáticamente.</p>
                      </div>}
                    </>}
                    {draft.type === "RECORD_DESCRIPTION" && draft.state === "CONFLICT" && <>
                      <button type="button" className="secondary-action" disabled={busy || !online} onClick={() => compareConflict(draft.id)}>Comparar descripción actual</button>
                      {conflictDetails[draft.id] && <div className="offline-conflict-compare"><strong>Comparación para decidir</strong>
                        <div className="offline-conflict-grid"><section><h4>Tu borrador local</h4><p>{draft.description}</p><small>Versión original: {draft.expected.storageVersion}</small></section>
                          <section><h4>Registro actual en VERA</h4><p>{conflictDetails[draft.id].description}</p><small>Versión actual: {conflictDetails[draft.id].storageVersion}</small></section></div>
                        <p>Revisa la diferencia y prepara un nuevo borrador si aún corresponde. VERA no sobrescribe cambios concurrentes.</p>
                      </div>}
                    </>}
                    {draft.type !== "GENERAL_NOTE" && ["CONFLICT", "NEEDS_REVIEW"].includes(draft.state) && <Link to={{ EVIDENCE_UPLOAD: "/evidencias", FINDING_CREATE: "/controles", RECORD_DESCRIPTION: draft.recordType === "RISK" ? "/riesgos" : "/controles" }[draft.type] || "/notificaciones"}>Revisar {{ EVIDENCE_UPLOAD: "evidencias", FINDING_CREATE: "hallazgos", RECORD_DESCRIPTION: "registro" }[draft.type] || "plan"}</Link>}
                    <button type="button" className="secondary-action" disabled={busy} onClick={() => removeDraft(draft.id)}>{deleteDraftId === draft.id ? "Confirmar borrado" : "Borrar borrador"}</button>
                  </div>
                </li>)}</ul>}
                </section>}
              </div>
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
              {!exists && <form onSubmit={restoreBackup} className="offline-vault-form offline-backup-restore">
                <h3>Restaurar una copia cifrada</h3>
                <p>Usa un archivo descargado para esta misma cuenta y dirección de VERA. No reemplaza una copia existente ni recupera datos ya enviados al servidor.</p>
                <label>Archivo de copia<input type="file" accept=".json,application/json"
                  onChange={(event) => setBackupFile(event.target.files?.[0] || null)} required /></label>
                <label>Frase local original<input type="password" autoComplete="off" value={restorePhrase}
                  onChange={(event) => setRestorePhrase(event.target.value)} minLength={15} required /></label>
                <button className="secondary-action" type="submit" disabled={busy || !backupFile}>Restaurar copia</button>
              </form>}
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
