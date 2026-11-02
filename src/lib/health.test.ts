import { describe, expect, it } from "vitest";
import { healthScore } from "./calc";
import { makeTxSchema } from "./txSchema";
import { buildSeed } from "../store/seedData";
import { cashflow, expenseByCategory, summarize, variationPct, worstInvoiceStatus } from "./calc";

const base = { receitasCents: 825000, sobrouCents: 139367, hasOverdueInvoice: true, emergencySavedCents: 80000, emergencyTargetCents: 5000000, parcelasCents: 228000, cardUsage: 0.16 };

describe("healthScore", () => {
  it("o seed fica na faixa Atenção, entre 50 e 74", () => {
    const h = healthScore(base);
    expect(h.score).toBeGreaterThanOrEqual(50);
    expect(h.score).toBeLessThanOrEqual(74);
    expect(h.status).toBe("Atenção");
  });
  it("fatura vencida perde 15 dos 30 pontos", () => {
    const a = healthScore({ ...base, hasOverdueInvoice: false }).score;
    const b = healthScore(base).score;
    expect(a - b).toBe(15);
  });
  it("sem sobra e sem reserva fica Crítico", () => {
    const h = healthScore({ ...base, sobrouCents: -1, emergencySavedCents: 0, parcelasCents: 400000 });
    expect(h.status).toBe("Crítico");
  });
  it("tudo em ordem fica Bom", () => {
    const h = healthScore({ ...base, hasOverdueInvoice: false, emergencySavedCents: 5000000, parcelasCents: 100000 });
    expect(h.score).toBe(100);
    expect(h.status).toBe("Bom");
  });
});

describe("txSchema", () => {
  const ok = { type: "despesa", amountCents: 1000, description: "Café", date: "2026-10-24", payment: "pix", accountId: "a1" };
  const schema = makeTxSchema("2026-10-24");
  it("aceita um lançamento válido", () => expect(schema.safeParse(ok).success).toBe(true));
  it("rejeita valor zero", () => expect(schema.safeParse({ ...ok, amountCents: 0 }).success).toBe(false));
  it("rejeita descrição curta", () => expect(schema.safeParse({ ...ok, description: "a" }).success).toBe(false));
  it("aceita amanhã e rejeita depois", () => {
    expect(schema.safeParse({ ...ok, date: "2026-10-25" }).success).toBe(true);
    expect(schema.safeParse({ ...ok, date: "2026-10-26" }).success).toBe(false);
  });
  it("reserva exige meta e conta", () => {
    expect(schema.safeParse({ ...ok, type: "reserva" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, type: "reserva", goalId: "g1" }).success).toBe(true);
  });
  it("crédito exige cartão", () => {
    expect(schema.safeParse({ ...ok, payment: "credito", accountId: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...ok, payment: "credito", accountId: undefined, cardId: "c1" }).success).toBe(true);
  });
});

describe("home do seed", () => {
  const seed = buildSeed();
  const txs = seed.transactions.filter((t) => t.mode === "pessoal");
  it("outubro: receitas 8.250, despesas 6.856,33, sobrou 1.393,67", () => {
    const s = summarize(txs, "mes", "2026-10-24");
    expect(s.receitasCents).toBe(825000);
    expect(s.despesasCents).toBe(685633);
    expect(s.sobrouCents).toBe(139367);
    expect(Math.round((s.sobrouPct ?? 0) * 100)).toBe(17);
  });
  it("fluxo tem 6 meses e donut soma 100%", () => {
    expect(cashflow(txs, "2026-10-24", 6)).toHaveLength(6);
    const cats = seed.categories.filter((c) => c.mode === "pessoal");
    const slices = expenseByCategory(txs, "2026-10", cats);
    expect(slices[0]?.name).toBe("Parcelas");
    expect(slices.reduce((s, x) => s + x.cents, 0)).toBe(685633);
  });
  it("variação: receita sobe é número positivo, sem mês anterior é null", () => {
    expect(variationPct(110, 100)).toBeCloseTo(10);
    expect(variationPct(5, 0)).toBeNull();
  });
  it("pior fatura do cartão é vencida", () => {
    const c = seed.cards.find((x) => x.mode === "pessoal");
    expect(c && worstInvoiceStatus(c)).toBe("vencida");
  });
});
