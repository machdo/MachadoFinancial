import { useState } from "react";
import axios from "axios";
import { API_BASE } from "../lib/finance";

export default function Login({ setToken }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isRegister = mode === "register";

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setPassword("");
    setConfirmPassword("");
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
    <div className="flex h-screen items-center justify-center bg-blue-600 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            className={[
              "rounded-md px-3 py-2 text-sm font-semibold",
              !isRegister ? "bg-white shadow-sm" : "text-slate-600",
            ].join(" ")}
            onClick={() => switchMode("login")}
            disabled={busy}
            type="button"
          >
            Entrar
          </button>
          <button
            className={[
              "rounded-md px-3 py-2 text-sm font-semibold",
              isRegister ? "bg-white shadow-sm" : "text-slate-600",
            ].join(" ")}
            onClick={() => switchMode("register")}
            disabled={busy}
            type="button"
          >
            Criar conta
          </button>
        </div>

        <h1 className="mb-4 text-xl font-bold">
          {isRegister ? "Criar conta" : "Login"}
        </h1>

        <form className="space-y-3" onSubmit={handleSubmit}>
          {isRegister && (
            <input
              className="w-full rounded border p-2"
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          )}

          <input
            className="w-full rounded border p-2"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />

          <input
            className="w-full rounded border p-2"
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />

          {isRegister && (
            <input
              className="w-full rounded border p-2"
              type="password"
              placeholder="Confirmar senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
            />
          )}

          {error && <div className="text-sm font-medium text-rose-600">{error}</div>}

          <button
            className="w-full rounded bg-blue-600 p-2 text-white disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy
              ? isRegister
                ? "Criando..."
                : "Entrando..."
              : isRegister
                ? "Criar conta"
                : "Entrar"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-slate-600">
          {isRegister ? "Ja tem conta?" : "Nao tem conta?"}{" "}
          <button
            type="button"
            className="font-semibold text-blue-700 hover:underline"
            onClick={() => switchMode(isRegister ? "login" : "register")}
            disabled={busy}
          >
            {isRegister ? "Fazer login" : "Criar conta"}
          </button>
        </div>
      </div>
    </div>
  );
}
