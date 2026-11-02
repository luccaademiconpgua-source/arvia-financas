import { describe, expect, it } from "vitest";
import { walletSummary } from "./wallet";
import type { Account, Card } from "../types";

const acc = (id: string, type: Account["type"], balanceCents: number): Account => ({ id, mode: "pessoal", name: id, type, openingBalanceCents: 0, balanceCents });
const card = (limitCents: number | null, invoices: Card["invoices"]): Card => ({ id: "k" + limitCents, mode: "pessoal", brand: "visa", label: "C", last4: "1234", limitCents, dueDay: 10, invoices });

describe("carteira", () => {
  it("soma espécie, contas, investimentos e limite livre", () => {
    const s = walletSummary(
      [acc("cart", "dinheiro", 15000), acc("c6", "corrente", 120000), acc("nu", "digital", -2000), acc("cdb", "investimento", 500000)],
      [
        card(500000, [{ id: "1", month: "2026-11", status: "aberta", amountCents: 42010 }, { id: "2", month: "2026-10", status: "paga", amountCents: 90000 }, { id: "3", month: "2026-09", status: "vencida", amountCents: 10000 }]),
        card(null, [{ id: "4", month: "2026-11", status: "aberta", amountCents: 5000 }]),
        card(100000, [{ id: "5", month: "2026-11", status: "aberta", amountCents: 150000 }]),
      ],
      [],
    );
    expect(s.cashCents).toBe(15000);
    expect(s.accountsCents).toBe(118000);
    expect(s.investedCents).toBe(500000);
    expect(s.cards.map((c) => c.availableCents)).toEqual([447990, null, 0]);
    expect(s.creditAvailableCents).toBe(447990);
    expect(s.availableNowCents).toBe(133000);
    expect(s.withCreditCents).toBe(580990);
  });
});
