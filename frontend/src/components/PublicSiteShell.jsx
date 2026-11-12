import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import ThemeControl from "./ThemeControl";
import { PUBLIC_NAVIGATION } from "../constants/publicNavigation";
import { prefetchNavigation } from "../routeLoaders";
import "../pages/PublicOverview.css";

function PublicSiteShell({ children, mainId = "public-main" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return <div className="public-overview">
    <a className="skip-link" href={`#${mainId}`}>Saltar al contenido</a>
    <div className="public-overview__shell">
      <header className="public-overview__header">
        <Link className="public-overview__brand" to="/acerca" aria-label="VERA, ir a Plataforma" onPointerEnter={() => prefetchNavigation("/acerca")} onFocus={() => prefetchNavigation("/acerca")} onClick={() => setMenuOpen(false)}>
          <img src="/vera-logo.svg" alt="" width="42" height="42" />
          <span>VERA<small>Digital Systems</small></span>
        </Link>
        <button ref={menuButtonRef} className="public-overview__menu-toggle" type="button" aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen} aria-controls="public-primary-nav" onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
        <nav id="public-primary-nav" className={`public-overview__nav${menuOpen ? " is-open" : ""}`} aria-label="Navegación pública">
          {PUBLIC_NAVIGATION.map(({ to, label, secondary }) => <NavLink key={to} to={to} className={({ isActive }) => `public-overview__nav-link${secondary ? " public-overview__nav-link--secondary" : ""}${isActive ? " is-active" : ""}`} onPointerEnter={() => prefetchNavigation(to)} onFocus={() => prefetchNavigation(to)} onClick={() => setMenuOpen(false)}>{label}</NavLink>)}
          <ThemeControl compact />
          <Link className="public-overview__login" to="/" onPointerEnter={() => prefetchNavigation("/")} onFocus={() => prefetchNavigation("/")} onClick={() => setMenuOpen(false)}>Acceder a VERA</Link>
        </nav>
      </header>

      <main id={mainId}>{children}</main>

      <footer className="public-overview__footer">
        <div>
          <strong>VERA <span>Digital Systems</span></strong>
          <p>Decisiones de auditoría con contexto y trazabilidad.</p>
          <small>Entorno de demostración · Usa únicamente datos de prueba.</small>
        </div>
        <nav aria-label="Enlaces de pie de página">
          <Link to="/acerca" onPointerEnter={() => prefetchNavigation("/acerca")} onFocus={() => prefetchNavigation("/acerca")}>Plataforma</Link>
          <Link to="/soluciones" onPointerEnter={() => prefetchNavigation("/soluciones")} onFocus={() => prefetchNavigation("/soluciones")}>Soluciones</Link>
          <Link to="/confianza" onPointerEnter={() => prefetchNavigation("/confianza")} onFocus={() => prefetchNavigation("/confianza")}>Confianza</Link>
          <Link to="/tecnologia" onPointerEnter={() => prefetchNavigation("/tecnologia")} onFocus={() => prefetchNavigation("/tecnologia")}>Tecnología</Link>
          <Link to="/privacidad" onPointerEnter={() => prefetchNavigation("/privacidad")} onFocus={() => prefetchNavigation("/privacidad")}>Aviso de privacidad</Link>
          <a href="https://github.com/VERA-GRC-IRM/VERA">Código en GitHub</a>
        </nav>
      </footer>
    </div>
  </div>;
}

export default PublicSiteShell;
