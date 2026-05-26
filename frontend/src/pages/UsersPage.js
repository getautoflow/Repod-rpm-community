import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  listUsers, createUser, updateUser, deleteUser,
  resetUserPassword, getRoles,
  listApiTokens, createApiToken, revokeApiToken,
} from "../api";

// ─── Couleurs et métadonnées des rôles ───────────────────────────────────────

const ROLE_COLORS = {
  admin:      { bg: "bg-red-100",    text: "text-red-700",    border: "border-red-200"    },
  maintainer: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  uploader:   { bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-200"   },
  auditor:    { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  reader:     { bg: "bg-gray-100",   text: "text-gray-600",   border: "border-gray-200"   },
};

function RoleBadge({ role, label }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.reader;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      {label || role}
    </span>
  );
}

function SourceBadge({ authSource }) {
  const { t } = useTranslation();
  const isLdap = authSource === "ldap";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border
      ${isLdap
        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
        : "bg-gray-100 text-gray-600 border-gray-200"
      }`}>
      {isLdap ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
        </svg>
      )}
      {isLdap ? t('users.source.ldap') : t('users.source.local')}
    </span>
  );
}

// ─── Modal générique ─────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Formulaire de création d'utilisateur ────────────────────────────────────

function CreateUserModal({ roles, onClose, onCreated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ username: "", password: "", role: "reader", full_name: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      toast.error(t('users.toasts.createRequired'));
      return;
    }
    if (form.password.length < 8) {
      toast.error(t('users.toasts.passwordMin'));
      return;
    }
    setSaving(true);
    try {
      await createUser(form);
      toast.success(t('users.toasts.created', { username: form.username }));
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('users.toasts.createError'));
    } finally {
      setSaving(false);
    }
  };

  const selectedRole = roles[form.role];

  return (
    <Modal title={t('users.modals.create.title')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Username */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.modals.create.username')} *</label>
          <input
            type="text" value={form.username} onChange={(e) => set("username", e.target.value)}
            placeholder="ex: j.dupont"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        {/* Mot de passe */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.modals.create.password')} * <span className="text-gray-400 font-normal">(8 {t('resetPassword.minLength')})</span></label>
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"} value={form.password}
              onChange={(e) => set("password", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPwd ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
        </div>

        {/* Rôle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.modals.create.role')}</label>
          <select
            value={form.role} onChange={(e) => set("role", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(roles).map(([key, r]) => (
              <option key={key} value={key}>{r.label}</option>
            ))}
          </select>
          {selectedRole && (
            <p className="text-xs text-gray-500 mt-1.5 bg-gray-50 rounded-lg px-3 py-2">
              {selectedRole.description}
            </p>
          )}
        </div>

        {/* Nom complet */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.name')}</label>
            <input type="text" value={form.full_name} onChange={(e) => set("full_name", e.target.value)}
              placeholder="Jean Dupont"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              placeholder="j.dupont@..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? t('users.modals.create.creating') : t('users.modals.create.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Modal d'édition ─────────────────────────────────────────────────────────

function EditUserModal({ user, roles, onClose, onUpdated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    role: user.role, full_name: user.full_name || "", email: user.email || "", active: user.active,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateUser(user.username, form);
      toast.success(t('users.toasts.updated', { username: user.username }));
      onUpdated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('users.toasts.updateError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`${t('users.modals.edit.title')} — ${user.username}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.modals.edit.role')}</label>
          <select value={form.role} onChange={(e) => set("role", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {Object.entries(roles).map(([key, r]) => (
              <option key={key} value={key}>{r.label}</option>
            ))}
          </select>
          {roles[form.role] && (
            <p className="text-xs text-gray-500 mt-1.5 bg-gray-50 rounded-lg px-3 py-2">
              {roles[form.role].description}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.name')}</label>
            <input type="text" value={form.full_name} onChange={(e) => set("full_name", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-gray-700">{t('users.modals.edit.status')}</p>
            <p className="text-xs text-gray-400">{t('users.status.active')}/{t('users.status.inactive')}</p>
          </div>
          <button type="button" onClick={() => set("active", !form.active)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.active ? "bg-blue-600" : "bg-gray-300"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.active ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? t('users.modals.edit.saving') : t('users.modals.edit.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Modal reset mot de passe ─────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose }) {
  const { t } = useTranslation();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pwd.length < 8) { toast.error(t('users.toasts.passwordMin8')); return; }
    if (pwd !== confirm) { toast.error(t('users.toasts.passwordMismatch')); return; }
    setSaving(true);
    try {
      await resetUserPassword(user.username, pwd);
      toast.success(t('users.toasts.passwordReset', { username: user.username }));
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`${t('users.modals.resetPassword.title')} — ${user.username}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.modals.resetPassword.newPassword')}</label>
          <div className="relative">
            <input type={showPwd ? "text" : "password"} value={pwd}
              onChange={(e) => setPwd(e.target.value)} autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {showPwd ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('resetPassword.confirmPassword')}</label>
          <input type={showPwd ? "text" : "password"} value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${confirm && pwd !== confirm ? "border-red-400" : "border-gray-300"}`}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors">
            {saving ? "..." : t('users.modals.resetPassword.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function UsersPage() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // "create" | {type:"edit"|"reset"|"delete", user}

  const fmt = (iso) => iso ? new Date(iso).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" }) : "—";

  const load = async () => {
    setLoading(true);
    try {
      const [usersData, rolesData] = await Promise.all([listUsers(), getRoles()]);
      setUsers(usersData.users || []);
      setRoles(rolesData.roles || {});
    } catch {
      toast.error(t('users.toasts.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const handleDelete = async (user) => {
    if (!window.confirm(t('users.toasts.deleteConfirm', { username: user.username }))) return;
    try {
      await deleteUser(user.username);
      toast.success(t('users.toasts.deleted', { username: user.username }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('users.toasts.deleteError'));
    }
  };

  const roleOrder = { admin: 0, maintainer: 1, uploader: 2, auditor: 3, reader: 4 };
  const sortedUsers = [...users].sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9));

  return (
    <div className="space-y-6 p-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('users.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('users.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setModal("create")}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('users.createButton')}
        </button>
      </div>

      {/* Légende des rôles */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('users.availableRoles')}</p>
        <div className="grid grid-cols-1 gap-2">
          {Object.entries(roles).map(([key, r]) => (
            <div key={key} className="flex items-start gap-3">
              <RoleBadge role={key} label={r.label} />
              <p className="text-xs text-gray-500 leading-relaxed">{r.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tableau des utilisateurs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            {t('users.userCount', { count: users.length })}
          </h2>
          <button onClick={load} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            {t('common.refresh')}
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">{t('users.loading')}</div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">{t('users.noUsers')}</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('users.tableHeaders.username')}</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('users.tableHeaders.role')}</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('users.tableHeaders.origin')}</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('users.tableHeaders.status')}</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('users.tableHeaders.lastLogin')}</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('users.createdAt')}</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedUsers.map((u) => (
                <tr key={u.username} className={`hover:bg-gray-50 ${!u.active ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                        ${ROLE_COLORS[u.role]?.bg || "bg-gray-100"} ${ROLE_COLORS[u.role]?.text || "text-gray-600"}`}>
                        {(u.full_name || u.username).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{u.username}</p>
                        {u.full_name && <p className="text-xs text-gray-400">{u.full_name}</p>}
                        {u.email && <p className="text-xs text-gray-400">{u.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <RoleBadge role={u.role} label={roles[u.role]?.label || u.role} />
                  </td>
                  <td className="px-5 py-3.5">
                    <SourceBadge authSource={u.auth_source} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.active ? "text-green-600" : "text-gray-400"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.active ? "bg-green-500" : "bg-gray-400"}`} />
                      {u.active ? t('users.status.active') : t('users.status.inactive')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-500">{fmt(u.last_login)}</td>
                  <td className="px-5 py-3.5 text-xs text-gray-500">{fmt(u.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button title={t('users.actions.edit')}
                        onClick={() => setModal({ type: "edit", user: u })}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        title={u.auth_source === "ldap" ? t('users.actions.resetPasswordLdap') : t('users.actions.resetPassword')}
                        onClick={() => u.auth_source !== "ldap" && setModal({ type: "reset", user: u })}
                        disabled={u.auth_source === "ldap"}
                        className={`p-1.5 rounded-lg transition-colors ${u.auth_source === "ldap" ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:text-orange-600 hover:bg-orange-50"}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </button>
                      <button title={t('users.actions.delete')}
                        onClick={() => handleDelete(u)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {modal === "create" && (
        <CreateUserModal roles={roles} onClose={() => setModal(null)} onCreated={load} />
      )}
      {modal?.type === "edit" && (
        <EditUserModal user={modal.user} roles={roles} onClose={() => setModal(null)} onUpdated={load} />
      )}
      {modal?.type === "reset" && (
        <ResetPasswordModal user={modal.user} onClose={() => setModal(null)} />
      )}

      {/* ── Section API Tokens ── */}
      <ApiTokensSection />
    </div>
  );
}

// ─── Section Tokens d'API ─────────────────────────────────────────────────────

const ROLE_OPTIONS = ["uploader", "maintainer", "reader", "auditor", "admin"];

function ApiTokensSection() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(dateLocale) : t('users.tokens.never');

  const [tokens, setTokens]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [newToken, setNewToken]   = useState(null);
  const [form, setForm]           = useState({ name: "", role: "uploader", expires_days: "" });
  const [showForm, setShowForm]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listApiTokens();
      setTokens(data.tokens || []);
    } catch {
      toast.error(t('users.toasts.tokenLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error(t('users.toasts.tokenNameRequired')); return; }
    setCreating(true);
    try {
      const data = await createApiToken({
        name: form.name.trim(),
        role: form.role,
        expires_days: form.expires_days ? parseInt(form.expires_days) : null,
      });
      setNewToken(data.token);
      setForm({ name: "", role: "uploader", expires_days: "" });
      setShowForm(false);
      load();
      toast.success(t('users.toasts.tokenCreated'));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('users.toasts.tokenCreateError'));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (tokenId, name) => {
    if (!window.confirm(t('users.toasts.revokeConfirm', { name }))) return;
    try {
      await revokeApiToken(tokenId);
      toast.success(t('users.toasts.tokenRevoked', { name }));
      load();
    } catch {
      toast.error(t('users.toasts.tokenRevokeError'));
    }
  };

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{t('users.tokens.title')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t('users.tokens.description')}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          {t('users.tokens.createButton')}
        </button>
      </div>

      {/* Token affiché une seule fois */}
      {newToken && (
        <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl p-4">
          <p className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-1.5"><svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> {t('users.tokens.copyNow')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 break-all">
              {newToken}
            </code>
            <button onClick={() => { navigator.clipboard.writeText(newToken); toast.success(t('users.toasts.tokenCopied')); }}
              className="px-3 py-2 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 shrink-0">
              {t('users.tokens.copyButton')}
            </button>
            <button onClick={() => setNewToken(null)} className="px-3 py-2 text-xs text-amber-700 shrink-0">{t('users.tokens.okButton')}</button>
          </div>
        </div>
      )}

      {/* Formulaire création */}
      {showForm && (
        <div className="mb-4 bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">{t('users.tokens.newToken')}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">{t('users.tokens.tokenNamePlaceholder')}</label>
              <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                placeholder="gitlab-ci, jenkins, …"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">{t('users.tokens.role')}</label>
              <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">{t('users.tokens.expiresIn')}</label>
              <input type="number" value={form.expires_days} onChange={e => setForm(f => ({...f, expires_days: e.target.value}))}
                placeholder={t('users.tokens.expiresInPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {creating ? t('users.tokens.creatingButton') : t('users.tokens.createButton')}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              {t('users.tokens.cancelButton')}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('common.loading')}</div>
        ) : tokens.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {t('users.tokens.noTokens')}<br/>
            <span className="text-xs">{t('users.tokens.noTokensHint')}</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                {[
                  t('common.name'),
                  t('users.tableHeaders.role'),
                  t('users.tokens.createdBy'),
                  t('users.createdAt'),
                  t('users.tokens.lastUsed'),
                  t('users.tokens.expiresAt'),
                  "",
                ].map((h, i) => (
                  <th key={i} className="text-left px-5 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tokens.map((tk) => {
                const expired = tk.expires_at && new Date(tk.expires_at) < new Date();
                return (
                  <tr key={tk.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
                        </svg>
                        <span className="font-medium text-gray-900">{tk.name}</span>
                        {expired && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded font-medium">{t('users.tokens.expired')}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><RoleBadge role={tk.role} /></td>
                    <td className="px-5 py-3.5 text-gray-500">{tk.created_by}</td>
                    <td className="px-5 py-3.5 text-gray-500">{fmtDate(tk.created_at)}</td>
                    <td className="px-5 py-3.5 text-gray-500">{tk.last_used ? fmtDate(tk.last_used) : <span className="text-gray-300">{t('users.tokens.never')}</span>}</td>
                    <td className="px-5 py-3.5 text-gray-500">{fmtDate(tk.expires_at)}</td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => handleRevoke(tk.id, tk.name)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title={t('users.tokens.revokeButton')}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Usage CI/CD */}
      <div className="mt-4 bg-gray-900 rounded-xl p-4">
        <p className="text-xs text-gray-400 font-semibold mb-2">{t('users.tokens.ciTitle')}</p>
        <pre className="text-xs text-green-400 font-mono leading-relaxed overflow-x-auto">{`# Upload via curl avec un token d'API
curl -X POST https://repod.example.com/upload \\
  -H "Authorization: Bearer repod_<votre_token>" \\
  -F "file=@monpaquet.rpm" \\
  -F "distribution=almalinux8"`}</pre>
      </div>
    </div>
  );
}
