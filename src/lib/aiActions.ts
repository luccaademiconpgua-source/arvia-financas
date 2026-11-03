// Liga o que a IA entendeu ("Mercado", "Nubank", "cartão C6") aos cadastros reais do app.
import type { Account, Card, Category } from "../types";

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function best<T>(list: readonly T[], name: string | null, label: (x: T) => string): T | undefined {
  if (!name) return undefined;
  const n = norm(name);
  if (!n) return undefined;
  return list.find((x) => norm(label(x)) === n) ?? list.find((x) => norm(label(x)).includes(n) || n.includes(norm(label(x))));
}

export type TxDraftFromAi = {
  type: "despesa" | "receita";
  amountCents: number;
  description: string;
  date: string;
  payment: "pix" | "dinheiro" | "debito" | "credito";
  categoryId?: string;
  accountId?: string;
  cardId?: string;
  installments: number | null;
  problems: string[]; // o que precisa a pessoa escolher antes de salvar
};

export function resolveTx(
  a: { type: "despesa" | "receita"; amount_cents: number; description: string; category: string | null; payment: string; account: string | null; card: string | null; installments: number | null; date: string },
  d: { categories: readonly Category[]; accounts: readonly Account[]; cards: readonly Card[] },
): TxDraftFromAi {
  const problems: string[] = [];
  const cats = d.categories.filter((c) => c.kind === a.type);
  const cat = best(cats, a.category, (c) => c.name) ?? best(cats, a.description, (c) => c.name) ?? cats.find((c) => norm(c.name).startsWith("outr"));
  const wantsCard = a.payment === "credito" || !!a.card;
  let card: Card | undefined;
  let account: Account | undefined;
  if (wantsCard && a.type === "despesa") {
    card = best(d.cards, a.card, (c) => c.label) ?? (d.cards.length === 1 ? d.cards[0] : undefined);
    if (!card) problems.push(d.cards.length ? "Escolha o cartão." : "Não há cartão cadastrado neste escopo.");
  } else {
    account =
      best(d.accounts, a.account, (x) => x.name) ??
      (a.payment === "dinheiro" ? d.accounts.find((x) => x.type === "dinheiro") : undefined) ??
      (d.accounts.length === 1 ? d.accounts[0] : d.accounts.find((x) => x.type !== "dinheiro" && x.type !== "investimento"));
    if (!account) problems.push("Escolha a conta.");
  }
  return {
    type: a.type,
    amountCents: a.amount_cents,
    description: a.description.length >= 2 ? a.description : (cat?.name ?? "Lançamento"),
    date: a.date,
    payment: card ? "credito" : a.payment === "credito" ? "pix" : (a.payment as TxDraftFromAi["payment"]),
    ...(cat ? { categoryId: cat.id } : {}),
    ...(account ? { accountId: account.id } : {}),
    ...(card ? { cardId: card.id } : {}),
    installments: card && a.installments && a.installments >= 2 ? a.installments : null,
    problems,
  };
}
