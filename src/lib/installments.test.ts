import { describe, expect, it } from "vitest";
import { committedByMonth, installmentPurchases, splitInstallments } from "./installments";
import type { Transaction } from "../types";

const parc = (no: number, date: string, cents: number, group = "g1"): Transaction => ({
  id: `${group}-${no}`, mode: "pessoal", type: "despesa", description: "Geladeira", payment: "credito", amountCents: cents,
  date, affectsBalance: false, source: "manual", cardId: "c1", installment: { group, no, total: 3 },
});

describe("parcelas do cartão", () => {
  it("divide e joga a sobra na primeira", () => {
    expect(splitInstallments(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(splitInstallments(1000, 4).reduce((a, b) => a + b)).toBe(1000);
  });
  it("mostra o que já passou e o que falta", () => {
    const txs = [parc(1, "2026-10-20", 33334), parc(2, "2026-11-20", 33333), parc(3, "2026-12-20", 33333)];
    const [p] = installmentPurchases(txs, "2026-11-02");
    expect(p).toMatchObject({ paidCount: 1, remainingCents: 66666, totalCents: 100000, next: { no: 2, date: "2026-11-20" } });
  });
  it("soma o comprometido por mês", () => {
    const txs = [parc(1, "2026-10-20", 33334), parc(2, "2026-11-20", 33333), parc(3, "2026-12-20", 33333), parc(2, "2026-12-05", 5000, "g2")];
    const c = committedByMonth(txs, "2026-11-02", 3);
    expect(c).toEqual([{ month: "2026-11", cents: 33333 }, { month: "2026-12", cents: 38333 }, { month: "2027-01", cents: 0 }]);
  });
});
