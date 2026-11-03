import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { format, parseISO } from "date-fns";
import { CalendarPlus, Mic, RotateCcw, Square, Wallet } from "lucide-react";
import { Sheet, inputClass, PrimaryButton, SecondaryButton } from "../Sheet";
import { AiKeysSheet } from "./AiKeysSheet";
import { useScopeData } from "../../hooks/useScopeData";
import { resolveTx } from "../../lib/aiActions";
import { formatBrl } from "../../lib/money";
import { supabase } from "../../lib/supabase";
import { AiNeedsKey, canRecord, capture, startRecording, type TaskAction, type TxAction } from "../../services/ai";
import { addTask, deleteTask } from "../../services/tasks";
import { addInstallments, addTransaction, deleteInstallmentGroup, deleteTransaction } from "../../store/actions";
import { useAuth } from "../../store/auth";
import { useRefresh } from "../../store/refresh";
import type { Mode } from "../../types";

type Saved =
  | { kind: "tx"; a: TxAction; scope: Mode; id: string; group: boolean; categoryId?: string; undone?: boolean }
  | { kind: "tx-pending"; a: TxAction; scope: Mode; problems: string[]; accountId?: string; cardId?: string; done?: { id: string } }
  | { kind: "task"; a: TaskAction; id: string; undone?: boolean };

type Stage = { s: "idle" } | { s: "rec"; stop: () => void; started: number } | { s: "thinking" } | { s: "done"; heard: string; items: Saved[]; missing: string[] } | { s: "error"; msg: string };

const PAY: Record<TxAction["payment"], string> = { pix: "Pix", dinheiro: "dinheiro", debito: "débito", credito: "crédito" };
const dayLabel = (iso: string) => {
  const today = format(new Date(), "yyyy-MM-dd");
  return iso === today ? "hoje" : format(parseISO(iso), "dd/MM");
};

/** Botão de microfone em todas as telas: fala, a IA entende e lança direto, com desfazer. */
export function QuickCapture() {
  const { pathname } = useLocation();
  const household = useAuth((s) => s.household);
  const pessoal = useScopeData("pessoal");
  const casa = useScopeData("casa", !!household);
  const hasEmpresa = useAuth((s) => !!s.profile?.empresaName);
  const empresa = useScopeData("empresa", hasEmpresa);
  const [stage, setStage] = useState<Stage>({ s: "idle" });
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [keys, setKeys] = useState<null | { reason?: string }>(null);
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);

  useEffect(() => {
    if (stage.s !== "rec") return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [stage.s]);

  const dataFor = (scope: Mode) => (scope === "casa" && household ? casa : scope === "empresa" && hasEmpresa ? empresa : pessoal);

  /** Lança tudo o que dá para lançar sem perguntar; o resto fica para a pessoa escolher conta ou cartão. */
  const apply = useCallback(
    async (heard: string, actions: Array<TxAction | TaskAction>, missing: string[]) => {
      const items: Saved[] = [];
      for (const a of actions) {
        if (a.kind === "task") {
          const id = await addTask("pessoal", { title: a.title, date: a.date, time: a.time, priority: a.priority });
          items.push({ kind: "task", a, id });
          continue;
        }
        const scope: Mode = a.scope === "casa" && household ? "casa" : a.scope === "empresa" && hasEmpresa ? "empresa" : "pessoal";
        const r = resolveTx(a, dataFor(scope));
        if (r.problems.length) {
          items.push({ kind: "tx-pending", a, scope, problems: r.problems });
          continue;
        }
        if (r.cardId && r.installments) {
          const g = await addInstallments({ mode: scope, description: r.description, totalCents: r.amountCents, count: r.installments, date: r.date, cardId: r.cardId, categoryId: r.categoryId });
          items.push({ kind: "tx", a, scope, id: g, group: true, ...(r.categoryId ? { categoryId: r.categoryId } : {}) });
        } else {
          const id = await addTransaction({ mode: scope, type: r.type, description: r.description, amountCents: r.amountCents, date: r.date, payment: r.payment, categoryId: r.categoryId, accountId: r.accountId, cardId: r.cardId });
          items.push({ kind: "tx", a, scope, id, group: false, ...(r.categoryId ? { categoryId: r.categoryId } : {}) });
        }
      }
      setStage({ s: "done", heard, items, missing });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household, hasEmpresa, pessoal, casa, empresa],
  );

  async function run(input: { audio: string; mime: string } | { text: string }) {
    if (busy.current) return;
    busy.current = true;
    setStage({ s: "thinking" });
    try {
      const r = await capture(input);
      await apply(r.text, r.actions, r.missing);
    } catch (e) {
      if (e instanceof AiNeedsKey) {
        setOpen(false);
        setStage({ s: "idle" });
        setKeys({ reason: e.message });
      } else setStage({ s: "error", msg: e instanceof Error ? e.message : "Não consegui lançar agora." });
    } finally {
      busy.current = false;
    }
  }

  async function record() {
    setOpen(true);
    setTyped("");
    try {
      const r = await startRecording();
      setStage({ s: "rec", stop: r.stop, started: Date.now() });
      const audio = await r.done;
      await run(audio);
    } catch (e) {
      setStage({ s: "error", msg: e instanceof Error ? e.message : "Não consegui usar o microfone." });
    }
  }

  function close() {
    if (stage.s === "rec") stage.stop();
    setOpen(false);
    setStage({ s: "idle" });
  }

  function patch(i: number, next: Saved) {
    setStage((st) => (st.s === "done" ? { ...st, items: st.items.map((x, j) => (j === i ? next : x)) } : st));
  }

  if (pathname.startsWith("/assistente")) return keys ? <AiKeysSheet {...(keys.reason ? { reason: keys.reason } : {})} onClose={() => setKeys(null)} /> : null;

  return (
    <>
      <button
        type="button"
        onClick={() => (canRecord() ? void record() : (setOpen(true), setStage({ s: "error", msg: "Este navegador não grava áudio. Escreva o lançamento abaixo." })))}
        aria-label="Lançar por voz"
        className="fixed right-4 z-30 flex size-14 items-center justify-center rounded-full bg-brand-dark text-white shadow-card hover:bg-brand lg:right-8"
        style={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }}
      >
        <Mic size={24} aria-hidden="true" />
      </button>

      {open && (
        <Sheet title={stage.s === "done" ? "Lançado" : "Lançar por voz"} onClose={close}>
          {stage.s === "rec" && (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <span className="relative flex size-20 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-danger/25 motion-reduce:animate-none" aria-hidden="true" />
                <span className="relative flex size-16 items-center justify-center rounded-full bg-danger text-white"><Mic size={28} aria-hidden="true" /></span>
              </span>
              <p className="text-sm" aria-live="polite">
                Ouvindo… <span className="num">{Math.max(0, Math.floor((now - stage.started) / 1000))}s</span>
              </p>
              <p className="max-w-xs text-sm text-muted">Fale tudo de uma vez, como "gastei 45 no mercado no Pix, 120 de gasolina no cartão e recebi 2 mil de comissão".</p>
              <PrimaryButton type="button" className="flex w-full items-center justify-center gap-2" onClick={() => stage.stop()}>
                <Square size={16} aria-hidden="true" /> Pronto, lançar
              </PrimaryButton>
            </div>
          )}

          {stage.s === "thinking" && <p className="py-6 text-center text-sm text-muted" aria-live="polite">Entendendo e lançando…</p>}

          {stage.s === "error" && (
            <div className="flex flex-col gap-3">
              <p role="alert" className="text-sm text-danger">{stage.msg}</p>
              <TypeInstead typed={typed} setTyped={setTyped} onSend={(t) => void run({ text: t })} />
            </div>
          )}

          {stage.s === "done" && (
            <div className="flex flex-col gap-3">
              {stage.heard && <p className="rounded-lg bg-page p-3 text-sm text-muted">"{stage.heard}"</p>}
              {stage.items.length === 0 && stage.missing.length === 0 && (
                <p className="text-sm">Não encontrei gasto, recebimento ou compromisso nessa fala. Tente dizer o valor e o que foi, como "paguei 80 de farmácia".</p>
              )}
              {stage.items.map((it, i) => (
                <ItemCard key={i} it={it} cats={dataFor(it.kind === "task" ? "pessoal" : it.scope).categories} data={it.kind === "tx-pending" ? dataFor(it.scope) : undefined} onChange={(n) => patch(i, n)} />
              ))}
              {stage.missing.length > 0 && (
                <div className="rounded-lg border border-line p-3 text-sm">
                  <p className="font-medium">Faltou o valor:</p>
                  <ul className="mt-1 list-disc pl-5 text-muted">{stage.missing.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              )}
              <div className="flex gap-2">
                <PrimaryButton type="button" className="flex flex-1 items-center justify-center gap-2" onClick={() => void record()} disabled={!canRecord()}>
                  <Mic size={16} aria-hidden="true" /> Falar outro
                </PrimaryButton>
                <SecondaryButton type="button" onClick={close}>Fechar</SecondaryButton>
              </div>
            </div>
          )}
        </Sheet>
      )}
      {keys && <AiKeysSheet {...(keys.reason ? { reason: keys.reason } : {})} onClose={() => setKeys(null)} />}
    </>
  );
}

function TypeInstead({ typed, setTyped, onSend }: { typed: string; setTyped: (s: string) => void; onSend: (t: string) => void }) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (typed.trim()) onSend(typed.trim());
      }}
    >
      <label className="sr-only" htmlFor="lancar-texto">Escreva o lançamento</label>
      <input id="lancar-texto" className={`${inputClass} min-w-0 flex-1`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="gastei 45 no mercado no pix" />
      <PrimaryButton type="submit" disabled={!typed.trim()}>Lançar</PrimaryButton>
    </form>
  );
}

function ItemCard({
  it,
  cats,
  data,
  onChange,
}: {
  it: Saved;
  cats: Array<{ id: string; name: string; kind: string }>;
  data?: ReturnType<typeof useScopeData>;
  onChange: (n: Saved) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (it.kind === "task") {
    return (
      <div className={`rounded-xl border p-3 text-sm ${it.undone ? "border-line opacity-60" : "border-income bg-income-bg"}`}>
        <div className="flex items-start gap-2">
          <CalendarPlus size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{it.a.title}</p>
            <p className="text-xs text-muted">Agenda, {it.a.date ? dayLabel(it.a.date) : "sem data"}{it.a.time ? ` às ${it.a.time}` : ""}</p>
          </div>
          {!it.undone && (
            <button type="button" className="flex min-h-9 items-center gap-1 text-xs text-muted hover:text-danger" onClick={() => void deleteTask(it.id).then(() => onChange({ ...it, undone: true }))}>
              <RotateCcw size={14} aria-hidden="true" /> Desfazer
            </button>
          )}
        </div>
        {it.undone && <p className="mt-1 text-xs">Desfeito.</p>}
      </div>
    );
  }

  const a = it.a;
  const title = `${a.type === "receita" ? "Receita" : "Despesa"} de ${formatBrl(a.amount_cents)}`;
  const how = a.installments ? `${a.installments}x no cartão` : a.card || a.payment === "credito" ? `cartão${a.card ? ` ${a.card}` : ""}` : `${PAY[a.payment]}${a.account ? ` na ${a.account}` : ""}`;
  const detail = [a.description, how, it.scope === "casa" ? "Casa" : it.scope === "empresa" ? "Empresa" : "Pessoal", dayLabel(a.date)].join(", ");

  if (it.kind === "tx-pending") {
    // sem cartão cadastrado, oferece as contas (lança como débito)
    const needsCard = it.problems.some((p) => /cart/i.test(p)) && (data?.cards.length ?? 0) > 0;
    return (
      <div className="rounded-xl border border-amber p-3 text-sm">
        <div className="flex items-start gap-2">
          <Wallet size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{title}</p>
            <p className="text-xs text-muted">{detail}</p>
          </div>
        </div>
        {it.done ? (
          <p className="mt-2 text-xs font-medium text-income">Lançado.</p>
        ) : (
          <>
            <p className="mt-2 text-xs">{needsCard ? "Em qual cartão?" : a.payment === "credito" ? "Não há cartão cadastrado. De qual conta saiu?" : "De qual conta saiu?"}</p>
            <div className="mt-1 flex gap-2">
              <select
                className={`${inputClass} min-w-0 flex-1`}
                aria-label={needsCard ? "Cartão" : "Conta"}
                value={(needsCard ? it.cardId : it.accountId) ?? ""}
                onChange={(e) => onChange(needsCard ? { ...it, cardId: e.target.value } : { ...it, accountId: e.target.value })}
              >
                <option value="">Escolha</option>
                {(needsCard ? data?.cards ?? [] : data?.accounts ?? []).map((x) => (
                  <option key={x.id} value={x.id}>{"label" in x ? x.label : x.name}</option>
                ))}
              </select>
              <PrimaryButton
                type="button"
                disabled={busy || !(needsCard ? it.cardId : it.accountId)}
                onClick={() => {
                  if (!data) return;
                  setBusy(true);
                  const r = resolveTx({ ...a, ...(needsCard ? { card: data.cards.find((c) => c.id === it.cardId)?.label ?? null } : { account: data.accounts.find((x) => x.id === it.accountId)?.name ?? null, card: null, installments: null, payment: a.payment === "credito" ? "debito" : a.payment }) }, data);
                  const go = r.cardId && r.installments
                    ? addInstallments({ mode: it.scope, description: r.description, totalCents: r.amountCents, count: r.installments, date: r.date, cardId: r.cardId, categoryId: r.categoryId })
                    : addTransaction({ mode: it.scope, type: r.type, description: r.description, amountCents: r.amountCents, date: r.date, payment: r.payment, categoryId: r.categoryId, accountId: r.accountId, cardId: r.cardId });
                  void go
                    .then((id) => onChange({ ...it, done: { id } }))
                    .catch((e: Error) => setErr(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Lançar
              </PrimaryButton>
            </div>
            {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
          </>
        )}
      </div>
    );
  }

  const options = cats.filter((c) => c.kind === a.type);
  return (
    <div className={`rounded-xl border p-3 text-sm ${it.undone ? "border-line opacity-60" : "border-income bg-income-bg"}`}>
      <div className="flex items-start gap-2">
        <Wallet size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted">{detail}</p>
        </div>
        {!it.undone && (
          <button
            type="button"
            className="flex min-h-9 shrink-0 items-center gap-1 text-xs text-muted hover:text-danger"
            onClick={() => void (it.group ? deleteInstallmentGroup(it.id) : deleteTransaction(it.id)).then(() => onChange({ ...it, undone: true }))}
          >
            <RotateCcw size={14} aria-hidden="true" /> Desfazer
          </button>
        )}
      </div>
      {it.undone ? (
        <p className="mt-1 text-xs">Desfeito.</p>
      ) : (
        <label className="mt-2 flex items-center gap-2 text-xs">
          <span className="shrink-0 text-muted">Categoria</span>
          <select
            className={`${inputClass} min-h-9 min-w-0 flex-1 text-sm`}
            value={it.categoryId ?? ""}
            onChange={(e) => {
              const categoryId = e.target.value;
              const q = supabase.from("transactions").update({ category_id: categoryId || null });
              void (it.group ? q.eq("installment_group", it.id) : q.eq("id", it.id)).then(({ error }) => {
                if (error) return setErr(error.message);
                useRefresh.getState().bump();
                onChange({ ...it, ...(categoryId ? { categoryId } : {}) });
              });
            }}
          >
            {!it.categoryId && <option value="">Sem categoria</option>}
            {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}
