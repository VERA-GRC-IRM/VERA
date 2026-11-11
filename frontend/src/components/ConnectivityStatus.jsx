import { useEffect, useState } from "react";
import "./ConnectivityStatus.css";

function ConnectivityStatus() {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return <div className="vera-connectivity-status" role="status" aria-live="polite">
    Sin conexión. Puedes abrir VERA, pero las consultas y los cambios necesitan internet.
  </div>;
}

export default ConnectivityStatus;
