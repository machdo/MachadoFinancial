import { useState } from "react";
import axios from "axios";
import { ArrowRight, ChartColumnBig, Eye, EyeOff, ShieldCheck, Wallet } from "lucide-react";
import { API_BASE } from "../lib/finance";

export default function Login({ setToken }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isRegister = mode === "register";
  const title = isRegister ? "Criar conta" : "Bem-vindo de volta";
  const subtitle = isRegister
    ? "Cadastre-se para acessar seu painel financeiro."
    : "Acesse sua conta para continuar.";

  const featureItems = [
    {
      icon: Wallet,
      title: "Contas e categorias",
      description: "Organize receitas e despesas com estrutura clara.",
    },
    {
      icon: ChartColumnBig,
      title: "Visao do seu dinheiro",
      description: "Acompanhe sua evolucao com relatorios e indicadores.",
    },
    {
      icon: ShieldCheck,
      title: "Acesso seguro",
      description: "Seus dados ficam associados ao seu usuario.",
    },
  ];

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  function handleNameChange(e) {
    setName(e.target.value);
    if (error) setError("");
  }

  function handleEmailChange(e) {
    setEmail(e.target.value);
    if (error) setError("");
  }

  function handlePasswordChange(e) {
    setPassword(e.target.value);
    if (error) setError("");
  }

  function handleConfirmPasswordChange(e) {
    setConfirmPassword(e.target.value);
    if (error) setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;

    setError("");

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedName = String(name || "").trim();

    if (isRegister && !normalizedName) {
      return setError("Informe seu nome.");
    }
    if (!normalizedEmail) {
      return setError("Informe seu email.");
    }
    if (!password) {
      return setError("Informe sua senha.");
    }

    if (isRegister) {
      if (password.length < 6) {
        return setError("A senha deve ter pelo menos 6 caracteres.");
      }
      if (password !== confirmPassword) {
        return setError("As senhas nao coincidem.");
      }
    }

    try {
      setBusy(true);

      const endpoint = isRegister ? "/register" : "/login";
      const payload = isRegister
        ? { name: normalizedName, email: normalizedEmail, password }
        : { email: normalizedEmail, password };

      const res = await axios.post(`${API_BASE}${endpoint}`, payload);
      const token = res?.data?.token;
      if (!token) {
        throw new Error("Resposta sem token");
      }

      localStorage.setItem("token", token);
      setToken(token);
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          (isRegister
            ? "Nao foi possivel criar a conta."
            : "Nao foi possivel fazer login."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-12 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400/15 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-white/15 bg-white/5 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.85)] backdrop-blur md:grid-cols-[1.1fr_0.9fr]">
          <section className="relative hidden overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 p-8 text-white md:flex md:flex-col md:justify-between">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-white/20" />
            <div className="absolute bottom-10 left-6 h-16 w-16 rounded-full border border-white/20" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
                Machado Financial
              </p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight">
                Controle financeiro com uma experiencia simples e eficiente.
              </h2>
            </div>

            <div className="relative space-y-4">
              {featureItems.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/25 bg-white/10 p-4 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-white/20 p-2">
                      <item.icon size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs text-blue-100/95">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white p-6 sm:p-8 md:p-10">
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button
                className={[
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  !isRegister
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                ].join(" ")}
                onClick={() => switchMode("login")}
                disabled={busy}
                type="button"
              >
                Entrar
              </button>
              <button
                className={[
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  isRegister
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                ].join(" ")}
                onClick={() => switchMode("register")}
                disabled={busy}
                type="button"
              >
                Criar conta
              </button>
            </div>

            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {isRegister && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nome
                  </span>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Seu nome completo"
                    value={name}
                    onChange={handleNameChange}
                    disabled={busy}
                    autoComplete="name"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Email
                </span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={handleEmailChange}
                  disabled={busy}
                  autoComplete="email"
                  type="email"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Senha
                </span>
                <div className="relative">
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-10 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                    type={showPassword ? "text" : "password"}
                    placeholder={isRegister ? "Minimo de 6 caracteres" : "Sua senha"}
                    value={password}
                    onChange={handlePasswordChange}
                    disabled={busy}
                    autoComplete={isRegister ? "new-password" : "current-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={busy}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 disabled:opacity-60"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              {isRegister && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Confirmar senha
                  </span>
                  <div className="relative">
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-10 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Repita sua senha"
                      value={confirmPassword}
                      onChange={handleConfirmPasswordChange}
                      disabled={busy}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      disabled={busy}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 disabled:opacity-60"
                      aria-label={showConfirmPassword ? "Ocultar confirmar senha" : "Mostrar confirmar senha"}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
              )}

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {error}
                </div>
              )}

              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
                type="submit"
              >
                <span>
                  {busy
                    ? isRegister
                      ? "Criando..."
                      : "Entrando..."
                    : isRegister
                      ? "Criar conta"
                      : "Entrar"}
                </span>
                {!busy && <ArrowRight size={16} />}
              </button>
            </form>

            <div className="mt-5 text-center text-sm text-slate-600">
              {isRegister ? "Ja tem conta?" : "Nao tem conta?"}{" "}
              <button
                type="button"
                className="font-semibold text-blue-700 hover:text-blue-800 hover:underline"
                onClick={() => switchMode(isRegister ? "login" : "register")}
                disabled={busy}
              >
                {isRegister ? "Fazer login" : "Criar conta"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
