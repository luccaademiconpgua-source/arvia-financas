import { useState } from "react";
import { Link } from "react-router";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../components/Sheet";
import { useModeData } from "../hooks/useModeData";
import { todayIso } from "../lib/clock";
import { essentialMonthlyAvg, goalPlan, roundUp100, type GoalCtx, type GoalPlan } from "../lib/goals";
import { formatBrl, parseBrlToCents } from "../lib/money";
import { supabase } from "../lib/supabase";
import { useNetWorthData } from "../services/networth";
import { useRefresh } from "../store/refresh";
import { useUI } from "../store/ui";
import type { Goal, Mode } from "../types";

const monthLabel = (ym: string) => format(parseISO(`${ym}-01`), "MMMM 'de' yyyy", { locale: ptBR });
const KIND: Record<Goal["kind"], string> = { emergencia: "Reserva de emergência", lance: "Lance de consórcio", geral: "Outra meta" };

function PlanText({ g, p }: { g: Goal; p: GoalPlan }) {
  if (p.done) return <p className="text-sm font-medium text-income">Meta alcançada.</p>;
  const lines: string[] = [];
  if (p.paceCents > 0 && p.monthsLeft !== null && p.etaMonth) {
    lines.push(`No ritmo dos últimos 3 meses (${formatBrl(p.paceCents)} por mês), chega em ${monthLabel(p.etaMonth)}, daqui a ${p.monthsLeft} ${p.monthsLeft === 1 ? "mês" : "meses"}.`);
  } else {
    lines.push(g.accountId ? "A conta ligada não cresceu nos últimos 3 meses, então ainda não dá para prever quando chega." : "Nada foi reservado nos últimos 3 meses, então ainda não dá para prever quando chega.");
  }
  if (p.neededPerMonthCents !== null && g.targetDate) {
    const ok = p.paceCents >= p.neededPerMonthCents;
    lines.push(`Para chegar até ${format(parseISO(g.targetDate), "MM/yyyy")}, precisa guardar ${formatBrl(p.neededPerMonthCents)} por mês${ok ? ", e o ritmo atual dá conta." : "."}`);
  }
  return (
    <div className="mt-2 space-y-1 text-sm text-muted">
      {lines.map((l) => <p key={l}>{l}</p>)}
    </div>
  );
}

export function Goals() {
  const { mode, ready, goals, transactions, accounts, categories } = useModeData();
  const nw = useNetWorthData(mode);
  const [editing, setEditing] = useState<null | { goal?: Goal }>(null);
  const openTx = useUI((s) => s.openTx);
  if (!ready || !nw.ready) return <Empty>Carregando…</Empty>;
  const ctx: GoalCtx = { txs: transactions, accounts, categories, assets: nw.assets, today: todayIso() };

  return (
    <div className="flex flex-col gap-4">
      {goals.length === 0 && (
        <Card>
          <Empty>Nenhuma meta ainda. Comece pela reserva de emergência: a Arvia calcula o valor a partir dos seus gastos essenciais.</Empty>
        </Card>
      )}
      {goals.map((g) => {
        const p = goalPlan(g, ctx);
        const acc = accounts.find((a) => a.id === g.accountId);
        return (
          <Card key={g.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold">{g.name}</p>
                <p className="text-xs text-muted">{KIND[g.kind]}{p.basis ? `: ${p.basis}` : ""}</p>
              </div>
              <Pill tone={p.done ? "ok" : "neutral"}>{p.pct}%</Pill>
            </div>
            <p className="mt-3 text-sm">
              <span className="num text-xl font-semibold">{formatBrl(p.savedCents)}</span> <span className="text-muted">de <span className="num">{formatBrl(p.targetCents)}</span></span>
            </p>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct} aria-label={`Progresso de ${g.name}`} className="mt-2 h-2.5 rounded-full bg-line">
              <div className="h-2.5 rounded-full bg-brand" style={{ width: `${p.pct}%` }} />
            </div>
            {!p.done && <p className="mt-1 text-xs text-muted">Faltam <span className="num">{formatBrl(p.remainingCents)}</span>{acc ? `. O progresso é o saldo da conta ${acc.name}.` : "."}</p>}
            <PlanText g={g} p={p} />
            <div className="mt-3 flex flex-wrap gap-2">
              {!acc && !p.done && <PrimaryButton type="button" onClick={() => openTx({ type: "reserva", goalId: g.id })}>Reservar agora</PrimaryButton>}
              <SecondaryButton type="button" onClick={() => setEditing({ goal: g })}>Editar meta</SecondaryButton>
            </div>
          </Card>
        );
      })}
      <div>
        <PrimaryButton type="button" onClick={() => setEditing({})}>Nova meta</PrimaryButton>
      </div>
      {editing && <GoalSheet mode={mode} ctx={ctx} {...(editing.goal ? { goal: editing.goal } : {})} onClose={() => setEditing(null)} />}
    </div>
  );
}

function GoalSheet({ mode, ctx, goal, onClose }: { mode: Mode; ctx: GoalCtx; goal?: Goal; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const cartas = ctx.assets.filter((a) => a.kind === "consorcio" && !a.contemplated);
  const [kind, setKind] = useState<Goal["kind"]>(goal?.kind ?? "emergencia");
  const [name, setName] = useState(goal?.name ?? "");
  const [months, setMonths] = useState(String(goal?.monthsTarget ?? 6));
  const [assetId, setAssetId] = useState(goal?.assetId ?? cartas[0]?.id ?? "");
  const [lancePct, setLancePct] = useState(goal?.lancePct ? String(goal.lancePct).replace(".", ",") : "25");
  const [target, setTarget] = useState(goal && !goal.monthsTarget && !goal.assetId ? (goal.targetCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
  const [accountId, setAccountId] = useState(goal?.accountId ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate?.slice(0, 7) ?? "");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const avg = essentialMonthlyAvg(ctx.txs, ctx.categories, ctx.today);
  const carta = cartas.find((a) => a.id === assetId) ?? ctx.assets.find((a) => a.id === assetId);
  const pctNum = Number(lancePct.replace(",", "."));
  const monthsNum = Number(months);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    let targetCents: number;
    const row: Record<string, unknown> = { kind, months_target: null, asset_id: null, lance_pct: null, account_id: accountId || null, target_date: targetDate ? `${targetDate}-01` : null };
    if (kind === "emergencia") {
      if (!Number.isInteger(monthsNum) || monthsNum < 1 || monthsNum > 24) return setError("Escolha de 1 a 24 meses.");
      const manual = parseBrlToCents(target);
      if (avg === 0 && (!manual || manual <= 0)) return setError("Ainda não há gastos essenciais para calcular. Informe o valor da meta.");
      targetCents = avg > 0 ? roundUp100(avg * monthsNum) : manual!;
      row["months_target"] = monthsNum;
    } else if (kind === "lance") {
      if (!carta?.creditCents) return setError("Cadastre a carta de consórcio no Patrimônio primeiro.");
      if (!(pctNum > 0 && pctNum <= 100)) return setError("Informe o percentual do lance, de 1 a 100.");
      targetCents = Math.round((carta.creditCents * pctNum) / 100);
      row["asset_id"] = carta.id;
      row["lance_pct"] = pctNum;
    } else {
      const c = parseBrlToCents(target);
      if (!c || c <= 0) return setError("Informe o valor da meta.");
      targetCents = c;
    }
    const finalName = name.trim() || (kind === "emergencia" ? "Reserva de emergência" : kind === "lance" ? `Lance da ${carta?.name ?? "carta"}` : "");
    if (!finalName) return setError("Dê um nome à meta.");
    Object.assign(row, { name: finalName.slice(0, 60), target_cents: targetCents });
    const q = goal ? supabase.from("goals").update(row).eq("id", goal.id) : supabase.from("goals").insert({ scope: mode, ...row });
    void q.then(({ error: err }) => {
      if (err) return setError(err.message);
      useRefresh.getState().bump();
      showToast(goal ? "Meta atualizada" : "Meta criada");
      onClose();
    });
  }

  function remove() {
    if (!goal) return;
    void supabase.from("goals").delete().eq("id", goal.id).then(({ error: err }) => {
      if (err) return setError(err.message);
      useRefresh.getState().bump();
      onClose();
    });
  }

  return (
    <Sheet title={goal ? goal.name : "Nova meta"} onClose={onClose}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Tipo de meta" className="grid grid-cols-3 gap-1">
          {(["emergencia", "lance", "geral"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`min-h-11 rounded-lg border px-1 text-xs font-medium ${kind === k ? "border-brand bg-brand text-white" : "border-line"}`}>
              {k === "emergencia" ? "Reserva" : k === "lance" ? "Lance" : "Outra"}
            </button>
          ))}
        </div>
        <Field label="Nome"><input className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={kind === "emergencia" ? "Reserva de emergência" : kind === "lance" ? "Lance da carta" : "Viagem"} /></Field>

        {kind === "emergencia" && (
          <>
            <Field label="Quantos meses de gastos essenciais">
              <input className={inputClass} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </Field>
            {avg > 0 ? (
              <p className="-mt-1 text-sm text-muted">
                Seus essenciais (mercado, contas, moradia…) dão em média {formatBrl(avg)} por mês. {monthsNum > 0 ? <>A meta fica em <strong className="num">{formatBrl(roundUp100(avg * monthsNum))}</strong> e se ajusta sozinha quando os gastos mudam.</> : null}
              </p>
            ) : (
              <Field label="Valor da meta (sem histórico de gastos ainda)"><input className={inputClass} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0,00" /></Field>
            )}
          </>
        )}

        {kind === "lance" && (
          cartas.length === 0 && !carta ? (
            <p className="rounded-lg bg-page p-3 text-sm">Cadastre a carta de consórcio em <Link to="/patrimonio" className="text-brand underline" onClick={onClose}>Patrimônio</Link> para criar a meta do lance.</p>
          ) : (
            <>
              <Field label="Carta">
                <select className={inputClass} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                  {(carta && !cartas.includes(carta) ? [carta, ...cartas] : cartas).map((a) => <option key={a.id} value={a.id}>{a.name} ({formatBrl(a.creditCents ?? 0)})</option>)}
                </select>
              </Field>
              <Field label="Lance (% do crédito)"><input className={inputClass} inputMode="decimal" value={lancePct} onChange={(e) => setLancePct(e.target.value.replace(/[^\d,]/g, "").slice(0, 5))} /></Field>
              {carta?.creditCents && pctNum > 0 && <p className="-mt-1 text-sm text-muted">Lance de <strong className="num">{formatBrl(Math.round((carta.creditCents * pctNum) / 100))}</strong>.</p>}
            </>
          )
        )}

        {kind === "geral" && (
          <Field label="Valor da meta"><input className={inputClass} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0,00" /></Field>
        )}

        <Field label="Onde o dinheiro fica guardado">
          <select className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Vou registrar as reservas na meta</option>
            {ctx.accounts.map((a) => <option key={a.id} value={a.id}>Saldo da conta {a.name}</option>)}
          </select>
        </Field>
        <p className="-mt-1 text-xs text-muted">Se o dinheiro já fica numa conta separada (um investimento, uma caixinha), escolha a conta: o saldo dela vira o progresso da meta.</p>
        <Field label="Quero chegar até (opcional)"><input className={inputClass} type="month" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <PrimaryButton type="submit" className="flex-1">{goal ? "Salvar meta" : "Criar meta"}</PrimaryButton>
          <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
        </div>
        {goal && (
          <div className="border-t border-line pt-3 text-sm">
            {!confirm ? (
              <button type="button" className="min-h-11 text-muted underline" onClick={() => setConfirm(true)}>Excluir meta</button>
            ) : (
              <button type="button" className="min-h-11 rounded-lg bg-danger px-3 font-medium text-white" onClick={remove}>Confirmar exclusão (as reservas continuam nos lançamentos)</button>
            )}
          </div>
        )}
      </form>
    </Sheet>
  );
}
