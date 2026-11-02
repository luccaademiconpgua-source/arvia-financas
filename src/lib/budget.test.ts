import { describe, expect, it } from "vitest";
import { budgetLines, monthlyAverage, savingsStatus } from "./budget";
import type { Transaction } from "../types";

const tx = (date: string, amountCents: number, categoryId?: string, type: Transaction["type"] = "despesa", extra: Partial<Transaction> = {}): Transaction => ({
  id: `${date}${amountCents}${categoryId}`, mode: "pessoal", type, description: "x", payment: "pix", amountCents, date, affectsBalance: true, source: "manual",
  ...(categoryId ? { categoryId } : {}), ...extra,
});

describe("orçamento", () => {
  const txs = [
    tx("2026-11-01", 50000, "mercado"),
    tx("2026-11-10", 50000, "mercado"),
    tx("2026-11-05", 90000, "lazer"),
    tx("2026-11-06", 30000, "lazer", "despesa", { isTransfer: true }),
    tx("2026-11-07", 10000, "rest"),
  ];
  const budgets = [
    { id: "1", categoryId: "mercado", limitCents: 120000, savingsPct: null },
    { id: "2", categoryId: "lazer", limitCents: 80000, savingsPct: null },
    { id: "3", categoryId: "rest", limitCents: 50000, savingsPct: null },
    { id: "4", categoryId: null, limitCents: null, savingsPct: 20 },
  ];
  it("calcula gasto, estado, quanto sobra por dia e a projeção", () => {
    const l = budgetLines(budgets, txs, "2026-11", "2026-11-11");
    expect(l.map((x) => [x.categoryId, x.state])).toEqual([["lazer", "estourou"], ["mercado", "alerta"], ["rest", "ok"]]);
    const merc = l.find((x) => x.categoryId === "mercado")!;
    expect(merc.spentCents).toBe(100000);
    expect(merc.remainingCents).toBe(20000);
    expect(merc.perDayCents).toBe(Math.floor(20000 / 20));
    expect(merc.forecastCents).toBe(Math.round((100000 / 11) * 30));
    expect(l.find((x) => x.categoryId === "lazer")!.spentCents).toBe(90000);
  });
  it("mês passado não tem ritmo nem valor por dia", () => {
    const l = budgetLines(budgets, txs, "2026-11", "2026-12-03");
    expect(l[0]!.perDayCents).toBeNull();
    expect(l[0]!.forecastCents).toBeNull();
  });
  it("sugere teto pela média de 3 meses", () => {
    const hist = [tx("2026-08-03", 90000, "mercado"), tx("2026-09-03", 120000, "mercado"), tx("2026-10-03", 105000, "mercado"), tx("2026-11-03", 999999, "mercado")];
    expect(monthlyAverage(hist, "2026-11").get("mercado")).toBe(105000);
  });
  it("meta de guardar", () => {
    const s = savingsStatus(20, [tx("2026-11-01", 500000, undefined, "receita"), tx("2026-11-02", 380000, "x"), tx("2026-11-03", 100000, "y", "receita", { isTransfer: true })], "2026-11");
    expect(s).toEqual({ targetPct: 20, incomeCents: 500000, savedCents: 120000, targetCents: 100000, reached: true });
  });
});
