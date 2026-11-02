import { describe, expect, it } from "vitest";
import { essentialMonthlyAvg, goalPlan, type GoalCtx } from "./goals";
import type { Asset } from "./networth";
import type { Account, Category, Goal, Transaction } from "../types";

const cats: Category[] = [
  { id: "m", mode: "pessoal", name: "Mercado", kind: "despesa", essential: true },
  { id: "l", mode: "pessoal", name: "Lazer", kind: "despesa", essential: false },
];
let n = 0;
const tx = (date: string, type: Transaction["type"], cents: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, mode: "pessoal", type, description: "x", payment: "pix", amountCents: cents, date, affectsBalance: true, source: "manual", ...extra,
});
const base = (txs: Transaction[], extra: Partial<GoalCtx> = {}): GoalCtx => ({ txs, accounts: [], categories: cats, assets: [], today: "2026-11-02", ...extra });

describe("metas ligadas ao patrimônio", () => {
  const months = ["2026-08", "2026-09", "2026-10"];
  const spending = months.flatMap((m) => [tx(`${m}-05`, "despesa", 300000, { categoryId: "m" }), tx(`${m}-06`, "despesa", 99999, { categoryId: "l" })]);

  it("reserva de 6 meses usa a média de essenciais", () => {
    expect(essentialMonthlyAvg(spending, cats, "2026-11-02")).toBe(300000);
    const g: Goal = { id: "g", mode: "pessoal", name: "Reserva", targetCents: 1, kind: "emergencia", monthsTarget: 6 };
    const reservas = months.map((m) => tx(`${m}-10`, "reserva", 200000, { goalId: "g" }));
    const p = goalPlan(g, base([...spending, ...reservas]));
    expect(p).toMatchObject({ targetCents: 1800000, savedCents: 600000, remainingCents: 1200000, paceCents: 200000, monthsLeft: 6, etaMonth: "2027-05", pct: 33 });
  });

  it("lance de 25% da carta, guardado numa conta de investimento", () => {
    const asset: Asset = { id: "a", kind: "consorcio", name: "Carta imóvel", valueCents: null, vehicleId: null, administrator: null, creditCents: 30000000, termMonths: 200, paidMonths: 50, installmentCents: 180000, contemplated: false, updatedAt: "" };
    const acc: Account = { id: "inv", mode: "pessoal", name: "CDB", type: "investimento", openingBalanceCents: 0, balanceCents: 4500000 };
    const g: Goal = { id: "g2", mode: "pessoal", name: "Lance", targetCents: 1, kind: "lance", assetId: "a", lancePct: 25, accountId: "inv", targetDate: "2027-11-01" };
    const aportes = months.map((m) => tx(`${m}-02`, "receita", 500000, { accountId: "inv" }));
    const p = goalPlan(g, base(aportes, { accounts: [acc], assets: [asset] }));
    expect(p).toMatchObject({ targetCents: 7500000, savedCents: 4500000, remainingCents: 3000000, paceCents: 500000, monthsLeft: 6, monthsToDate: 12, neededPerMonthCents: 250000 });
  });

  it("sem ritmo não inventa prazo", () => {
    const g: Goal = { id: "g3", mode: "pessoal", name: "Viagem", targetCents: 1000000, kind: "geral" };
    expect(goalPlan(g, base([])).monthsLeft).toBeNull();
  });
});
