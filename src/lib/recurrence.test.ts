import { describe, expect, it } from "vitest";
import { dueDate, occurrences, projection, type Recurrence } from "./recurrence";
import type { Card, Transaction } from "../types";

const rec = (o: Partial<Recurrence>): Recurrence => ({
  id: "r", scope: "pessoal", type: "despesa", description: "Aluguel", amountCents: 180000, variable: false, dayOfMonth: 10,
  categoryId: null, accountId: "c6", cardId: null, payment: "pix", startMonth: "2026-09", endMonth: null, active: true, ...o,
});
const tx = (o: Partial<Transaction>): Transaction => ({
  id: "t", mode: "pessoal", type: "despesa", description: "x", payment: "pix", amountCents: 100, date: "2026-11-01", affectsBalance: false, source: "open_finance", ...o,
});

describe("contas fixas", () => {
  it("vencimento no último dia quando o mês é curto", () => {
    expect(dueDate("2026-02", 31)).toBe("2026-02-28");
    expect(dueDate("2026-11", 5)).toBe("2026-11-05");
  });
  it("situação de cada conta no mês", () => {
    const recs = [
      rec({ id: "a", description: "Aluguel", dayOfMonth: 9 }),
      rec({ id: "b", description: "Internet", dayOfMonth: 1, amountCents: 10000 }),
      rec({ id: "c", description: "Luz", dayOfMonth: 2, amountCents: 20000 }),
      rec({ id: "d", description: "Academia", dayOfMonth: 25, amountCents: 9000 }),
      rec({ id: "e", description: "Antiga", endMonth: "2026-10" }),
      rec({ id: "f", description: "Futura", startMonth: "2026-12" }),
    ];
    const txs = [tx({ id: "p", recurrenceId: "b", recurrenceMonth: "2026-11" })];
    const o = occurrences(recs, txs, "2026-11", "2026-11-02");
    expect(o.map((x) => [x.rec.description, x.state])).toEqual([
      ["Internet", "paga"],
      ["Luz", "hoje"],
      ["Aluguel", "proxima"],
      ["Academia", "futura"],
    ]);
    expect(o[0]!.tx?.id).toBe("p");
    expect(occurrences([rec({})], [], "2026-11", "2026-11-12")[0]!.state).toBe("atrasada");
  });
  it("saldo previsto no fim do mês", () => {
    const recs = [
      rec({ id: "a", amountCents: 180000 }),
      rec({ id: "s", type: "receita", description: "Salário", amountCents: 650000, dayOfMonth: 5 }),
      rec({ id: "n", description: "Netflix", amountCents: 5590, cardId: "k", accountId: null }),
      rec({ id: "i", description: "Internet", amountCents: 10000, dayOfMonth: 1 }),
    ];
    const txs = [tx({ recurrenceId: "i", recurrenceMonth: "2026-11" })];
    const cards = [{ id: "k", mode: "pessoal", brand: "visa", label: "C", last4: "1234", limitCents: null, dueDay: 10, invoices: [
      { id: "1", month: "2026-11", status: "aberta", amountCents: 42010 },
      { id: "2", month: "2026-12", status: "aberta", amountCents: 9999 },
    ] }] as Card[];
    const p = projection(100000, occurrences(recs, txs, "2026-11", "2026-11-02"), cards, "2026-11");
    expect(p).toEqual({ balanceCents: 100000, toReceiveCents: 650000, toPayCents: 180000, invoicesCents: 42010, projectedCents: 527990 });
  });
});
