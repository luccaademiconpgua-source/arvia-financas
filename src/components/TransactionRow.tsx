import { format, parseISO } from "date-fns";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, PiggyBank, SlidersHorizontal } from "lucide-react";
import { formatBrl } from "../lib/money";
import { useUI } from "../store/ui";
import type { Account, Card, Category, Transaction } from "../types";

type Lookups = { categories: Category[]; accounts: Account[]; cards: Card[] };

export function txSubtitle(t: Transaction, l: Lookups): string {
  const cat = l.categories.find((c) => c.id === t.categoryId)?.name;
  const acc = l.accounts.find((a) => a.id === t.accountId)?.name;
  const card = l.cards.find((c) => c.id === t.cardId);
  return [t.isTransfer ? "Transferência" : cat, card ? `Cartão ${card.label}` : acc].filter(Boolean).join(", ");
}

export function TransactionRow({ t, lookups }: { t: Transaction; lookups: Lookups }) {
  const openDetail = useUI((s) => s.openDetail);
  const income = t.type === "receita";
  const sign = t.type === "ajuste" ? ((t.signedCents ?? 0) >= 0 ? "+" : "-") : income ? "+" : "-";
  const positive = sign === "+";
  const Icon = t.isTransfer ? ArrowLeftRight : t.type === "reserva" ? PiggyBank : t.type === "ajuste" ? SlidersHorizontal : income ? ArrowDownLeft : ArrowUpRight;
  const tone = t.isTransfer ? "neutral" : positive ? "in" : "out";
  return (
    <li>
      <button type="button" onClick={() => openDetail(t.id)} className="flex min-h-11 w-full items-center gap-3 py-3 text-left">
        <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone === "neutral" ? "bg-page text-muted" : tone === "in" ? "bg-income-bg text-income" : "bg-expense-bg text-expense"}`}>
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{t.description}</span>
          <span className="block truncate text-xs text-muted">{txSubtitle(t, lookups)}</span>
        </span>
        <span className="text-right">
          <span className={`num block text-sm font-semibold ${tone === "neutral" ? "text-muted" : tone === "in" ? "text-income" : "text-expense"}`}>
            {sign}
            {formatBrl(t.amountCents)}
          </span>
          <span className="num block text-xs text-muted">{format(parseISO(t.date), "dd/MM/yyyy")}</span>
        </span>
      </button>
    </li>
  );
}

export function sortByDateDesc(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}
