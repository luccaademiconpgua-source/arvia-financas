import { describe, expect, it } from "vitest";
import { resolveTx } from "./aiActions";
import type { Account, Card, Category } from "../types";

const categories: Category[] = [
  { id: "m", mode: "pessoal", name: "Mercado", kind: "despesa", essential: true },
  { id: "o", mode: "pessoal", name: "Outras", kind: "despesa", essential: false },
  { id: "s", mode: "pessoal", name: "Salário", kind: "receita", essential: false },
];
const accounts: Account[] = [
  { id: "nu", mode: "pessoal", name: "Nubank", type: "digital", openingBalanceCents: 0 },
  { id: "c6", mode: "pessoal", name: "C6 BANK", type: "corrente", openingBalanceCents: 0 },
  { id: "din", mode: "pessoal", name: "Carteira", type: "dinheiro", openingBalanceCents: 0 },
];
const cards: Card[] = [{ id: "cc", mode: "pessoal", brand: "master", label: "C6 Carbon", last4: "1234", limitCents: null, dueDay: 10, invoices: [] }];
const d = { categories, accounts, cards };
const base = { type: "despesa" as const, amount_cents: 4500, description: "Mercado", category: "Mercado", payment: "pix", account: null, card: null, installments: null, date: "2026-11-02" };

describe("ação da IA para lançamento", () => {
  it("acha categoria e conta pelo nome, sem acento nem caixa", () => {
    const r = resolveTx({ ...base, account: "c6" }, d);
    expect(r).toMatchObject({ categoryId: "m", accountId: "c6", payment: "pix", problems: [] });
  });
  it("dinheiro vai para a carteira", () => {
    expect(resolveTx({ ...base, payment: "dinheiro" }, d).accountId).toBe("din");
  });
  it("crédito parcelado vai para o cartão", () => {
    const r = resolveTx({ ...base, payment: "credito", installments: 3 }, d);
    expect(r).toMatchObject({ cardId: "cc", payment: "credito", installments: 3 });
    expect(r.accountId).toBeUndefined();
  });
  it("categoria desconhecida cai em Outras", () => {
    expect(resolveTx({ ...base, category: "Pet shop", description: "Ração" }, d).categoryId).toBe("o");
  });
});
