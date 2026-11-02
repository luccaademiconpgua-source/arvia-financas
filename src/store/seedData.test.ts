import { describe, expect, it } from "vitest";
import { filterByMode, totalBalanceCents, goalSavedCents } from "../lib/calc";
import { buildSeed } from "./seedData";
import type { Mode, Transaction } from "../types";

const seed = buildSeed();

function somaMes(txs: Transaction[], type: Transaction["type"], ym: string): number {
  return txs.filter((t) => t.type === type && t.date.startsWith(ym)).reduce((s, t) => s + t.amountCents, 0);
}
const doModo = (mode: Mode) => ({
  accounts: filterByMode(seed.accounts, mode),
  transactions: filterByMode(seed.transactions, mode),
  cards: filterByMode(seed.cards, mode),
  goals: filterByMode(seed.goals, mode),
  categories: filterByMode(seed.categories, mode),
});

describe("seed pessoal", () => {
  const p = doModo("pessoal");
  it("saldo inicial exibido é R$ 14.929,66", () => {
    expect(totalBalanceCents(p.accounts, p.transactions)).toBe(1492966);
  });
  it("todo o histórico do seed tem affectsBalance falso", () => {
    expect(seed.transactions.every((t) => !t.affectsBalance)).toBe(true);
  });
  it("outubro: receitas R$ 8.250,00 e despesas R$ 6.856,33, sobrou R$ 1.393,67", () => {
    const r = somaMes(p.transactions, "receita", "2026-10");
    const d = somaMes(p.transactions, "despesa", "2026-10");
    expect(r).toBe(825000);
    expect(d).toBe(685633);
    expect(r - d).toBe(139367);
  });
  it("parcelas são a maior categoria de outubro, perto de 33%", () => {
    const cat = p.categories.find((c) => c.name === "Parcelas");
    const out = p.transactions.filter((t) => t.type === "despesa" && t.date.startsWith("2026-10"));
    const porCat = new Map<string, number>();
    for (const t of out) porCat.set(t.categoryId ?? "", (porCat.get(t.categoryId ?? "") ?? 0) + t.amountCents);
    const maior = [...porCat.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(maior?.[0]).toBe(cat?.id);
    expect(maior?.[1]).toBe(228000);
    expect((228000 / 685633) * 100).toBeGreaterThan(33);
    expect((228000 / 685633) * 100).toBeLessThan(33.5);
  });
  it("fluxo de caixa de maio a setembro bate com o contrato", () => {
    const esperado: Array<[string, number, number]> = [
      ["2026-05", 720000, 610000],
      ["2026-06", 750000, 640000],
      ["2026-07", 700000, 690000],
      ["2026-08", 810000, 600000],
      ["2026-09", 900000, 580000],
    ];
    for (const [ym, rec, desp] of esperado) {
      expect(somaMes(p.transactions, "receita", ym)).toBe(rec);
      expect(somaMes(p.transactions, "despesa", ym)).toBe(desp);
    }
  });
  it("reserva de emergência soma R$ 800 e a meta é R$ 50.000", () => {
    const meta = p.goals.find((g) => g.kind === "emergencia");
    expect(meta?.targetCents).toBe(5000000);
    expect(meta ? goalSavedCents(meta, p.transactions) : -1).toBe(80000);
  });
  it("meta principal é R$ 1.000.000 e nunca 950.000.000", () => {
    const meta = p.goals.find((g) => g.kind === "geral");
    expect(meta?.targetCents).toBe(100000000);
  });
  it("cartão Inter tem as três faturas do contrato", () => {
    const inter = p.cards[0];
    expect(inter?.limitCents).toBe(300000);
    expect(inter?.invoices.map((i) => [i.month, i.status, i.amountCents])).toEqual([
      ["2026-09", "paga", 31464],
      ["2026-10", "vencida", 37163],
      ["2026-11", "aberta", 11663],
    ]);
  });
});

describe("seed empresa", () => {
  const e = doModo("casa");
  it("saldo é o da conta empresa", () => {
    expect(totalBalanceCents(e.accounts, e.transactions)).toBe(2240000);
  });
  it("outubro: receita R$ 12.000 e despesas R$ 7.400", () => {
    expect(somaMes(e.transactions, "receita", "2026-10")).toBe(1200000);
    expect(somaMes(e.transactions, "despesa", "2026-10")).toBe(740000);
  });
  it("reserva da empresa tem R$ 4.000 de R$ 30.000", () => {
    const meta = e.goals[0];
    expect(meta?.targetCents).toBe(3000000);
    expect(meta ? goalSavedCents(meta, e.transactions) : -1).toBe(400000);
  });
  it("nenhuma transação pessoal vaza para a empresa", () => {
    const ids = {
      contas: new Set(e.accounts.map((a) => a.id)),
      cats: new Set(e.categories.map((c) => c.id)),
      metas: new Set(e.goals.map((g) => g.id)),
    };
    for (const t of e.transactions) {
      expect(t.mode).toBe("casa");
      if (t.accountId) expect(ids.contas.has(t.accountId)).toBe(true);
      if (t.categoryId) expect(ids.cats.has(t.categoryId)).toBe(true);
      if (t.goalId) expect(ids.metas.has(t.goalId)).toBe(true);
      expect(t.cardId).toBeUndefined();
    }
  });
  it("o saldo pessoal não depende do empresa", () => {
    const p = doModo("pessoal");
    expect(totalBalanceCents(p.accounts, seed.transactions)).toBe(totalBalanceCents(p.accounts, p.transactions));
  });
});
