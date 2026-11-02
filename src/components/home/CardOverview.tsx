import { Link } from "react-router";
import { format, parseISO } from "date-fns";
import { Card, Empty, Pill } from "../ui";
import { formatBrl } from "../../lib/money";
import { worstInvoiceStatus } from "../../lib/calc";
import type { Card as CardT, Transaction } from "../../types";

export function dueDateFor(card: CardT, today: string): string {
  const m = Number(today.slice(5, 7));
  const day = String(card.dueDay).padStart(2, "0");
  const open = card.invoices.find((i) => i.status === "aberta");
  if (open) return `${day}/${open.month.slice(5, 7)}`;
  return `${day}/${String(m).padStart(2, "0")}`;
}

export function CardOverview({ cards, transactions, today }: { cards: CardT[]; transactions: Transaction[]; today: string }) {
  const card = cards[0];
  if (!card) {
    return (
      <Card title="Cartão" className="h-full">
        <Empty>Nenhum cartão cadastrado neste modo.</Empty>
      </Card>
    );
  }
  const emAberto = card.invoices.filter((i) => i.status !== "paga").reduce((s, i) => s + i.amountCents, 0);
  const worst = worstInvoiceStatus(card);
  const recent = transactions.filter((t) => t.cardId === card.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);
  const monthCard = transactions.filter((t) => t.cardId === card.id && t.date.slice(0, 7) === today.slice(0, 7)).reduce((s, t) => s + t.amountCents, 0);
  return (
    <Card title="Cartão" className="h-full">
      <div className="aspect-[16/10] max-w-xs rounded-2xl bg-gradient-to-br from-brand-dark to-brand p-4 text-white">
        <div className="flex h-full flex-col justify-between">
          <div className="flex justify-between text-sm">
            <span>{card.label}</span>
            <span className="uppercase">{card.brand}</span>
          </div>
          <div>
            <p className="num text-lg tracking-widest">•••• {card.last4}</p>
            <p className="text-xs text-white/70">Vencimento {dueDateFor(card, today)}</p>
          </div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted">Em aberto</dt>
          <dd className="num font-semibold">{formatBrl(emAberto)}</dd>
        </div>
        <div>
          <dt className="text-muted">Limite</dt>
          <dd className="num font-semibold">{card.limitCents === null ? "Sem limite" : formatBrl(card.limitCents)}</dd>
        </div>
        <div>
          <dt className="text-muted">Neste mês</dt>
          <dd className="num font-semibold">{formatBrl(monthCard)}</dd>
        </div>
        <div>
          <dt className="text-muted">Faturas</dt>
          <dd>{worst && <Pill tone={worst === "vencida" ? "danger" : worst === "aberta" ? "warn" : "ok"}>{worst === "vencida" ? "Vencida" : worst === "aberta" ? "Aberta" : "Paga"}</Pill>}</dd>
        </div>
      </dl>
      {recent.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {recent.map((t) => (
            <li key={t.id} className="flex justify-between gap-2 py-2">
              <span className="truncate">{t.merchant || t.description}</span>
              <span className="num shrink-0 text-muted">
                {format(parseISO(t.date), "dd/MM")} · {formatBrl(t.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/cartoes/${card.id}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-4">
        Ver cartão
      </Link>
    </Card>
  );
}
