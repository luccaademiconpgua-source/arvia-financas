// Metas ligadas ao patrimônio: quanto é a meta, quanto já tem, o ritmo e quando chega.
import type { Account, Category, Goal, Transaction } from "../types";
import { accountBalanceCents, balanceDeltaCents } from "./calc";
import { shiftMonth } from "./clock";
import type { Asset } from "./networth";

const lastMonths = (today: string, n = 3) => Array.from({ length: n }, (_, i) => shiftMonth(today.slice(0, 7), -(i + 1)));

/** Média mensal de gastos essenciais nos 3 meses fechados anteriores (base da reserva de emergência). */
export function essentialMonthlyAvg(txs: readonly Transaction[], categories: readonly Category[], today: string): number {
  const ess = new Map(categories.map((c) => [c.id, c.essential]));
  const months = lastMonths(today);
  const per = months.map((m) =>
    txs
      .filter((t) => t.type === "despesa" && !t.isTransfer && t.date.startsWith(m) && (t.essential ?? ess.get(t.categoryId ?? "") ?? false))
      .reduce((s, t) => s + t.amountCents, 0),
  );
  const withData = per.filter((v) => v > 0);
  return withData.length ? Math.round(withData.reduce((a, b) => a + b, 0) / withData.length) : 0;
}

/** Arredonda para cima em centenas de reais (R$ 6.700,02 vira R$ 6.800,00). */
export const roundUp100 = (c: number) => Math.ceil(c / 10000) * 10000;

export type GoalCtx = { txs: readonly Transaction[]; accounts: readonly Account[]; categories: readonly Category[]; assets: readonly Asset[]; today: string };

/** Valor da meta: N meses de essenciais, % da carta (lance) ou o valor fixo. */
export function goalTarget(g: Goal, c: GoalCtx): { cents: number; basis: string | null } {
  if (g.kind === "emergencia" && g.monthsTarget) {
    const avg = essentialMonthlyAvg(c.txs, c.categories, c.today);
    if (avg > 0) return { cents: roundUp100(avg * g.monthsTarget), basis: `${g.monthsTarget} meses de gastos essenciais (média de ${(avg / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por mês)` };
  }
  if (g.kind === "lance" && g.assetId && g.lancePct) {
    const a = c.assets.find((x) => x.id === g.assetId);
    if (a?.creditCents) return { cents: Math.round((a.creditCents * g.lancePct) / 100), basis: `lance de ${String(g.lancePct).replace(".", ",")}% da ${a.name}` };
  }
  return { cents: g.targetCents, basis: null };
}

/** Quanto já tem: saldo da conta ligada, ou o que foi reservado na meta. */
export function goalSaved(g: Goal, c: GoalCtx): number {
  if (g.accountId) {
    const acc = c.accounts.find((a) => a.id === g.accountId);
    if (acc) return accountBalanceCents(acc, c.txs);
  }
  return c.txs.reduce((s, t) => (t.type === "reserva" && t.goalId === g.id ? s + t.amountCents : s), 0);
}

/** Ritmo: média do que entrou na meta (ou na conta ligada) nos 3 meses fechados anteriores. */
export function goalPace(g: Goal, c: GoalCtx): number {
  const months = lastMonths(c.today);
  const inWindow = (t: Transaction) => months.some((m) => t.date.startsWith(m));
  let total = 0;
  if (g.accountId) {
    for (const t of c.txs) if (t.accountId === g.accountId && inWindow(t)) total += balanceDeltaCents(t);
  } else {
    for (const t of c.txs) if (t.type === "reserva" && t.goalId === g.id && inWindow(t)) total += t.amountCents;
  }
  return Math.round(total / months.length);
}

export type GoalPlan = {
  targetCents: number;
  basis: string | null;
  savedCents: number;
  remainingCents: number;
  pct: number; // 0..100
  paceCents: number;
  monthsLeft: number | null; // no ritmo atual; null se o ritmo é zero ou negativo
  etaMonth: string | null; // YYYY-MM
  neededPerMonthCents: number | null; // para chegar até a data-alvo
  monthsToDate: number | null;
  done: boolean;
};

export function goalPlan(g: Goal, c: GoalCtx): GoalPlan {
  const { cents: target, basis } = goalTarget(g, c);
  const saved = goalSaved(g, c);
  const remaining = Math.max(0, target - saved);
  const pace = goalPace(g, c);
  const done = target > 0 && saved >= target;
  const monthsLeft = done ? 0 : pace > 0 ? Math.ceil(remaining / pace) : null;
  const ym = c.today.slice(0, 7);
  let monthsToDate: number | null = null;
  if (g.targetDate) {
    const [y1, m1] = ym.split("-").map(Number) as [number, number];
    const [y2, m2] = g.targetDate.slice(0, 7).split("-").map(Number) as [number, number];
    monthsToDate = Math.max(0, (y2 - y1) * 12 + (m2 - m1));
  }
  return {
    targetCents: target,
    basis,
    savedCents: saved,
    remainingCents: remaining,
    pct: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0,
    paceCents: pace,
    monthsLeft,
    etaMonth: monthsLeft === null ? null : shiftMonth(ym, monthsLeft),
    neededPerMonthCents: monthsToDate === null || done ? null : Math.ceil(remaining / Math.max(1, monthsToDate)),
    monthsToDate,
    done,
  };
}
