import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { searchRecords } from "../services/universalSearchService";
import "./GlobalSearch.css";

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function visiblePageActions() {
  return [...document.querySelectorAll(".dashboard-main button, .dashboard-main a[href]")]
    .filter((element) => !element.disabled && element.getClientRects().length > 0)
    .map((element, index) => ({
      key: `page-${index}`,
      label: (element.getAttribute("aria-label") || element.getAttribute("title") || element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 90),
      element,
      group: "En esta pantalla"
    }))
    .filter(({ label }) => label.length > 1);
}

function GlobalSearch({ groups, previewRoles, onNavigate, onPreviewRole, onRevealAppearance, onLogout, onOpen, disabled }) {
  const location = useLocation();
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const focusAfterCloseRef = useRef(null);
  const skipRestoreRef = useRef(false);
  const [query, setQuery] = useState("");
  const [pageActions, setPageActions] = useState([]);
  const [recordMatches, setRecordMatches] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState("");

  const openSearch = useCallback(() => {
    if (disabled) return;
    onOpen();
    setPageActions(visiblePageActions());
    setQuery("");
    setRecordMatches([]);
    setRecordsError("");
    setRecordsLoading(false);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [disabled, onOpen]);

  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [openSearch]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || term.length > 80) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchRecords(term, controller.signal)
        .then((records) => { setRecordMatches(records); setRecordsError(""); })
        .catch((error) => { if (!controller.signal.aborted) setRecordsError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setRecordsLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const updateQuery = (value) => {
    setQuery(value);
    setRecordMatches([]);
    setRecordsError("");
    setRecordsLoading(value.trim().length >= 2 && value.trim().length <= 80);
  };

  const commands = [
    ...groups.flatMap(({ label, items }) => items.map((item) => ({ key: item.id, label: item.label, group: label, kind: "navigate", path: item.path }))),
    ...previewRoles.map(({ role, label }) => ({ key: `role-${role}`, label: `Recorrer vista de ${label}`, group: "Vistas de rol", kind: "preview", role })),
    { key: "appearance", label: "Apariencia", group: "Cuenta", kind: "appearance" },
    { key: "logout", label: "Cerrar sesión", group: "Cuenta", kind: "logout" },
    ...pageActions.map((action) => ({ ...action, kind: "focus" }))
  ];
  const search = normalize(query.trim());
  const matches = search ? commands.filter(({ label, group }) => normalize(`${label} ${group}`).includes(search)) : commands;
  const ask = search && query.trim().length >= 3 && location.pathname !== "/asistente"
    ? { key: "ask-vera", label: `Preguntar a VERA: ${query.trim()}`, group: "Asistente de IA", kind: "ask" } : null;
  const conversational = ask && (query.trim().split(/\s+/).length > 1 || /[¿?]/.test(query));
  const records = recordMatches.map((item) => ({ key: `record-${item.type}-${item.id}`,
    label: item.title, group: `${item.type} · ${item.code || item.id}`, kind: "record", path: item.path }));
  const options = [...records, ...matches];
  const results = ask ? conversational ? [ask, ...options] : [...options, ask] : options;

  const choose = (key) => {
    const result = results.find((item) => item.key === key);
    if (!result) return;
    if (result.kind === "focus") focusAfterCloseRef.current = result.element;
    else skipRestoreRef.current = true;
    const selectedQuestion = result.kind === "ask" ? query.trim() : "";
    dialogRef.current?.close();
    if (result.kind === "navigate" || result.kind === "record") onNavigate(result.path);
    if (result.kind === "preview") onPreviewRole(result.role);
    if (result.kind === "appearance") onRevealAppearance();
    if (result.kind === "logout") onLogout();
    if (result.kind === "ask") window.dispatchEvent(new CustomEvent("vera:assistant-open",
      { detail: { question: selectedQuestion } }));
  };

  const onClose = () => {
    updateQuery("");
    if (skipRestoreRef.current) {
      skipRestoreRef.current = false;
      focusAfterCloseRef.current = null;
      return;
    }
    const target = focusAfterCloseRef.current;
    focusAfterCloseRef.current = null;
    requestAnimationFrame(() => {
      if (target?.isConnected) {
        target.scrollIntoView({ block: "nearest" });
        target.focus();
      } else triggerRef.current?.focus();
    });
  };

  return <>
    <header className="global-shell-header">
      <button type="button" className="global-search-trigger" ref={triggerRef} onClick={openSearch}
        aria-label="Buscar secciones, acciones y registros" aria-keyshortcuts="Control+K Meta+K">
        <Search size={19} aria-hidden="true" />
        <span>Buscar en VERA</span>
        <kbd>Ctrl K</kbd>
      </button>
    </header>
    <dialog ref={dialogRef} className="global-search-dialog" aria-label="Buscar en VERA" onClose={onClose}>
      <div className="global-search-input-row">
        <Search size={20} aria-hidden="true" />
        <input ref={inputRef} type="search" value={query} onChange={(event) => updateQuery(event.target.value)} maxLength={800}
          aria-label="Buscar secciones, acciones y registros" placeholder="Sección, acción o registro"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); resultsRef.current?.querySelector("button")?.focus(); }
            if (event.key === "Enter" && results.length) { event.preventDefault(); choose(results[0].key); }
          }} />
        <button type="button" className="global-search-close" onClick={() => dialogRef.current?.close()} aria-label="Cerrar búsqueda"><X size={20} /></button>
      </div>
      <p className="global-search-count" aria-live="polite">{results.length} {results.length === 1 ? "resultado" : "resultados"}</p>
      {recordsLoading && <p className="global-search-help" role="status">Buscando registros disponibles…</p>}
      {recordsError && <p className="global-search-help" role="alert">{recordsError}</p>}
      <div className="global-search-results" ref={resultsRef}>
        {results.length ? results.map((result) => <button key={result.key} type="button" className="global-search-result"
          data-command-key={result.key} onClick={(event) => choose(event.currentTarget.dataset.commandKey)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); event.currentTarget.nextElementSibling?.focus(); }
            if (event.key === "ArrowUp") { event.preventDefault(); (event.currentTarget.previousElementSibling || inputRef.current)?.focus(); }
          }}>
          <span>{result.label}</span><small>{result.group}{result.kind === "focus" ? " · localizar control" : ""}</small>
        </button>) : <p className="global-search-empty">No hay opciones que coincidan. Prueba con otra palabra.</p>}
      </div>
      <p className="global-search-help">Seleccionar un control de la pantalla lo enfoca; no ejecuta su acción.</p>
    </dialog>
  </>;
}

export default GlobalSearch;
