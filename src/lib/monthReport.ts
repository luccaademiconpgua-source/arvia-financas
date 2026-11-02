// Resumo de um mês fechado: entrou, saiu, sobrou, onde mais gastou, o que mudou e o patrimônio.
import type { Category, Transaction } from "../types";
import { budgetLines, type Budget } from "./budget";
import { shiftMonth } from "./clock";

export type CatChange = { categoryId: string; name: string; cents: number; avgCents: number; changePct: number | null };
export type MonthReport = {
  ym: string;
  incomeCents: number;
  expenseCents: number;
  leftCents: number;
  leftPct: number | null; // sobra / entrada
  prevExpenseCents: number;
  expenseChangePct: number | null;
  savedToGoalsCents: number;
  essentialCents: number;
  topCategories: CatChange[];
  biggestRise: CatChange | null; // categoria que mais subiu em relação à média dos 3 meses anteriores
  biggestDrop: CatChange | null;
  biggestExpenses: Transaction[];
  budgets: { name: string; spentCents: number; limitCents: number; over: boolean }[];
  netWorth: { endCents: number; prevCents: number | null } | null;
  txCount: number;
};

const isExpense = (t: Transaction) => t.type === "despesa" && !t.isTransfer;
const isIncome = (t: Transaction) => t.type === "receita" && !t.isTransfer;
const pct = (cur: number, base: number) => (base > 0 ? ((cur - base) / base) * 100 : null);

export function monthReport(input: {
  txs: readonly Transaction[];
  categories: readonly Category[];
  ym: string;
  budgets?: Budget[];
  snapshots?: Array<{ month: string; assetsCents: number; liabilitiesCents: number }>;
}): MonthReport {
  const { txs, categories, ym } = input;
  const month = txs.filter((t) => t.date.startsWith(ym));
  const prevYm = shiftMonth(ym, -1);
  const income = month.filter(isIncome).reduce((s, t) => s + t.amountCents, 0);
  const expenses = month.filter(isExpense);
  const expense = expenses.reduce((s, t) => s + t.amountCents, 0);
  const prevExpense = txs.filter((t) => t.date.startsWith(prevYm) && isExpense(t)).reduce((s, t) => s + t.amountCents, 0);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const essentialOf = new Map(categories.map((c) => [c.id, c.essential]));

  const byCat = new Map<string, number>();
  for (const t of expenses) byCat.set(t.categoryId ?? "", (byCat.get(t.categoryId ?? "") ?? 0) + t.amountCents);
  // média dos 3 meses anteriores, por categoria
  const prevMonths = [1, 2, 3].map((i) => shiftMonth(ym, -i));
  const avg = new Map<string, number>();
  const monthsWithData = prevMonths.filter((m) => txs.some((t) => t.date.startsWith(m) && isExpense(t))).length;
  for (const t of txs) {
    if (!isExpense(t) || !prevMonths.some((m) => t.date.startsWith(m))) continue;
    avg.set(t.categoryId ?? "", (avg.get(t.categoryId ?? "") ?? 0) + t.amountCents);
  }
  const keys = new Set([...byCat.keys(), ...avg.keys()]);
  const changes: CatChange[] = [...keys].map((k) => {
    const cents = byCat.get(k) ?? 0;
    const a = monthsWithData > 0 ? Math.round((avg.get(k) ?? 0) / monthsWithData) : 0;
    return { categoryId: k, name: catName.get(k) ?? "Sem categoria", cents, avgCents: a, changePct: pct(cents, a) };
  });
  const relevant = changes.filter((c) => c.avgCents >= 5000 || c.cents >= 5000); // ignora categorias de menos de R$ 50
  const rises = relevant.filter((c) => c.cents - c.avgCents > 0).sort((a, b) => b.cents - b.avgCents - (a.cents - a.avgCents));
  const drops = relevant.filter((c) => c.avgCents - c.cents > 0 && c.avgCents > 0).sort((a, b) => b.avgCents - b.cents - (a.avgCents - a.cents));

  const lastDay = `${ym}-${String(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
  const budgets = budgetLines(input.budgets ?? [], txs, ym, lastDay).map((l) => ({
    name: catName.get(l.categoryId) ?? "Categoria",
    spentCents: l.spentCents,
    limitCents: l.limitCents,
    over: l.spentCents > l.limitCents,
  }));

  const snap = (m: string) => input.snapshots?.find((s) => s.month === m);
  const end = snap(ym);
  const prev = snap(prevYm);

  return {
    ym,
    incomeCents: income,
    expenseCents: expense,
    leftCents: income - expense,
    leftPct: income > 0 ? ((income - expense) / income) * 100 : null,
    prevExpenseCents: prevExpense,
    expenseChangePct: pct(expense, prevExpense),
    savedToGoalsCents: month.filter((t) => t.type === "reserva").reduce((s, t) => s + t.amountCents, 0),
    essentialCents: expenses.filter((t) => t.essential ?? essentialOf.get(t.categoryId ?? "") ?? false).reduce((s, t) => s + t.amountCents, 0),
    topCategories: changes.filter((c) => c.cents > 0).sort((a, b) => b.cents - a.cents).slice(0, 5),
    biggestRise: monthsWithData > 0 ? (rises[0] ?? null) : null,
    biggestDrop: monthsWithData > 0 ? (drops[0] ?? null) : null,
    biggestExpenses: [...expenses].sort((a, b) => b.amountCents - a.amountCents).slice(0, 5),
    budgets,
    netWorth: end ? { endCents: end.assetsCents - end.liabilitiesCents, prevCents: prev ? prev.assetsCents - prev.liabilitiesCents : null } : null,
    txCount: month.length,
  };
}
