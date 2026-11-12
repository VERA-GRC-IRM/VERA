import "./RouteLoading.css";

export default function RouteLoading() {
  return <div className="route-loading" role="status" aria-live="polite">
    <div className="route-loading-card">
      <img src="/vera-logo.svg" alt="" width="44" height="44" />
      <div>
        <strong>VERA</strong>
        <span>Abriendo pantalla…</span>
      </div>
    </div>
  </div>;
}
