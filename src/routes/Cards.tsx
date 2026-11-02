import { Link, useParams } from "react-router";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../components/Sheet";
import { sortByDateDesc, TransactionRow } from "../components/TransactionRow";
import { useModeData } from "../hooks/useModeData";
import { NewCardSheet } from "../components/CreateSheets";
import { worstInvoiceStatus } from "../lib/calc";
import { formatBrl } from "../lib/money";
import { payInvoice } from "../store/actions";
import { useUI } from "../store/ui";
import type { Card as CardT, CardInvoice, Transaction } from "../types";
import { todayIso } from "../lib/clock";
import { committedByMonth, installmentPurchases } from "../lib/installments";
import { ptBR } from "date-fns/locale";

/** Parcelas que já ocupam as próximas faturas, mês a mês, e as compras parceladas em andamento. */
function InstallmentsCard({ txs, cardId }: { txs: Transaction[]; cardId?: string }) {
  const today = todayIso();
  const months = committedByMonth(txs, today, 6, cardId);
  const active = installmentPurchases(txs, today).filter((p) => p.remainingCents > 0 && (!cardId || p.cardId === cardId));
  if (active.length === 0) return null;
  const max = Math.max(...months.map((m) => m.cents), 1);
  return (
    <Card title="Parcelas a vencer">
      <p className="text-sm text-muted">Quanto das próximas faturas já está comprometido com compras parceladas.</p>
      <ul className="mt-3 space-y-2">
        {months.map((m) => (
          <li key={m.month} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-sm">
            <span className="capitalize text-muted">{format(parseISO(`${m.month}-01`), "MMM yy", { locale: ptBR })}</span>
            <span className="h-2 rounded-full bg-page" aria-hidden="true"><span className="block h-2 rounded-full bg-brand" style={{ width: `${(m.cents / max) * 100}%` }} /></span>
            <span className="num w-24 text-right">{formatBrl(m.cents)}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-4 divide-y divide-line">
        {active.map((p) => (
          <li key={p.group} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium">{p.description}</span>
              <span className="text-xs text-muted">{p.paidCount} de {p.total} já passaram{p.next ? `, próxima em ${format(parseISO(p.next.date), "dd/MM")}` : ""}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="num block font-semibold">{formatBrl(p.remainingCents)}</span>
              <span className="text-xs text-muted">faltam {p.total - p.paidCount}x de <span className="num">{formatBrl(p.installmentCents)}</span></span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const tone = { vencida: "danger", aberta: "warn", paga: "ok" } as const;
const label = { vencida: "Vencida", aberta: "Aberta", paga: "Paga" } as const;

export function Cards() {
  const { mode, ready, cards, transactions } = useModeData();
  const [creating, setCreating] = useState(false);
  if (!ready) return <Empty>Carregando…</Empty>;
  return (
    <div className="flex flex-col gap-4">
    <Card title="Cartões">
      {cards.length === 0 && <Empty>Nenhum cartão ainda.</Empty>}
      <ul className="divide-y divide-line">
        {cards.map((c) => {
          const worst = worstInvoiceStatus(c);
          return (
            <li key={c.id}>
              <Link to={`/cartoes/${c.id}`} className="flex min-h-11 items-center justify-between gap-3 py-3">
                <span>
                  <span className="block font-medium">{c.label} final {c.last4}</span>
                  <span className="block text-sm text-muted">Limite {c.limitCents === null ? "sem limite" : formatBrl(c.limitCents)}</span>
                </span>
                {worst && <Pill tone={tone[worst]}>{label[worst]}</Pill>}
              </Link>
            </li>
          );
        })}
      </ul>
      <PrimaryButton type="button" onClick={() => setCreating(true)} className="mt-3">Novo cartão</PrimaryButton>
      {creating && <NewCardSheet mode={mode} onClose={() => setCreating(false)} />}
    </Card>
    <InstallmentsCard txs={transactions} />
    </div>
  );
}

export function CardDetail() {
  const { id } = useParams();
  const { ready, cards, accounts, categories, transactions } = useModeData();
  const [paying, setPaying] = useState<{ card: CardT; invoice: CardInvoice } | null>(null);
  if (!ready) return <Empty>Carregando…</Empty>;
  const card = cards.find((c) => c.id === id);
  if (!card) {
    return (
      <Card title="Cartão">
        <Empty>Cartão não encontrado.</Empty>
        <Link to="/cartoes" className="text-sm font-medium text-brand underline">Voltar aos cartões</Link>
      </Card>
    );
  }
  const worst = worstInvoiceStatus(card);
  const purchases = sortByDateDesc(transactions.filter((t) => t.cardId === card.id && !(t.installment && t.date > todayIso())));
  return (
    <div className="flex flex-col gap-4">
      <Card title={`${card.label} final ${card.last4}`}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">Limite {card.limitCents === null ? "sem limite" : formatBrl(card.limitCents)} · vence todo dia {card.dueDay}</p>
          {worst && <Pill tone={tone[worst]}>{label[worst]}</Pill>}
        </div>
      </Card>
      <Card title="Faturas">
        <ul className="divide-y divide-line">
          {[...card.invoices].sort((a, b) => (a.month < b.month ? 1 : -1)).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{format(parseISO(`${i.month}-01`), "MM/yyyy")}</p>
                <p className="num text-sm text-muted">{formatBrl(i.amountCents)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={tone[i.status]}>{label[i.status]}</Pill>
                {i.status !== "paga" && (
                  <SecondaryButton type="button" onClick={() => setPaying({ card, invoice: i })}>
                    Marcar como paga
                  </SecondaryButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <InstallmentsCard txs={transactions} cardId={card.id} />
      <Card title="Compras no cartão">
        {purchases.length === 0 ? (
          <Empty>Nenhuma compra neste cartão.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {purchases.map((t) => (
              <TransactionRow key={t.id} t={t} lookups={{ categories, accounts, cards }} />
            ))}
          </ul>
        )}
      </Card>
      {paying && <PaySheet card={paying.card} invoice={paying.invoice} onClose={() => setPaying(null)} />}
    </div>
  );
}

function PaySheet({ card, invoice, onClose }: { card: CardT; invoice: CardInvoice; onClose: () => void }) {
  const { accounts } = useModeData();
  const showToast = useUI((s) => s.showToast);
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState("");
  const sel = accountId || accounts[0]?.id || "";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sel) return setError("Escolha a conta que pagou a fatura.");
    try {
      await payInvoice(card.id, invoice.id, sel);
      showToast("Fatura marcada como paga");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui registrar o pagamento.");
    }
  }
  return (
    <Sheet title="Marcar fatura como paga" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <p className="text-sm text-muted">Fatura {invoice.month.slice(5, 7)}/{invoice.month.slice(0, 4)} de {formatBrl(invoice.amountCents)}. O valor sai da conta escolhida.</p>
        <Field label="Conta" error={error}>
          <select className={inputClass} value={sel} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
        <div className="flex gap-2">
          <PrimaryButton type="submit" className="flex-1">Confirmar pagamento</PrimaryButton>
          <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
        </div>
      </form>
    </Sheet>
  );
}
