import { useCallback, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import AccessShell from "../components/AccessShell";
import LoginCompanion from "../components/LoginCompanion";
import { useDocumentTitle } from "../contexts/useDocumentTitle";
import { exchangeManagedSession, finishPasswordMfaEnrollment, loginUser, startPasswordMfaEnrollment, verify2FA } from "../services/authService";
import { managedAuth, googleAuthEnabled, microsoftAuthEnabled, startSocialSignIn, takeSocialPrivacyAcknowledgement } from "../services/managedAuth";
import { PRIVACY_NOTICE_VERSION } from "../constants/privacyNotice";
import { clearRoleTourSession } from "../services/roleTour";
import { prefetchNavigation } from "../routeLoaders";
import "./Login.css";

function Login() {
  useDocumentTitle("Iniciar sesión");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [tempToken, setTempToken] = useState(null); // set when the server asks for a 2FA code
  const [managedFactorId, setManagedFactorId] = useState(null);
  const [managedQr, setManagedQr] = useState(null);
  const [setupToken, setSetupToken] = useState(null);
  const [setupQr, setSetupQr] = useState(null);
  const [setupSecret, setSetupSecret] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const navigate = useNavigate();

  const finishLogin = useCallback((data) => {
    clearRoleTourSession();
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    const transition = document.getElementById("vera-first-frame");
    transition?.replaceWith(transition.cloneNode(true));
    navigate("/dashboard");
  }, [navigate]);

  const prepareManagedMfa = useCallback(async () => {
    const { data, error: factorsError } = await managedAuth.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const existing = data?.totp?.find((factor) => factor.status === "verified");
    if (existing) {
      setManagedFactorId(existing.id);
      setManagedQr(null);
      return;
    }
    const { data: enrolled, error: enrollError } = await managedAuth.auth.mfa.enroll({ factorType: "totp" });
    if (enrollError) throw enrollError;
    setManagedFactorId(enrolled.id);
    setManagedQr(enrolled.totp.qr_code);
  }, []);

  const completeManaged = useCallback(async (accessToken, fromOAuthRedirect = false) => {
    try {
      const privacyAccepted = fromOAuthRedirect ? takeSocialPrivacyAcknowledgement() : false;
      const data = await exchangeManagedSession(accessToken, privacyAccepted, PRIVACY_NOTICE_VERSION);
      finishLogin(data);
    } catch (verificationError) {
      if (verificationError.code === "MFA_REQUIRED") {
        await prepareManagedMfa();
        return;
      }
      await managedAuth.auth.signOut();
      throw verificationError;
    }
  }, [finishLogin, prepareManagedMfa]);

  useEffect(() => {
    if (!managedAuth) return;
    let active = true;
    managedAuth.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      try { await completeManaged(data.session.access_token, true); }
      catch (sessionError) { if (active) setError(sessionError.message); }
    }).catch(() => { if (active) setError("No se pudo restaurar el acceso. Intenta de nuevo."); });
    return () => { active = false; };
  }, [completeManaged]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    prefetchNavigation("/dashboard");
    setError("");
    setBusy(true);

    try {
      if (setupToken) {
        const data = await finishPasswordMfaEnrollment(setupToken, code);
        finishLogin(data);
      } else if (managedFactorId) {
        const { error: factorError } = await managedAuth.auth.mfa.challengeAndVerify({
          factorId: managedFactorId, code
        });
        if (factorError) throw factorError;
        const { data } = await managedAuth.auth.getSession();
        if (!data.session) throw new Error("La sesión expiró. Inicia sesión de nuevo.");
        await completeManaged(data.session.access_token);
      } else if (tempToken) {
        // Step 2: verify the 6-digit code
        const data = await verify2FA(tempToken, code);
        finishLogin(data);
      } else {
        // Step 1: username + password
        let data;
        try { data = await loginUser(username, password); }
        catch (legacyError) {
          if (!managedAuth || legacyError.status !== 401 || !username.includes("@")) throw legacyError;
          const managed = await managedAuth.auth.signInWithPassword({
            email: username.trim().toLowerCase(), password: password.normalize("NFC")
          });
          if (managed.error || !managed.data.session) throw legacyError;
          await completeManaged(managed.data.session.access_token);
          return;
        }

        if (data.requiresMfaSetup) {
          const enrollment = await startPasswordMfaEnrollment(data.setupToken);
          setSetupToken(data.setupToken);
          setSetupQr(enrollment.qr);
          setSetupSecret(enrollment.secret);
        } else if (data.requires2FA) {
          setTempToken(data.tempToken);
        } else {
          finishLogin(data);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleBack = async () => {
    if (managedFactorId) await managedAuth.auth.signOut();
    setTempToken(null);
    setManagedFactorId(null);
    setManagedQr(null);
    setSetupToken(null);
    setSetupQr(null);
    setSetupSecret(null);
    setCode("");
    setPassword("");
    setError("");
  };

  const beginSocial = async (provider) => {
    setError("");
    setSocialBusy(provider);
    try { await startSocialSignIn(provider); }
    catch {
      setError("No se pudo iniciar el acceso con este proveedor. Intenta más tarde.");
      setSocialBusy(null);
    }
  };

  return (
    <AccessShell>
      <div className="access-card__heading">
        <p className="access-card__eyebrow"><LockKeyhole size={15} aria-hidden="true" /> ACCESO A VERA</p>
        <h1>{tempToken || managedFactorId || setupToken ? "Verifica tu acceso" : "Bienvenido a VERA"}</h1>
        <p>{tempToken || managedFactorId || setupToken
          ? "Introduce el código de seis dígitos de tu aplicación de autenticación."
          : "Elige cómo quieres iniciar sesión."}</p>
      </div>

      {!tempToken && !managedFactorId && !setupToken && <div className="access-companion-mobile"><LoginCompanion compact /></div>}

      {(googleAuthEnabled || microsoftAuthEnabled) && !tempToken && !managedFactorId && !setupToken &&
        <div className="social-options" aria-label="Acceso con proveedor de identidad">
          {microsoftAuthEnabled && <button type="button" disabled={busy || Boolean(socialBusy)}
            onClick={() => beginSocial("azure")}>{socialBusy === "azure" ? "Abriendo Microsoft…" : "Continuar con Microsoft"}</button>}
          {googleAuthEnabled && <button type="button" disabled={busy || Boolean(socialBusy)}
            onClick={() => beginSocial("google")}>{socialBusy === "google" ? "Abriendo Google…" : "Continuar con Google"}</button>}
        </div>}

      {(googleAuthEnabled || microsoftAuthEnabled) && !tempToken && !managedFactorId && !setupToken &&
        <div className="auth-divider"><span>o accede con contraseña</span></div>}

      <form className="auth-form" onSubmit={handleSubmit}>
        {tempToken || managedFactorId || setupToken ? (
          <>
            {setupQr && <div className="mfa-enrollment">
              <p>Para terminar tu primer acceso, escanea este QR con una aplicación de autenticación e introduce su código. El correo no se usa para este paso.</p>
              <img src={setupQr} alt="Código QR para configurar el doble factor" />
              <p>Si no puedes escanearlo, usa esta clave: <code>{setupSecret}</code></p>
            </div>}
            {managedQr && <div className="mfa-enrollment">
              <p>Escanea este código con tu aplicación de autenticación. Se exigirá en cada acceso con contraseña.</p>
              <img src={managedQr} alt="Código QR para configurar la aplicación de autenticación" />
            </div>}
            <label htmlFor="verification-code">Código de autenticación</label>
            <input type="text" id="verification-code" inputMode="numeric" pattern="[0-9]{6}"
              autoComplete="one-time-code" maxLength={6} value={code} required
              aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="6 dígitos" autoFocus />
          </>
        ) : (
          <>
            <label htmlFor="login-username">Correo electrónico</label>
            <input type="text" id="login-username" inputMode="email" value={username} required
              onChange={(event) => setUsername(event.target.value)} placeholder="tu@correo.com"
              autoComplete="username" aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined} />

            <label htmlFor="login-password">Contraseña</label>
            <div className="auth-password-field">
              <input type={showPassword ? "text" : "password"} id="login-password" value={password}
                onChange={(event) => setPassword(event.target.value)} required
                onKeyUp={(event) => setCapsLockOn(event.getModifierState("CapsLock"))}
                onKeyDown={(event) => setCapsLockOn(event.getModifierState("CapsLock"))}
                onBlur={() => setCapsLockOn(false)} autoComplete="current-password"
                aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
              <button className="auth-password-toggle" type="button" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            {capsLockOn && <p className="auth-hint" role="status">Bloq Mayús está activado.</p>}
          </>
        )}

        {error && <p id="login-error" className="auth-error" role="alert">{error}</p>}

        <button className="auth-primary" type="submit" disabled={busy || Boolean(socialBusy)}>
          {busy ? "Un momento…" : tempToken || managedFactorId || setupToken ? "Verificar y entrar" : "Iniciar sesión"}
        </button>
        {(tempToken || managedFactorId || setupToken) &&
          <button type="button" className="auth-back" onClick={handleBack}>Volver a los métodos de acceso</button>}
      </form>

      <div className="access-card__bottom">
        <p>¿Primera vez en VERA? <Link to="/registro" onPointerEnter={() => prefetchNavigation("/registro")} onFocus={() => prefetchNavigation("/registro")}>Crear cuenta</Link></p>
        <p className="auth-hint">Si aún no tienes cuenta, el registro explica el rol inicial y el aviso de privacidad.</p>
      </div>
    </AccessShell>
  );
}

export default Login;
