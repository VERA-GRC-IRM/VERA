import { Link } from "react-router-dom";
import ThemeControl from "./ThemeControl";
import LoginCompanion from "./LoginCompanion";
import { PUBLIC_NAVIGATION } from "../constants/publicNavigation";
import { prefetchNavigation } from "../routeLoaders";

const journey = ["Planificación", "Auditorías", "Riesgos y controles", "Evidencias"];

function AccessShell({ children, variant = "login" }) {
  return <div className={`access-page access-page--${variant}`}>
    <a className="skip-link" href="#access-content">Saltar al contenido</a>
    <header className="access-header">
      <Link className="access-brand" to="/acerca" onPointerEnter={() => prefetchNavigation("/acerca")} onFocus={() => prefetchNavigation("/acerca")} aria-label="VERA, conocer la plataforma">
        <img src="/vera-logo.svg" alt="" width="42" height="42" />
        <span><strong>VERA</strong><small>Digital Systems</small></span>
      </Link>
      <nav className="access-header__links" aria-label="Navegación pública">
        {PUBLIC_NAVIGATION.map(({ to, label }) => <Link key={to} to={to} onPointerEnter={() => prefetchNavigation(to)} onFocus={() => prefetchNavigation(to)}>{label}</Link>)}
        <Link to="/privacidad" onPointerEnter={() => prefetchNavigation("/privacidad")} onFocus={() => prefetchNavigation("/privacidad")}>Privacidad</Link>
      </nav>
      <div className="access-header__appearance"><ThemeControl compact /></div>
    </header>

    <main id="access-content" className="access-main">
      <aside className="access-intro" aria-label="Presentación de VERA">
        <p className="access-eyebrow">VERIFICACIÓN · EVIDENCIA · RIESGO · AUDITORÍA</p>
        <p className="access-intro__title">Decisiones de auditoría con contexto y trazabilidad.</p>
        <p>Planifica, consulta y da seguimiento a la información que respalda cada decisión, desde un solo lugar.</p>
        <ol className="access-journey" aria-label="Recorrido de la plataforma">
          {journey.map((step, index) => <li key={step}>
            <span aria-hidden="true">0{index + 1}</span>{step}
          </li>)}
        </ol>
        <p className="access-demo-note">Entorno de demostración · Usa únicamente datos de prueba.</p>
        {variant === "login" && <LoginCompanion />}
      </aside>
      <section className="access-card" aria-label={variant === "register" ? "Crear cuenta" : "Acceder a VERA"}>
        {children}
      </section>
    </main>
    <footer className="access-footer">
      <span>VERA · Plataforma de auditoría interna</span>
      <Link to="/privacidad">Aviso de privacidad</Link>
    </footer>
  </div>;
}

export default AccessShell;
