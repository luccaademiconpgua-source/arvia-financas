// Patrimônio líquido: o que vocês têm menos o que devem.
import type { Account, Card, Debt } from "../types";

export type AssetKind = "imovel" | "veiculo" | "investimento" | "consorcio" | "outro";
export type Asset = {
  id: string;
  kind: AssetKind;
  name: string;
  valueCents: number | null;
  vehicleId: string | null;
  administrator: string | null;
  creditCents: number | null;
  termMonths: number | null;
  paidMonths: number | null;
  installmentCents: number | null;
  contemplated: boolean;
  updatedAt: string;
};

export type Line = { name: string; cents: number; detail?: string };
export type Group = { key: string; label: string; cents: number; lines: Line[] };
export type NetWorth = { assets: Group[]; liabilities: Group[]; assetsCents: number; liabilitiesCents: number; netCents: number };

export const KIND_LABEL: Record<AssetKind, string> = { imovel: "Imóvel", veiculo: "Veículo", investimento: "Investimento", consorcio: "Carta de consórcio", outro: "Outro bem" };

/** Carta de consórcio: quanto já foi pago, quanto falta e o andamento. */
export function consorcio(a: Pick<Asset, "creditCents" | "termMonths" | "paidMonths" | "installmentCents" | "contemplated">) {
  const term = a.termMonths ?? 0;
  const paid = Math.min(a.paidMonths ?? 0, term);
  const inst = a.installmentCents ?? 0;
  return {
    paidCents: paid * inst,
    remainingCents: (term - paid) * inst,
    monthsLeft: term - paid,
    progressPct: term > 0 ? Math.round((paid / term) * 100) : 0,
    creditCents: a.creditCents ?? 0,
  };
}

const group = (key: string, label: string, lines: Line[]): Group => ({ key, label, lines, cents: lines.reduce((s, l) => s + l.cents, 0) });
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Bens: contas, investimentos, imóveis, veículos, outros e o que já foi pago nas cartas ainda não contempladas
 * (fica no grupo e volta para você). Carta contemplada: o bem comprado entra como imóvel ou veículo e as parcelas
 * que faltam viram dívida.
 */
export function netWorth(input: { accounts: readonly Account[]; balanceOf: (a: Account) => number; cards: readonly Card[]; debts: readonly Debt[]; assets: readonly Asset[] }): NetWorth {
  const { accounts, balanceOf, cards, debts, assets } = input;
  const cash = accounts.filter((a) => a.type !== "investimento").map((a) => ({ name: a.name, cents: balanceOf(a) }));
  const invest = [
    ...accounts.filter((a) => a.type === "investimento").map((a) => ({ name: a.name, cents: balanceOf(a) })),
    ...assets.filter((a) => a.kind === "investimento").map((a) => ({ name: a.name, cents: a.valueCents ?? 0 })),
  ];
  const of = (k: AssetKind) => assets.filter((a) => a.kind === k).map((a) => ({ name: a.name, cents: a.valueCents ?? 0 }));
  const cons = assets.filter((a) => a.kind === "consorcio");
  const consAssets = cons
    .filter((a) => !a.contemplated)
    .map((a) => {
      const c = consorcio(a);
      return { name: a.name, cents: c.paidCents, detail: `${c.progressPct}% pago de uma carta de ${brl(c.creditCents)}` };
    });

  const assetGroups = [
    group("contas", "Contas e dinheiro", cash),
    group("investimentos", "Investimentos", invest),
    group("imoveis", "Imóveis", of("imovel")),
    group("veiculos", "Veículos", of("veiculo")),
    group("consorcios", "Consórcios a contemplar", consAssets),
    group("outros", "Outros bens", of("outro")),
  ].filter((g) => g.lines.length > 0);

  const cardLines = cards
    .map((c) => ({ name: `${c.label} final ${c.last4}`, cents: c.invoices.filter((i) => i.status !== "paga").reduce((s, i) => s + i.amountCents, 0) }))
    .filter((l) => l.cents > 0);
  const debtLines = debts
    .map((d) => ({ name: d.name, cents: (d.installmentCount - d.paidInstallments) * d.installmentCents, detail: `${d.installmentCount - d.paidInstallments} parcelas` }))
    .filter((l) => l.cents > 0);
  const consDebt = cons
    .filter((a) => a.contemplated)
    .map((a) => {
      const c = consorcio(a);
      return { name: a.name, cents: c.remainingCents, detail: `${c.monthsLeft} parcelas de ${brl(a.installmentCents ?? 0)}` };
    })
    .filter((l) => l.cents > 0);

  const liabGroups = [group("cartoes", "Faturas em aberto", cardLines), group("dividas", "Dívidas", debtLines), group("consorcios", "Consórcios contemplados", consDebt)].filter(
    (g) => g.lines.length > 0,
  );
  const assetsCents = assetGroups.reduce((s, g) => s + g.cents, 0);
  const liabilitiesCents = liabGroups.reduce((s, g) => s + g.cents, 0);
  return { assets: assetGroups, liabilities: liabGroups, assetsCents, liabilitiesCents, netCents: assetsCents - liabilitiesCents };
}
