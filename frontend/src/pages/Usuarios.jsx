import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Inbox } from "lucide-react";
import Sidebar from "../components/Sidebar";
import {
  getUsers,
  updateUserRole,
  updateUserStatus,
  getPendingRoleRequests,
  reviewRoleRequest
} from "../services/userService";
import { ROLE_LABELS, ASSIGNABLE_ROLES } from "../constants/roles";
import { USER_STATUS } from "../constants/accountRules";
import "./Dashboard.css";
import "./Usuarios.css";

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric"
      })
    : "";

function Usuarios() {
  const [searchParams] = useSearchParams();
  const selectedUserId = searchParams.get("userId");
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [roleRequests, setRoleRequests] = useState([]);
  const [roleRequestError, setRoleRequestError] = useState("");

  // Rol elegido en el selector antes de guardar o aprobar: { [id]: "GERENTE" }
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  // Mensaje por fila: { [id]: { type: "success" | "error", text } }
  const [feedback, setFeedback] = useState({});
  // Mensaje general del recuadro de solicitudes
  const [requestNotice, setRequestNotice] = useState(null);

  useEffect(() => {
    getUsers()
      .then((data) => setUsers(data))
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
    if (isSuperAdmin) getPendingRoleRequests()
      .then(setRoleRequests)
      .catch((err) => setRoleRequestError(err.message));
  }, [isSuperAdmin]);

  // Para el botón "Reintentar"
  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
      setLoadError("");
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const accounts = users.filter((u) => u.status !== USER_STATUS.PENDING);

  useEffect(() => {
    if (!loading && selectedUserId) document.getElementById(`user-${selectedUserId}`)?.scrollIntoView({ block: "center" });
  }, [loading, selectedUserId, users]);

  // ---------- reglas de la interfaz (el backend valida lo mismo) ----------

  const isSelf = (user) => user.id === currentUser?.id;

  const isProtected = (user) => user.role === "SUPER_ADMIN" && !isSuperAdmin;

  const canEdit = (user) => isSuperAdmin && !isSelf(user) && !isProtected(user);

  const replaceUser = (updated) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  const clearDraft = (id) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const showRowMessage = (id, type, text) => {
    setFeedback((prev) => ({ ...prev, [id]: { type, text } }));
  };

  // ---------- acciones sobre cuentas ----------

  const handleSaveRole = async (user) => {
    const role = drafts[user.id];
    setSavingId(user.id);

    try {
      const updated = await updateUserRole(user.id, role);
      replaceUser(updated);
      clearDraft(user.id);
      showRowMessage(user.id, "success", `Rol cambiado a ${ROLE_LABELS[role]}.`);
    } catch (err) {
      clearDraft(user.id); // el selector regresa al rol anterior
      showRowMessage(user.id, "error", err.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleStatus = async (user) => {
    const enable = user.status === USER_STATUS.DISABLED;

    if (!enable) {
      const ok = window.confirm(
        `${user.name} ya no podrá iniciar sesión. ¿Deshabilitar la cuenta?`
      );
      if (!ok) return;
    }

    setSavingId(user.id);

    try {
      const updated = await updateUserStatus(user.id, enable);
      replaceUser(updated);
      showRowMessage(
        user.id,
        "success",
        enable ? "Cuenta habilitada." : "Cuenta deshabilitada."
      );
    } catch (err) {
      showRowMessage(user.id, "error", err.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleReviewRole = async (request, approve) => {
    const action = approve ? "autorizar" : "rechazar";
    if (!window.confirm(`¿${action} el cambio a ${ROLE_LABELS[request.requestedRole]} de ${request.user?.name || "esta persona"}?`)) return;
    setSavingId(`role-${request.id}`);
    try {
      await reviewRoleRequest(request.id, approve);
      setRoleRequests((current) => current.filter((item) => item.id !== request.id));
      setRequestNotice({ type: "success", text: approve ? "Cambio de rol autorizado." : "Cambio de rol rechazado." });
      if (approve) setUsers(await getUsers());
    } catch (err) {
      setRequestNotice({ type: "error", text: err.message });
    } finally { setSavingId(null); }
  };

  // ---------- vista ----------

  return (
    <div className="dashboard-layout">
      <Sidebar active="usuarios" />

      <main className="dashboard-main">
        <div className="topbar">
          <div></div>
        </div>

        <section className="dashboard-content">
          <div className="dashboard-header">
            <div>
              <span className="eyebrow">GOBIERNO DE ACCESOS</span>
              <h1>Administración de usuarios</h1>
              <p>
                Asigna el rol que define la información y las acciones
                disponibles para cada cuenta.
              </p>
            </div>
          </div>

          {loading && <p className="users-muted">Cargando cuentas...</p>}

          {loadError && (
            <p className="users-msg error">
              {loadError}{" "}
              <button className="users-link" onClick={loadUsers}>
                Reintentar
              </button>
            </p>
          )}

          {!loading && !loadError && isSuperAdmin && (
            <div className="users-card users-requests">
              <div className="users-requests-head">
                <h2>Solicitudes de cambio de rol</h2>
                {roleRequests.length > 0 && (
                  <span className="users-count">{roleRequests.length}</span>
                )}
              </div>
              <p className="users-muted">
                Las cuentas nuevas ya pueden entrar como Auditor. Aquí solo se autoriza o rechaza un cambio posterior de rol.
              </p>

              {roleRequestError && <p className="users-msg error">{roleRequestError}</p>}

              {requestNotice && (
                <p className={`users-msg ${requestNotice.type} users-notice`}>
                  {requestNotice.text}
                </p>
              )}

              {roleRequests.length === 0 && !roleRequestError ? (
                <div className="users-empty">
                  <Inbox size={20} strokeWidth={1.75} aria-hidden="true" />
                  No hay cambios de rol pendientes.
                </div>
              ) : (
                <ul className="users-list">
                  {roleRequests.map((request) => {
                    const busy = savingId === `role-${request.id}`;

                    return (
                      <li key={request.id} className="users-row pending">
                        <div className="users-identity">
                          <strong>{request.user?.name || `Cuenta ${request.userId}`}</strong>
                          <span>{request.user?.email}</span>
                          <span>{ROLE_LABELS[request.user?.role]} → {ROLE_LABELS[request.requestedRole]}</span>
                          <span>Motivo: {request.reason}</span>
                          <span>Solicitado el {formatDate(request.createdAt)}</span>
                        </div>

                        <div className="users-controls">
                          <button
                            className="users-primary"
                            disabled={busy}
                            onClick={() => handleReviewRole(request, true)}
                          >
                            Autorizar cambio
                          </button>

                          <button
                            className="users-danger"
                            disabled={busy}
                            onClick={() => handleReviewRole(request, false)}
                          >
                            Rechazar cambio
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {!loading && !loadError && (
            <div className="users-card">
              <h2>Cuentas VERA</h2>
              <p className="users-muted">
                Cambia el rol de una cuenta o deshabilítala para quitarle el acceso.
              </p>

              <ul className="users-list">
                {accounts.map((user) => {
                  const editable = canEdit(user);
                  const disabled = user.status === USER_STATUS.DISABLED;
                  const selectedRole = drafts[user.id] ?? user.role;
                  const changed = selectedRole !== user.role;
                  const busy = savingId === user.id;
                  const message = feedback[user.id];

                  return (
                    <li
                      key={user.id}
                      id={`user-${user.id}`}
                      className={`users-row${disabled ? " inactive" : ""}`}
                    >
                      <div className="users-identity">
                        <strong>
                          {user.name}
                          {isSelf(user) && <span className="users-tag">Tú</span>}
                          {disabled && (
                            <span className="users-tag off">Deshabilitada</span>
                          )}
                        </strong>
                        <span>{user.email}</span>
                        {message && (
                          <span className={`users-msg ${message.type}`}>
                            {message.text}
                          </span>
                        )}
                      </div>

                      <div className="users-controls">
                        <select
                          aria-label={`Rol de ${user.name}`}
                          value={selectedRole}
                          disabled={!editable || busy}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))
                          }
                        >
                          {!ASSIGNABLE_ROLES.includes(user.role) && (
                            <option value={user.role}>{ROLE_LABELS[user.role]}</option>
                          )}
                          {ASSIGNABLE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>

                        <span
                          className={`users-badge${
                            user.role === "DIRECTOR" || user.role === "SUPER_ADMIN"
                              ? " strong"
                              : ""
                          }`}
                        >
                          {ROLE_LABELS[user.role] || user.role}
                        </span>

                        {editable && (
                          <>
                            <button
                              className="users-primary"
                              disabled={!changed || busy}
                              onClick={() => handleSaveRole(user)}
                            >
                              {busy && changed ? "Guardando..." : "Guardar"}
                            </button>

                            <button
                              className="users-secondary"
                              disabled={busy}
                              onClick={() => handleToggleStatus(user)}
                            >
                              {disabled ? "Habilitar" : "Deshabilitar"}
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default Usuarios;
