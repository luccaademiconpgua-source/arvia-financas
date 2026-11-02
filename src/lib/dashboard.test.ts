import { describe, expect, it } from "vitest";
import { cumulativeSpend, daysInMonth, pace, paceDelta, topExpenses } from "./dashboard";
import type { Category, Transaction } from "../types";

const tx = (date: string, amountCents: number, type: Transaction["type"] = "despesa", categoryId?: string): Transaction => ({
  id: date + amountCents, mode: "pessoal", type, description: "x", payment: "pix", amountCents, date, affectsBalance: true, source: "manual",
  ...(categoryId ? { categoryId } : {}),
});

describe("ritmo de gastos", () => {
  const txs = [tx("2026-10-02", 1000), tx("2026-10-02", 500), tx("2026-10-20", 3000), tx("2026-11-01", 2000), tx("2026-11-01", 9999, "receita")];
  it("acumula por dia", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    const c = cumulativeSpend(txs, "2026-10");
    expect(c).toHaveLength(31);
    expect(c[0]).toBe(0);
    expect(c[1]).toBe(1500);
    expect(c[30]).toBe(4500);
  });
  it("corta o mês atual no dia de hoje e compara com o mês anterior", () => {
    const p = pace(txs, "2026-11", "2026-10", "2026-11-02");
    expect(p).toHaveLength(31);
    expect(p[1]).toEqual({ day: 2, atual: 2000, anterior: 1500 });
    expect(p[2]!.atual).toBeNull();
    expect(p[30]).toEqual({ day: 31, atual: null, anterior: 4500 });
    expect(paceDelta(p)).toEqual({ day: 2, atual: 2000, anterior: 1500, delta: 500 });
  });
});

describe("maiores despesas da categoria", () => {
  const cats: Category[] = [{ id: "m", mode: "pessoal", name: "Mercado", kind: "despesa", essential: true }];
  it("filtra por nome e ordena", () => {
    const txs = [tx("2026-11-01", 100, "despesa", "m"), tx("2026-11-02", 900, "despesa", "m"), tx("2026-11-03", 500), tx("2026-10-03", 5000, "despesa", "m")];
    expect(topExpenses(txs, "2026-11", "Mercado", cats).map((t) => t.amountCents)).toEqual([900, 100]);
    expect(topExpenses(txs, "2026-11", "Outras", cats).map((t) => t.amountCents)).toEqual([500]);
  });
});
