import { Fragment, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { format, parseISO } from "date-fns";
import { CalendarPlus, Check, Mic, Send, Settings2, ShoppingCart, Sparkles, Square, Trash2, Wallet, X } from "lucide-react";
import { Card, Empty } from "../components/ui";
import { inputClass, PrimaryButton, SecondaryButton } from "../components/Sheet";
import { AiKeysSheet } from "../components/ai/AiKeysSheet";
import { useScopeData } from "../hooks/useScopeData";
import { resolveTx } from "../lib/aiActions";
import { formatBrl } from "../lib/money";
import { supabase } from "../lib/supabase";
import { AiNeedsKey, aiStatus, canRecord, chat, hasAi, startRecording, transcribe, type AiAction, type AiStatus, type TxAction } from "../services/ai";
import { addShopping } from "../services/kitchen";
import { addTask } from "../services/tasks";
import { addInstallments, addTransaction } from "../store/actions";
import { useAuth } from "../store/auth";
import { useUI } from "../store/ui";
import type { Mode } from "../types";

type ActionState = "pendente" | "salva" | "descartada";
type Msg = { id: string; role: "user" | "assistant"; content: string; actions?: AiAction[]; states?: ActionState[]; provider?: string };

const SUGGESTIONS = ["Me dá um resumo geral do mês", "Onde estou gastando mais?", "Organize meu dia de hoje", "Quanto ainda posso gastar até o fim do mês?"];

/** Markdown mínimo e seguro: **negrito**, listas com "- " e parágrafos. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-•*]\s+/, ""))}</li>)}
            </ul>
          );
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}

export function Assistant() {
  const household = useAuth((s) => s.household);
  const name = useAuth((s) => s.profile?.name ?? "");
  const pessoal = useScopeData("pessoal");
  const casa = useScopeData("casa", !!household);
  const hasEmpresa = useAuth((s) => !!s.profile?.empresaName);
  const empresa = useScopeData("empresa", hasEmpresa);
  const showToast = useUI((s) => s.showToast);
  const [st, setSt] = useState<AiStatus | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [rec, setRec] = useState<null | { stop: () => void }>(null);
  const [keys, setKeys] = useState<null | { reason?: string }>(null);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const asked = useRef(false);

  useEffect(() => {
    void aiStatus().then(setSt);
  }, [keys]);

  useEffect(() => {
    void supabase
      .from("assistant_messages")
      .select("id,role,content,meta,created_at")
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) =>
        setMsgs(
          (data ?? []).reverse().map((r) => {
            const meta = (r.meta ?? {}) as { actions?: AiAction[]; states?: ActionState[]; provider?: string };
            return { id: String(r.id), role: r.role as Msg["role"], content: String(r.content), ...meta };
          }),
        ),
      );
  }, []);

  useEffect(() => {
    const q = params.get("q");
    if (!q || msgs === null || asked.current || st === null) return;
    asked.current = true;
    setParams({}, { replace: true });
    if (hasAi(st)) void send(q);
    else setText(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, msgs, st]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, thinking]);

  async function send(content: string) {
    const c = content.trim();
    if (!c || thinking) return;
    setError("");
    setText("");
    const history = [...(msgs ?? []), { id: `tmp-${Date.now()}`, role: "user" as const, content: c }];
    setMsgs(history);
    setThinking(true);
    void supabase.from("assistant_messages").insert({ role: "user", content: c.slice(0, 8000) });
    try {
      const r = await chat(history.slice(-12).map((m) => ({ role: m.role, content: m.content })));
      const meta = { actions: r.actions, states: r.actions.map(() => "pendente" as ActionState), provider: r.provider };
      const { data } = await supabase.from("assistant_messages").insert({ role: "assistant", content: r.reply.slice(0, 8000), meta }).select("id").single();
      setMsgs((m) => [...(m ?? []), { id: String(data?.id ?? `a-${Date.now()}`), role: "assistant", content: r.reply, ...meta }]);
    } catch (e) {
      if (e instanceof AiNeedsKey) setKeys({ reason: e.message });
      else setError(e instanceof Error ? e.message : "Não consegui responder agora.");
    } finally {
      setThinking(false);
    }
  }

  async function voice() {
    setError("");
    try {
      const r = await startRecording();
      setRec({ stop: r.stop });
      const audio = await r.done;
      setRec(null);
      setThinking(true);
      const t = await transcribe(audio);
      setThinking(false);
      if (t) await send(t);
    } catch (e) {
      setRec(null);
      setThinking(false);
      if (e instanceof AiNeedsKey) setKeys({ reason: e.message });
      else setError(e instanceof Error ? e.message : "Não consegui ouvir agora.");
    }
  }

  async function setState(msg: Msg, idx: number, state: ActionState) {
    const states = [...(msg.states ?? msg.actions!.map(() => "pendente" as ActionState))];
    states[idx] = state;
    setMsgs((all) => (all ?? []).map((m) => (m.id === msg.id ? { ...m, states } : m)));
    if (!msg.id.startsWith("a-") && !msg.id.startsWith("tmp-")) {
      await supabase.from("assistant_messages").update({ meta: { actions: msg.actions, states, provider: msg.provider } }).eq("id", msg.id);
    }
  }

  async function confirm(msg: Msg, idx: number, a: AiAction) {
    try {
      if (a.kind === "transaction") {
        const scope: Mode = a.scope === "casa" && household ? "casa" : a.scope === "empresa" && hasEmpresa ? "empresa" : "pessoal";
        const d = scope === "casa" ? casa : scope === "empresa" ? empresa : pessoal;
        const r = resolveTx(a, d);
        if (r.problems.length) throw new Error(`${r.problems.join(" ")} Lance pela tela de transações.`);
        if (r.cardId && r.installments) {
          await addInstallments({ mode: scope, description: r.description, totalCents: r.amountCents, count: r.installments, date: r.date, cardId: r.cardId, categoryId: r.categoryId });
        } else {
          await addTransaction({ mode: scope, type: r.type, description: r.description, amountCents: r.amountCents, date: r.date, payment: r.payment, categoryId: r.categoryId, accountId: r.accountId, cardId: r.cardId });
        }
        showToast(r.type === "receita" ? "Receita lançada" : "Despesa lançada");
      } else if (a.kind === "task") {
        await addTask("pessoal", { title: a.title, date: a.date, time: a.time, priority: a.priority });
        showToast("Na agenda");
      } else {
        await addShopping(household ? "casa" : "pessoal", a.items, "manual");
        showToast(`${a.items.length} ${a.items.length === 1 ? "item" : "itens"} na lista de compras`);
      }
      await setState(msg, idx, "salva");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui salvar.");
    }
  }

  async function clearAll() {
    await supabase.from("assistant_messages").delete().gte("created_at", "1970-01-01");
    setMsgs([]);
  }

  const noAi = st !== null && !hasAi(st);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Assistente pessoal</h2>
            <p className="text-sm text-muted">Pergunte sobre seus gastos, peça um resumo, organize a agenda ou fale um lançamento, como "gastei 45 no mercado no pix".</p>
          </div>
          <button type="button" aria-label="Configurar a IA" onClick={() => setKeys({})} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line text-muted hover:text-ink"><Settings2 size={18} aria-hidden="true" /></button>
        </div>
        {noAi && (
          <div className="mt-3 rounded-lg bg-page p-3 text-sm">
            <p>Para o assistente funcionar, cole a chave gratuita do Groq ou do Gemini.</p>
            <PrimaryButton type="button" className="mt-2" onClick={() => setKeys({})}>Configurar agora</PrimaryButton>
          </div>
        )}
      </Card>

      <Card>
        {msgs === null ? (
          <Empty>Carregando…</Empty>
        ) : (
          <div className="flex flex-col gap-3" aria-live="polite">
            {msgs.length === 0 && (
              <div className="py-4 text-center text-sm text-muted">
                <Sparkles size={24} aria-hidden="true" className="mx-auto mb-2 text-brand" />
                <p>Oi{name ? `, ${name.split(" ")[0]}` : ""}. Eu leio seus lançamentos, contas, metas e agenda para responder. Pode perguntar ou mandar um áudio.</p>
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[92%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-brand text-white" : "bg-page"}`}>
                  {m.role === "assistant" ? <Rich text={m.content} /> : m.content}
                </div>
                {m.actions?.map((a, i) => (
                  <ActionCard key={i} a={a} state={m.states?.[i] ?? "pendente"} onConfirm={() => void confirm(m, i, a)} onDiscard={() => void setState(m, i, "descartada")} />
                ))}
              </div>
            ))}
            {thinking && <p className="text-sm text-muted">Pensando…</p>}
            <div ref={endRef} />
          </div>
        )}
        {msgs && msgs.length === 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => void send(s)} className="min-h-9 rounded-full border border-line px-3 text-sm hover:border-brand">{s}</button>
            ))}
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <label className="sr-only" htmlFor="pergunta">Mensagem para o assistente</label>
          <textarea
            id="pergunta"
            rows={1}
            className={`${inputClass} min-h-11 flex-1 resize-none py-2.5`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder={rec ? "Gravando… toque no quadrado para enviar" : "Pergunte ou conte um gasto"}
            disabled={!!rec}
          />
          {canRecord() &&
            (rec ? (
              <button type="button" aria-label="Parar e enviar o áudio" onClick={() => rec.stop()} className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-danger text-white"><Square size={18} aria-hidden="true" /></button>
            ) : (
              <button type="button" aria-label="Mandar áudio" disabled={thinking} onClick={() => void voice()} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line text-ink hover:border-brand"><Mic size={18} aria-hidden="true" /></button>
            ))}
          <PrimaryButton type="submit" aria-label="Enviar" disabled={thinking || !text.trim()}><Send size={18} aria-hidden="true" /></PrimaryButton>
        </form>
        {msgs && msgs.length > 0 && (
          <button type="button" onClick={() => void clearAll()} className="mt-3 flex min-h-11 items-center gap-1 text-xs text-muted hover:text-danger"><Trash2 size={14} aria-hidden="true" /> Apagar a conversa</button>
        )}
      </Card>
      {keys && <AiKeysSheet {...(keys.reason ? { reason: keys.reason } : {})} onClose={() => setKeys(null)} />}
    </div>
  );
}

const PAY: Record<TxAction["payment"], string> = { pix: "Pix", dinheiro: "dinheiro", debito: "débito", credito: "crédito" };

function ActionCard({ a, state, onConfirm, onDiscard }: { a: AiAction; state: ActionState; onConfirm: () => void; onDiscard: () => void }) {
  const [busy, setBusy] = useState(false);
  let icon = <Wallet size={18} aria-hidden="true" />;
  let title = "";
  let detail = "";
  if (a.kind === "transaction") {
    title = `${a.type === "receita" ? "Receita" : "Despesa"} de ${formatBrl(a.amount_cents)}`;
    detail = [a.description, a.category, a.installments ? `${a.installments}x no ${a.card ?? "cartão"}` : a.card ? `cartão ${a.card}` : `${PAY[a.payment]}${a.account ? ` na ${a.account}` : ""}`, a.scope === "casa" ? "Casa" : a.scope === "empresa" ? "Empresa" : "Pessoal", format(parseISO(a.date), "dd/MM")].filter(Boolean).join(", ");
  } else if (a.kind === "task") {
    icon = <CalendarPlus size={18} aria-hidden="true" />;
    title = a.title;
    detail = ["Agenda", a.date ? format(parseISO(a.date), "dd/MM") : "sem data", a.time, a.priority === "alta" ? "prioridade alta" : null].filter(Boolean).join(", ");
  } else {
    icon = <ShoppingCart size={18} aria-hidden="true" />;
    title = `${a.items.length} ${a.items.length === 1 ? "item" : "itens"} para a lista de compras`;
    detail = a.items.map((i) => i.name).join(", ");
  }
  return (
    <div className={`w-full max-w-[92%] rounded-xl border p-3 text-sm ${state === "salva" ? "border-income bg-income-bg" : state === "descartada" ? "border-line opacity-60" : "border-brand"}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-brand">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted">{detail}</p>
        </div>
      </div>
      {state === "pendente" ? (
        <div className="mt-2 flex gap-2">
          <PrimaryButton type="button" className="flex flex-1 items-center justify-center gap-1" disabled={busy} onClick={() => { setBusy(true); onConfirm(); }}><Check size={16} aria-hidden="true" /> Confirmar</PrimaryButton>
          <SecondaryButton type="button" className="flex items-center gap-1" onClick={onDiscard}><X size={16} aria-hidden="true" /> Descartar</SecondaryButton>
        </div>
      ) : (
        <p className="mt-1 text-xs font-medium">{state === "salva" ? "Salvo." : "Descartado."}</p>
      )}
    </div>
  );
}
