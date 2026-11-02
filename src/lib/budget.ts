import type { Transaction } from "../types";
import { daysInMonth } from "./dashboard";
import { shiftMonth } from "./clock";

export type Budget = { id: string; categoryId: string | null; limitCents: number | null; savingsPct: number | null };

export type BudgetState = "ok" | "alerta" | "estourou";

export type BudgetLine = {
  budget: Budget;
  categoryId: string;
  spentCents: number;
  limitCents: number;
  pct: number; // 0..n
  state: BudgetState;
  remainingCents: number; // negativo = passou
  perDayCents: number | null; // quanto dá para gastar por dia até o fim do mês (mês atual)
  forecastCents: number | null; // projeção no ritmo atual (mês atual)
};

const counts = (t: Transaction) => t.type === "despesa" && !t.isTransfer;

export function spentByCategory(txs: readonly Transaction[], ym: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txs) {
    if (!counts(t) || !t.date.startsWith(ym) || !t.categoryId) continue;
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amountCents);
  }
  return m;
}

/** Linhas do orçamento do mês. Alerta a partir de 80% do teto. */
export function budgetLines(budgets: Budget[], txs: readonly Transaction[], ym: string, today: string): BudgetLine[] {
  const spent = spentByCategory(txs, ym);
  const days = daysInMonth(ym);
  const isCurrent = today.startsWith(ym);
  const day = isCurrent ? Number(today.slice(8, 10)) : days;
  return budgets
    .filter((b): b is Budget & { categoryId: string; limitCents: number } => !!b.categoryId && !!b.limitCents)
    .map((b) => {
      const s = spent.get(b.categoryId) ?? 0;
      const pct = s / b.limitCents;
      const remaining = b.limitCents - s;
      const left = days - day + 1;
      return {
        budget: b,
        categoryId: b.categoryId,
        spentCents: s,
        limitCents: b.limitCents,
        pct,
        state: pct > 1 ? "estourou" : pct >= 0.8 ? "alerta" : "ok",
        remainingCents: remaining,
        perDayCents: isCurrent && remaining > 0 ? Math.floor(remaining / left) : null,
        forecastCents: isCurrent && day >= 5 ? Math.round((s / day) * days) : null,
      } satisfies BudgetLine;
    })
    .sort((a, b) => b.pct - a.pct);
}

/** Média mensal de gasto por categoria nos `n` meses anteriores a `ym` (para sugerir o teto). */
export function monthlyAverage(txs: readonly Transaction[], ym: string, n = 3): Map<string, number> {
  const sum = new Map<string, number>();
  for (let i = 1; i <= n; i++) {
    for (const [k, v] of spentByCategory(txs, shiftMonth(ym, -i))) sum.set(k, (sum.get(k) ?? 0) + v);
  }
  const out = new Map<string, number>();
  for (const [k, v] of sum) out.set(k, Math.round(v / n / 1000) * 1000); // arredonda para R$ 10
  return out;
}

export type SavingsStatus = { targetPct: number; incomeCents: number; savedCents: number; targetCents: number; reached: boolean };

export function savingsStatus(pct: number, txs: readonly Transaction[], ym: string): SavingsStatus {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (!t.date.startsWith(ym) || t.isTransfer) continue;
    if (t.type === "receita") income += t.amountCents;
    else if (t.type === "despesa") expense += t.amountCents;
  }
  const target = Math.round((income * pct) / 100);
  const saved = income - expense;
  return { targetPct: pct, incomeCents: income, savedCents: saved, targetCents: target, reached: income > 0 && saved >= target };
}
