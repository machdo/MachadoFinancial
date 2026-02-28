import { useEffect, useState } from "react";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";
import { API_BASE, authHeaders } from "../lib/finance";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export default function Profile({ onLogout }) {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState("");

  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setProfileError("");

      try {
        const response = await axios.get(`${API_BASE}/me`, { headers: authHeaders() });
        if (!active) return;
        const user = response?.data ?? {};
        setName(user.name ?? "");
        setEmail(user.email ?? "");
        setCreatedAt(user.createdAt ?? "");
      } catch (requestError) {
        if (!active) return;
        setProfileError(
          requestError?.response?.data?.error || "Nao foi possivel carregar seus dados.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    if (profileBusy) return;

    const normalizedName = String(name ?? "").trim();
    const normalizedEmail = String(email ?? "")
      .trim()
      .toLowerCase();

    setProfileError("");
    setProfileSuccess("");

    if (!normalizedName) {
      setProfileError("Informe seu nome.");
      return;
    }
    if (!normalizedEmail) {
      setProfileError("Informe seu email.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setProfileError("Informe um email valido.");
      return;
    }

    try {
      setProfileBusy(true);
      const response = await axios.put(
        `${API_BASE}/me`,
        { name: normalizedName, email: normalizedEmail },
        { headers: authHeaders() },
      );
      const user = response?.data ?? {};
      setName(user.name ?? normalizedName);
      setEmail(user.email ?? normalizedEmail);
      setCreatedAt(user.createdAt ?? createdAt);
      setProfileSuccess("Dados atualizados com sucesso.");
    } catch (requestError) {
      setProfileError(
        requestError?.response?.data?.error || "Nao foi possivel atualizar seus dados.",
      );
    } finally {
      setProfileBusy(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    if (passwordBusy) return;

    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Preencha todos os campos de senha.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas nao coincidem.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("A nova senha deve ser diferente da atual.");
      return;
    }

    try {
      setPasswordBusy(true);
      await axios.put(
        `${API_BASE}/me/password`,
        { currentPassword, newPassword, confirmPassword },
        { headers: authHeaders() },
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Senha alterada com sucesso.");
    } catch (requestError) {
      setPasswordError(
        requestError?.response?.data?.error || "Nao foi possivel alterar sua senha.",
      );
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleDeleteAccount(event) {
    event.preventDefault();
    if (deleteBusy) return;

    setDeleteError("");

    if (!deletePassword) {
      setDeleteError("Informe sua senha para excluir a conta.");
      return;
    }

    const confirmed = window.confirm(
      "Tem certeza que deseja excluir sua conta? Esta acao remove todos os dados e nao pode ser desfeita.",
    );
    if (!confirmed) return;

    try {
      setDeleteBusy(true);
      await axios.delete(`${API_BASE}/me`, {
        headers: authHeaders(),
        data: { currentPassword: deletePassword },
      });
      localStorage.removeItem("token");
      if (typeof onLogout === "function") onLogout();
      else window.location.reload();
    } catch (requestError) {
      setDeleteError(
        requestError?.response?.data?.error || "Nao foi possivel excluir sua conta.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
        Carregando dados da conta...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="text-sm font-semibold">Dados da conta</div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Atualize seu nome e email de acesso.
        </p>

        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={handleProfileSubmit}>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Nome
            </span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={profileBusy}
              autoComplete="name"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Email
            </span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={profileBusy}
              autoComplete="email"
            />
          </label>

          <div className="md:col-span-2">
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              Conta criada em: {formatDate(createdAt)}
            </div>

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={profileBusy}
            >
              {profileBusy ? "Salvando..." : "Salvar dados"}
            </button>
          </div>
        </form>

        {profileError && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {profileError}
          </div>
        )}
        {profileSuccess && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            {profileSuccess}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="text-sm font-semibold">Alterar senha</div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Informe sua senha atual para definir uma nova senha.
        </p>

        <form className="mt-3 grid gap-3 md:grid-cols-3" onSubmit={handlePasswordSubmit}>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Senha atual
            </span>
            <div className="relative">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={passwordBusy}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((value) => !value)}
                disabled={passwordBusy}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 disabled:opacity-60 dark:text-slate-400 dark:hover:text-slate-200"
                aria-label={showCurrentPassword ? "Ocultar senha atual" : "Mostrar senha atual"}
              >
                {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Nova senha
            </span>
            <div className="relative">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={passwordBusy}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((value) => !value)}
                disabled={passwordBusy}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 disabled:opacity-60 dark:text-slate-400 dark:hover:text-slate-200"
                aria-label={showNewPassword ? "Ocultar nova senha" : "Mostrar nova senha"}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Confirmar nova senha
            </span>
            <div className="relative">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={passwordBusy}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((value) => !value)}
                disabled={passwordBusy}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 disabled:opacity-60 dark:text-slate-400 dark:hover:text-slate-200"
                aria-label={showConfirmPassword ? "Ocultar confirmacao de senha" : "Mostrar confirmacao de senha"}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <div className="md:col-span-3">
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              disabled={passwordBusy}
            >
              {passwordBusy ? "Atualizando..." : "Atualizar senha"}
            </button>
          </div>
        </form>

        {passwordError && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {passwordError}
          </div>
        )}
        {passwordSuccess && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            {passwordSuccess}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-rose-300 bg-rose-50/70 p-4 shadow-sm dark:border-rose-900 dark:bg-rose-950/20">
        <div className="text-sm font-semibold text-rose-700 dark:text-rose-300">
          Excluir conta
        </div>
        <p className="mt-1 text-xs text-rose-700/90 dark:text-rose-300/90">
          Esta acao apaga permanentemente suas transacoes, contas, categorias e metas.
        </p>

        <form className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={handleDeleteAccount}>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-rose-700 dark:text-rose-300">
              Confirme sua senha
            </span>
            <div className="relative">
              <input
                className="w-full rounded-xl border border-rose-300 bg-white px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-rose-900 dark:bg-slate-950"
                type={showDeletePassword ? "text" : "password"}
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                disabled={deleteBusy}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowDeletePassword((value) => !value)}
                disabled={deleteBusy}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-500 hover:text-rose-700 disabled:opacity-60 dark:text-rose-300 dark:hover:text-rose-200"
                aria-label={showDeletePassword ? "Ocultar senha de exclusao" : "Mostrar senha de exclusao"}
              >
                {showDeletePassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <div className="md:self-end">
            <button
              type="submit"
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              disabled={deleteBusy}
            >
              {deleteBusy ? "Excluindo..." : "Excluir minha conta"}
            </button>
          </div>
        </form>

        {deleteError && (
          <div className="mt-3 rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {deleteError}
          </div>
        )}
      </section>
    </div>
  );
}
