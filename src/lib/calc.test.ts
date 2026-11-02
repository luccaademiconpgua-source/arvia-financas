import { describe, expect, it } from "vitest";
import type { Account, Goal, Transaction } from "../types";
import { accountBalanceCents, filterByMode, goalProgress, goalSavedCents, totalBalanceCents } from "./calc";

const conta: Account = { id: "a1", mode: "pessoal", name: "Conta", type: "corrente", openingBalanceCents: 100000 };

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: crypto.randomUUID(),
    mode: "pessoal",
    type: "despesa",
    description: "teste",
    accountId: "a1",
    payment: "pix",
    amountCents: 1000,
    date: "2026-10-10",
    affectsBalance: true,
    source: "manual",
    ...partial,
  };
}

describe("saldo da conta", () => {
  it("ignora transações com affectsBalance falso", () => {
    expect(accountBalanceCents(conta, [tx({ affectsBalance: false, amountCents: 5000 })])).toBe(100000);
  });
  it("despesa em conta diminui o saldo", () => {
    expect(accountBalanceCents(conta, [tx({ amountCents: 5000 })])).toBe(95000);
  });
  it("despesa no cartão não mexe no saldo", () => {
    expect(accountBalanceCents(conta, [tx({ cardId: "c1", accountId: undefined, affectsBalance: false })])).toBe(100000);
  });
  it("receita soma e reserva subtrai", () => {
    const txs = [tx({ type: "receita", amountCents: 20000 }), tx({ type: "reserva", amountCents: 3000 })];
    expect(accountBalanceCents(conta, txs)).toBe(117000);
  });
  it("ajuste usa signedCents, positivo ou negativo", () => {
    expect(accountBalanceCents(conta, [tx({ type: "ajuste", signedCents: -1500, amountCents: 1500 })])).toBe(98500);
    expect(accountBalanceCents(conta, [tx({ type: "ajuste", signedCents: 2500, amountCents: 2500 })])).toBe(102500);
  });
  it("não conta transação de outra conta", () => {
    expect(accountBalanceCents(conta, [tx({ accountId: "outra" })])).toBe(100000);
  });
  it("saldo total soma as contas", () => {
    const b: Account = { ...conta, id: "a2", openingBalanceCents: 50000 };
    expect(totalBalanceCents([conta, b], [tx({ accountId: "a2", amountCents: 1000 })])).toBe(149000);
  });
});

describe("filtro por mode", () => {
  it("não mistura pessoal e empresa", () => {
    const itens = [
      { id: "1", mode: "pessoal" as const },
      { id: "2", mode: "casa" as const },
      { id: "3", mode: "pessoal" as const },
    ];
    expect(filterByMode(itens, "pessoal").map((i) => i.id)).toEqual(["1", "3"]);
    expect(filterByMode(itens, "casa").map((i) => i.id)).toEqual(["2"]);
  });
});

describe("meta", () => {
  const meta: Goal = { id: "g1", mode: "pessoal", name: "Reserva", targetCents: 10000, kind: "emergencia" };
  it("soma só reservas da meta", () => {
    const txs = [tx({ type: "reserva", goalId: "g1", amountCents: 2500 }), tx({ type: "reserva", goalId: "g2", amountCents: 900 }), tx({ type: "despesa", goalId: "g1" })];
    expect(goalSavedCents(meta, txs)).toBe(2500);
  });
  it("limita a barra em 100%", () => {
    expect(goalProgress(meta, [tx({ type: "reserva", goalId: "g1", amountCents: 99999 })])).toBe(1);
  });
});

import { summarize as summarizeT, expenseByCategory as ebc } from "./calc";
describe("transferências entre contas próprias", () => {
  it("não entram em receitas, despesas nem categorias", () => {
    const base = { mode: "pessoal" as const, payment: "pix" as const, affectsBalance: false, source: "open_finance" as const };
    const txs = [
      { ...base, id: "a", type: "despesa" as const, description: "LUCCA", amountCents: 10000, date: "2026-11-01", isTransfer: true },
      { ...base, id: "b", type: "receita" as const, description: "LUCCA", amountCents: 20000, date: "2026-11-01", isTransfer: true },
      { ...base, id: "c", type: "despesa" as const, description: "Mercado", amountCents: 3000, date: "2026-11-01" },
    ];
    const s = summarizeT(txs, "mes", "2026-11-02");
    expect(s.receitasCents).toBe(0);
    expect(s.despesasCents).toBe(3000);
    expect(ebc(txs, "2026-11", []).map((x) => x.cents)).toEqual([3000]);
  });
});
