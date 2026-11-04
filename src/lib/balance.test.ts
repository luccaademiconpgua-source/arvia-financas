import { describe, expect, it } from "vitest";
import { balanceHistory } from "./calc";
import type { Transaction } from "../types";

const tx = (date: string, type: "receita" | "despesa", amountCents: number, extra: Partial<Transaction> = {}) =>
  ({ id: date + amountCents, date, type, amountCents, description: "x", payment: "pix", isTransfer: false, ...extra }) as Transaction;

describe("balanceHistory", () => {
  it("volta o saldo mês a mês a partir de hoje", () => {
    const txs = [tx("2026-11-02", "receita", 1000), tx("2026-10-10", "despesa", 300), tx("2026-11-03", "despesa", 200, { cardId: "c" })];
    const h = balanceHistory(txs, 5000, "2026-11-03", 3);
    expect(h).toEqual([
      { ym: "2026-09", cents: 4300 },
      { ym: "2026-10", cents: 4000 },
      { ym: "2026-11", cents: 5000 },
    ]);
  });
});
