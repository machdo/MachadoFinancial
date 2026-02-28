import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Bot,
  Loader2,
  MessageCircle,
  SendHorizontal,
  User2,
  X,
} from "lucide-react";
import { API_BASE, authHeaders } from "../lib/finance";

const QUICK_PROMPTS = [
  "Analise meu fluxo de caixa e me diga 3 prioridades para este mes.",
  "Me sugira uma estrategia de investimentos para perfil moderado.",
  "Quais gastos eu posso cortar sem prejudicar meus objetivos?",
];

const INITIAL_MESSAGE = {
  id: "assistant-initial",
  role: "assistant",
  content:
    "Oi! Eu sou seu assistente de financas e investimentos. Pergunte sobre gastos, metas, fluxo de caixa ou alocacao.",
};

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export default function AssistantFloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);

  const canSend = useMemo(() => !busy && String(input).trim().length > 0, [busy, input]);
  const aiEndpoints = useMemo(() => {
    const candidates = [`${API_BASE}/ai/chat`, `${API_BASE}/api/ai/chat`];
    return [...new Set(candidates)];
  }, []);

  useEffect(() => {
    const element = listRef.current;
    if (!element || !open) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    if (!open) return undefined;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function sendMessage(rawText) {
    const text = String(rawText ?? "").trim();
    if (!text || busy) return;

    const userMessage = { id: createId(), role: "user", content: text };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setError("");
    setBusy(true);

    try {
      const payload = {
        messages: nextMessages
          .filter((item) => item.role === "user" || item.role === "assistant")
          .slice(-12)
          .map((item) => ({ role: item.role, content: item.content })),
      };

      let response = null;
      let lastError = null;

      for (const endpoint of aiEndpoints) {
        try {
          response = await axios.post(endpoint, payload, { headers: authHeaders() });
          break;
        } catch (requestError) {
          lastError = requestError;
          if (requestError?.response?.status !== 404) throw requestError;
        }
      }

      if (!response) throw lastError || new Error("Falha ao consultar IA.");

      const reply = String(response?.data?.reply ?? "").trim();
      if (!reply) throw new Error("Resposta vazia da IA.");

      setMessages((previous) => [
        ...previous,
        { id: createId(), role: "assistant", content: reply },
      ]);
    } catch (requestError) {
      const status = requestError?.response?.status;
      if (status === 404) {
        setError(
          "Rota da IA nao encontrada no backend (404). Verifique VITE_API_BASE_URL e o deploy do backend.",
        );
        return;
      }
      setError(
        requestError?.response?.data?.error ||
          requestError?.message ||
          "Nao foi possivel conversar com a IA agora.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage(input);
  }

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-40 flex flex-col items-end gap-2 sm:bottom-5 sm:right-5">
      {open && (
        <section className="pointer-events-auto flex h-[70vh] max-h-[560px] w-[calc(100vw-1rem)] max-w-[390px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
          <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-600/10 p-1.5 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                <Bot size={14} />
              </div>
              <div className="text-sm font-semibold">Assistente IA</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              aria-label="Fechar chat"
            >
              <X size={14} />
            </button>
          </header>

          <div className="border-b border-slate-200 px-2 py-2 dark:border-slate-800">
            <div className="flex gap-2 overflow-x-auto">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  disabled={busy}
                  className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={["flex gap-2", isUser ? "justify-end" : "justify-start"].join(" ")}
                >
                  {!isUser && (
                    <div className="mt-1 rounded-full bg-blue-600/10 p-1.5 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                      <Bot size={12} />
                    </div>
                  )}
                  <div
                    className={[
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                      isUser
                        ? "bg-blue-600 text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                    ].join(" ")}
                  >
                    {message.content}
                  </div>
                  {isUser && (
                    <div className="mt-1 rounded-full bg-slate-200 p-1.5 text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                      <User2 size={12} />
                    </div>
                  )}
                </div>
              );
            })}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 size={14} className="animate-spin" />
                Processando resposta...
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-2 dark:border-slate-800">
            {error && (
              <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                {error}
              </div>
            )}

            <form className="flex gap-2" onSubmit={handleSubmit}>
              <input
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-950"
                placeholder="Digite sua pergunta..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={busy}
              />
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                aria-label="Enviar mensagem"
              >
                <SendHorizontal size={16} />
              </button>
            </form>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-700"
      >
        <MessageCircle size={17} />
        <span>{open ? "Fechar IA" : "Assistente IA"}</span>
      </button>
    </div>
  );
}
