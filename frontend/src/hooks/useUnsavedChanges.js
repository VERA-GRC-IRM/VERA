import { useEffect, useRef } from "react";

const DISCARD_MESSAGE = "Hay cambios sin guardar. ¿Quieres descartarlos?";

export function requestViewChange({ hardNavigation = false } = {}) {
  return window.dispatchEvent(new CustomEvent("vera:before-view-change", {
    cancelable: true, detail: { hardNavigation }
  }));
}

export function cancelViewChange() {
  window.dispatchEvent(new Event("vera:view-change-cancelled"));
}

export default function useUnsavedChanges(active, currentForm, initialForm) {
  const dirty = active && JSON.stringify(currentForm) !== initialForm;
  const allowUnload = useRef(false);

  useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (event) => {
      if (allowUnload.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const beforeViewChange = (event) => {
      if (!window.confirm(DISCARD_MESSAGE)) event.preventDefault();
      else if (event.detail?.hardNavigation) allowUnload.current = true;
    };
    const viewChangeCancelled = () => { allowUnload.current = false; };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("vera:before-view-change", beforeViewChange);
    window.addEventListener("vera:view-change-cancelled", viewChangeCancelled);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("vera:before-view-change", beforeViewChange);
      window.removeEventListener("vera:view-change-cancelled", viewChangeCancelled);
    };
  }, [dirty]);

  return () => !dirty || window.confirm(DISCARD_MESSAGE);
}
