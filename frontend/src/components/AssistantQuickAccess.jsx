import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import "../pages/Asistente.css";

const AssistantDrawer = lazy(() => import("./AssistantDrawer"));

function AssistantQuickAccess() {
  const [open, setOpen] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState("");
  const location = useLocation();
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const openWithQuestion = (event) => {
      const question = String(event.detail?.question || "").trim();
      if (location.pathname === "/asistente" || question.length < 3 || question.length > 800) return;
      setInitialQuestion(question);
      setOpen(true);
    };
    window.addEventListener("vera:assistant-open", openWithQuestion);
    return () => window.removeEventListener("vera:assistant-open", openWithQuestion);
  }, [location.pathname]);
  useEffect(() => {
    if (location.pathname === "/asistente") return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || !event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) ||
          event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setInitialQuestion("");
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [location.pathname]);
  if (location.pathname === "/asistente") return null;
  return <>
    <button className="assistant-quick-access" type="button" onClick={() => { setInitialQuestion(""); setOpen(true); }}
      aria-label="Abrir asistente de IA" aria-keyshortcuts="Control+Alt+K Meta+Alt+K"
      title="Abrir asistente · Ctrl+Alt+K"><img src="/vera-logo.svg" alt="" /><span>Preguntar a VERA</span></button>
    {open && <Suspense fallback={null}><AssistantDrawer initialQuestion={initialQuestion} onClose={close} /></Suspense>}
  </>;
}

export default AssistantQuickAccess;
