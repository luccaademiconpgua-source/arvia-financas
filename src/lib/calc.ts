import type { Account, Goal, Mode, Transaction } from "../types";

/** Isola os dados de um modo. Todas as demais funções recebem listas já filtradas. */
export function filterByMode<T extends { mode: Mode }>(items: readonly T[], mode: Mode): T[] {
  return items.filter((i) => i.mode === mode);
}

/** Efeito de uma transação no saldo da conta, em centavos com sinal. */
export function balanceDeltaCents(t: Transaction): number {
  if (!t.affectsBalance) return 0;
  switch (t.type) {
    case "receita":
      return t.amountCents;
    case "despesa":
    case "reserva":
      return -t.amountCents;
    case "ajuste":
      return t.signedCents ?? 0;
  }
}

/** Saldo da conta = saldo inicial + transações da conta com affectsBalance verdadeiro. */
export function accountBalanceCents(account: Account, transactions: readonly Transaction[]): number {
  if (account.balanceCents !== undefined) return account.balanceCents;
  let total = account.openingBalanceCents;
  for (const t of transactions) {
    if (t.accountId === account.id) total += balanceDeltaCents(t);
  }
  return total;
}

/** Saldo total = soma das contas. Cartão não entra. */
export function totalBalanceCents(accounts: readonly Account[], transactions: readonly Transaction[]): number {
  return accounts.reduce((sum, a) => sum + accountBalanceCents(a, transactions), 0);
}

/** Reservado na meta = soma das transações type reserva com o goalId da meta. */
export function goalSavedCents(goal: Goal, transactions: readonly Transaction[]): number {
  let total = 0;
  for (const t of transactions) {
    if (t.type === "reserva" && t.goalId === goal.id) total += t.amountCents;
  }
  return total;
}

/** Progresso de 0 a 1. A barra nunca passa de 100%. */
export function goalProgress(goal: Goal, transactions: readonly Transaction[]): number {
  if (goal.targetCents <= 0) return 0;
  return Math.min(1, goalSavedCents(goal, transactions) / goal.targetCents);
}

// ---------- Resumo, fluxo, gastos e saúde ----------
import type { Card, Category } from "../types";
import { shiftDays, shiftMonth } from "./clock";

export type Range = "mes" | "30d" | "6m";

export type Summary = {
  receitasCents: number;
  despesasCents: number;
  sobrouCents: number;
  /** 0 a 1, ou null se não houve receita */
  sobrouPct: number | null;
  /** só no intervalo "mes" */
  recebidoAteHojeCents: number | null;
  pagoNoCartaoCents: number | null;
};

const sumType = (txs: readonly Transaction[], type: Transaction["type"]): number =>
  txs.reduce((s, t) => (t.type === type && !t.isTransfer ? s + t.amountCents : s), 0);

export function inMonth(txs: readonly Transaction[], ym: string): Transaction[] {
  return txs.filter((t) => t.date.startsWith(ym));
}

export function inRange(txs: readonly Transaction[], range: Range, today: string): Transaction[] {
  const ym = today.slice(0, 7);
  if (range === "mes") return inMonth(txs, ym);
  if (range === "30d") {
    const from = shiftDays(today, -29);
    return txs.filter((t) => t.date >= from && t.date <= today);
  }
  const from = `${shiftMonth(ym, -5)}-01`;
  return txs.filter((t) => t.date >= from && t.date.slice(0, 7) <= ym);
}

export function summarize(txs: readonly Transaction[], range: Range, today: string): Summary {
  const list = inRange(txs, range, today);
  const receitasCents = sumType(list, "receita");
  const despesasCents = sumType(list, "despesa");
  const sobrouCents = receitasCents - despesasCents;
  const mes = range === "mes";
  return {
    receitasCents,
    despesasCents,
    sobrouCents,
    sobrouPct: receitasCents > 0 ? sobrouCents / receitasCents : null,
    recebidoAteHojeCents: mes ? list.reduce((s, t) => (t.type === "receita" && !t.isTransfer && t.date <= today ? s + t.amountCents : s), 0) : null,
    pagoNoCartaoCents: mes ? list.reduce((s, t) => (t.type === "despesa" && !t.isTransfer && (t.payment === "credito" || t.cardId) ? s + t.amountCents : s), 0) : null,
  };
}

export type CashflowPoint = { ym: string; receitasCents: number; despesasCents: number };

/** Seis meses terminando no mês de `today`, duas séries. */
export function cashflow(txs: readonly Transaction[], today: string, months = 6): CashflowPoint[] {
  const ym = today.slice(0, 7);
  const out: CashflowPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = shiftMonth(ym, -i);
    const list = inMonth(txs, m);
    out.push({ ym: m, receitasCents: sumType(list, "receita"), despesasCents: sumType(list, "despesa") });
  }
  return out;
}

export type CategorySlice = { name: string; cents: number; pct: number };

/** Despesas do mês por categoria: as 4 maiores e "Outras categorias". Percentual com 1 casa. */
export function expenseByCategory(txs: readonly Transaction[], ym: string, categories: readonly Category[]): CategorySlice[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const totals = new Map<string, number>();
  let total = 0;
  for (const t of inMonth(txs, ym)) {
    if (t.type !== "despesa" || t.isTransfer) continue;
    const name = names.get(t.categoryId ?? "") ?? "Outras";
    totals.set(name, (totals.get(name) ?? 0) + t.amountCents);
    total += t.amountCents;
  }
  if (total === 0) return [];
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4).reduce((s, [, c]) => s + c, 0);
  if (rest > 0) top.push(["Outras categorias", rest]);
  return top.map(([name, cents]) => ({ name, cents, pct: Math.round((cents / total) * 1000) / 10 }));
}

/** Variação percentual. Sem mês anterior, não há comparação. */
export function variationPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function openInvoiceCents(cards: readonly Card[]): number {
  return cards.reduce((s, c) => s + c.invoices.reduce((x, i) => (i.status === "paga" ? x : x + i.amountCents), 0), 0);
}

export function worstInvoiceStatus(card: Card): "vencida" | "aberta" | "paga" | null {
  if (card.invoices.length === 0) return null;
  if (card.invoices.some((i) => i.status === "vencida")) return "vencida";
  if (card.invoices.some((i) => i.status === "aberta")) return "aberta";
  return "paga";
}

export type HealthInput = {
  receitasCents: number;
  sobrouCents: number;
  hasOverdueInvoice: boolean;
  emergencySavedCents: number;
  emergencyTargetCents: number;
  parcelasCents: number;
  /** uso do limite dos cartões, 0 a 1, ou null se não houver limite */
  cardUsage: number | null;
};

export type Health = { score: number; status: "Bom" | "Atenção" | "Crítico"; tips: string[] };

/**
 * Nota de saúde, 0 a 100.
 * Fatura: 30 sem fatura vencida, 15 com. Sobra: 25 se sobrou 10% ou mais da receita.
 * Reserva: até 25, proporcional à meta de emergência. Parcelas: 20 abaixo de 25% da
 * receita, caindo em linha reta até 0 em 40%.
 */
export function healthScore(i: HealthInput): Health {
  const fatura = i.hasOverdueInvoice ? 15 : 30;
  const sobra = i.receitasCents > 0 && i.sobrouCents / i.receitasCents >= 0.1 ? 25 : 0;
  const reservaRatio = i.emergencyTargetCents > 0 ? Math.min(1, i.emergencySavedCents / i.emergencyTargetCents) : 0;
  const reserva = 25 * reservaRatio;
  const parcelasRatio = i.receitasCents > 0 ? i.parcelasCents / i.receitasCents : i.parcelasCents > 0 ? 1 : 0;
  const parcelas = parcelasRatio < 0.25 ? 20 : parcelasRatio >= 0.4 ? 0 : (20 * (0.4 - parcelasRatio)) / 0.15;
  const score = Math.round(fatura + sobra + reserva + parcelas);

  const tips: string[] = [];
  if (i.hasOverdueInvoice) tips.push("Fatura vencida.");
  if (i.cardUsage !== null && i.cardUsage >= 0.5) tips.push(`Limite do cartão com ${Math.round(i.cardUsage * 100)}% de uso.`);
  if (i.emergencyTargetCents > 0 && reservaRatio < 0.1) tips.push("Reserva abaixo de 10% da meta.");
  if (parcelasRatio > 0.25) tips.push("Parcelas acima de 25% da receita.");
  return { score, status: score >= 75 ? "Bom" : score >= 50 ? "Atenção" : "Crítico", tips: tips.slice(0, 3) };
}
