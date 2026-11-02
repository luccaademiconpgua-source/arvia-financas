import type { Account, Card, Transaction } from "../types";
import { accountBalanceCents } from "./calc";

export type CardAvailability = { card: Card; usedCents: number; limitCents: number | null; availableCents: number | null };

export type WalletSummary = {
  cashCents: number; // dinheiro em espécie
  accountsCents: number; // contas correntes e digitais
  investedCents: number;
  creditAvailableCents: number; // soma do limite livre dos cartões com limite informado
  availableNowCents: number; // espécie + contas
  withCreditCents: number; // disponível + limite livre
  cards: CardAvailability[];
};

/** Limite livre = limite − faturas ainda não pagas (abertas ou vencidas). */
export function cardAvailability(card: Card): CardAvailability {
  const used = card.invoices.filter((i) => i.status !== "paga").reduce((s, i) => s + i.amountCents, 0);
  return { card, usedCents: used, limitCents: card.limitCents, availableCents: card.limitCents === null ? null : Math.max(0, card.limitCents - used) };
}

export function walletSummary(accounts: readonly Account[], cards: readonly Card[], txs: readonly Transaction[]): WalletSummary {
  let cash = 0;
  let acc = 0;
  let inv = 0;
  for (const a of accounts) {
    const b = accountBalanceCents(a, txs);
    if (a.type === "dinheiro") cash += b;
    else if (a.type === "investimento") inv += b;
    else acc += b;
  }
  const cs = cards.map(cardAvailability);
  const credit = cs.reduce((s, c) => s + (c.availableCents ?? 0), 0);
  return {
    cashCents: cash,
    accountsCents: acc,
    investedCents: inv,
    creditAvailableCents: credit,
    availableNowCents: cash + acc,
    withCreditCents: cash + acc + credit,
    cards: cs,
  };
}
