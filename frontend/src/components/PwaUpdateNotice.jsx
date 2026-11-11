import { useRegisterSW } from "virtual:pwa-register/react";
import "./PwaUpdateNotice.css";

function PwaUpdateNotice() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return <div className="vera-pwa-update" role="status" aria-live="polite">
    <span>Hay una nueva versión de VERA. Guarda tus borradores antes de actualizar.</span>
    <button type="button" onClick={() => updateServiceWorker()}>Actualizar ahora</button>
    <button type="button" onClick={() => setNeedRefresh(false)}>Más tarde</button>
  </div>;
}

export default PwaUpdateNotice;
