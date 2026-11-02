import { describe, expect, it } from "vitest";
import { monthReport } from "./monthReport";
import type { Category, Transaction } from "../types";

const cats: Category[] = [
  { id: "m", mode: "pessoal", name: "Mercado", kind: "despesa", essential: true },
  { id: "r", mode: "pessoal", name: "Restaurante", kind: "despesa", essential: false },
  { id: "s", mode: "pessoal", name: "Salário", kind: "receita", essential: false },
];
let n = 0;
const tx = (date: string, type: Transaction["type"], cents: number, categoryId?: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, mode: "pessoal", type, description: "x", payment: "pix", amountCents: cents, date, affectsBalance: true, source: "manual", ...(categoryId ? { categoryId } : {}), ...extra,
});

describe("resumo do mês", () => {
  const txs = [
    // três meses de base: mercado 1000, restaurante 300
    ...["2026-07", "2026-08", "2026-09"].flatMap((m) => [tx(`${m}-05`, "despesa", 100000, "m"), tx(`${m}-10`, "despesa", 30000, "r")]),
    tx("2026-10-01", "receita", 800000, "s"),
    tx("2026-10-05", "despesa", 90000, "m"),
    tx("2026-10-12", "despesa", 60000, "r"),
    tx("2026-10-15", "despesa", 50000, undefined, { isTransfer: true }),
    tx("2026-10-20", "reserva", 100000),
  ];
  const r = monthReport({
    txs, categories: cats, ym: "2026-10",
    budgets: [{ id: "b", categoryId: "r", limitCents: 50000, savingsPct: null }],
    snapshots: [{ month: "2026-09", assetsCents: 1000000, liabilitiesCents: 200000 }, { month: "2026-10", assetsCents: 1300000, liabilitiesCents: 200000 }],
  });
  it("entrou, saiu e sobrou (sem transferências)", () => {
    expect(r).toMatchObject({ incomeCents: 800000, expenseCents: 150000, leftCents: 650000, savedToGoalsCents: 100000, essentialCents: 90000 });
    expect(r.expenseChangePct).toBeCloseTo(15.38, 1);
  });
  it("o que mais subiu e caiu em relação à média", () => {
    expect(r.biggestRise).toMatchObject({ name: "Restaurante", cents: 60000, avgCents: 30000, changePct: 100 });
    expect(r.biggestDrop).toMatchObject({ name: "Mercado", avgCents: 100000 });
  });
  it("orçamento e patrimônio", () => {
    expect(r.budgets).toEqual([{ name: "Restaurante", spentCents: 60000, limitCents: 50000, over: true }]);
    expect(r.netWorth).toEqual({ endCents: 1100000, prevCents: 800000 });
  });
});
