import { useEffect, useState } from "react";
import "./ConnectivityStatus.css";

function ConnectivityStatus() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const showSnapshot = (event) => setSnapshot(event.detail);
    const clearSnapshot = () => setSnapshot(null);
    window.addEventListener("vera:offline-snapshot", showSnapshot);
    window.addEventListener("vera:online-data", clearSnapshot);
    window.addEventListener("vera:offline-vault-locked", clearSnapshot);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("vera:offline-snapshot", showSnapshot);
      window.removeEventListener("vera:online-data", clearSnapshot);
      window.removeEventListener("vera:offline-vault-locked", clearSnapshot);
    };
  }, []);

  if (!offline && !snapshot) return null;
  return <div className="vera-connectivity-status" role="status" aria-live="polite">
    {snapshot ? `Mostrando copia local de ${snapshot.module}, guardada el ${new Date(snapshot.savedAt).toLocaleString("es-MX")}. Los cambios requieren conexión.`
      : "Sin conexión. Puedes consultar secciones guardadas al desbloquear tu espacio local; los cambios requieren internet."}
  </div>;
}

export default ConnectivityStatus;
