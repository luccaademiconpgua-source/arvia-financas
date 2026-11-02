import { describe, expect, it } from "vitest";
import { consorcio, netWorth, type Asset } from "./networth";
import type { Account, Card, Debt } from "../types";

const asset = (p: Partial<Asset>): Asset => ({ id: "x", kind: "outro", name: "x", valueCents: null, vehicleId: null, administrator: null, creditCents: null, termMonths: null, paidMonths: null, installmentCents: null, contemplated: false, updatedAt: "", ...p });

describe("patrimônio", () => {
  it("carta de consórcio", () => {
    expect(consorcio({ creditCents: 30000000, termMonths: 200, paidMonths: 50, installmentCents: 180000, contemplated: false })).toEqual({
      paidCents: 9000000, remainingCents: 27000000, monthsLeft: 150, progressPct: 25, creditCents: 30000000,
    });
  });
  it("soma bens e desconta dívidas", () => {
    const accounts: Account[] = [
      { id: "a", mode: "pessoal", name: "C6", type: "corrente", openingBalanceCents: 0 },
      { id: "b", mode: "pessoal", name: "CDB", type: "investimento", openingBalanceCents: 0 },
    ];
    const bal: Record<string, number> = { a: 500000, b: 2000000 };
    const cards: Card[] = [{ id: "c", mode: "pessoal", brand: "visa", label: "C6", last4: "1234", limitCents: null, dueDay: 10, invoices: [
      { id: "i1", month: "2026-11", status: "aberta", amountCents: 150000 }, { id: "i2", month: "2026-10", status: "paga", amountCents: 99999 },
    ] }];
    const debts: Debt[] = [{ id: "d", mode: "pessoal", name: "Empréstimo", installmentCount: 10, paidInstallments: 4, installmentCents: 50000, nextDue: "2026-11-10" }];
    const assets = [
      asset({ kind: "imovel", name: "Casa", valueCents: 45000000 }),
      asset({ kind: "consorcio", name: "Carta imóvel", creditCents: 30000000, termMonths: 200, paidMonths: 50, installmentCents: 180000 }),
      asset({ kind: "consorcio", name: "Carta carro", creditCents: 10000000, termMonths: 80, paidMonths: 20, installmentCents: 150000, contemplated: true }),
    ];
    const n = netWorth({ accounts, balanceOf: (a) => bal[a.id]!, cards, debts, assets });
    expect(n.assetsCents).toBe(500000 + 2000000 + 45000000 + 9000000);
    expect(n.liabilitiesCents).toBe(150000 + 300000 + 9000000);
    expect(n.netCents).toBe(n.assetsCents - n.liabilitiesCents);
    expect(n.assets.map((g) => g.key)).toEqual(["contas", "investimentos", "imoveis", "consorcios"]);
  });
});
