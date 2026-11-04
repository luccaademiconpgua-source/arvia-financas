import { Link, useNavigate, useParams } from "react-router";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../components/Sheet";
import { sortByDateDesc, TransactionRow } from "../components/TransactionRow";
import { useModeData } from "../hooks/useModeData";
import { NewCardSheet } from "../components/CreateSheets";
import { worstInvoiceStatus } from "../lib/calc";
import { formatBrl, parseBrlToCents } from "../lib/money";
import { deleteCard, payInvoice, updateCard } from "../store/actions";


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
  const [editing, setEditing] = useState(false);
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
          {card.fromBank && <Pill tone="neutral">Open Finance</Pill>}
          <SecondaryButton type="button" onClick={() => setEditing(true)} className="ml-auto">Editar cartão</SecondaryButton>
        </div>
      </Card>
      {editing && <EditCardSheet card={card} purchases={transactions.filter((t) => t.cardId === card.id).length} onClose={() => setEditing(false)} />}
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

function EditCardSheet({ card, purchases, onClose }: { card: CardT; purchases: number; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const navigate = useNavigate();
  const [labelV, setLabel] = useState(card.label);
  const [last4, setLast4] = useState(card.last4);
  const [brand, setBrand] = useState<CardT["brand"]>(card.brand);
  const [limit, setLimit] = useState(card.limitCents === null ? "" : formatBrl(card.limitCents).replace(/[^\d,.]/g, ""));
  const [dueDay, setDueDay] = useState(String(card.dueDay));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const lim = limit.trim() === "" ? null : parseBrlToCents(limit);
    const day = Number(dueDay);
    if (!labelV.trim()) return setError("Informe o nome do cartão.");
    if (!/^\d{4}$/.test(last4)) return setError("Informe os 4 últimos dígitos.");
    if (limit.trim() !== "" && lim === null) return setError("Informe o limite, como 3.000,00.");
    if (!Number.isInteger(day) || day < 1 || day > 31) return setError("O dia de vencimento vai de 1 a 31.");
    setBusy(true);
    try {
      await updateCard(card.id, { label: labelV.trim().slice(0, 40), last4, brand, limit_cents: lim, due_day: day });
      showToast("Cartão atualizado");
      onClose();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Não consegui salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteCard(card.id);
      showToast(`${card.label} apagado`);
      navigate("/cartoes");
    } catch (x) {
      setError(x instanceof Error ? x.message : "Não consegui apagar.");
      setBusy(false);
    }
  }

  return (
    <Sheet title={removing ? `Apagar ${card.label}?` : `Editar ${card.label}`} onClose={onClose}>
      {!removing ? (
        <form onSubmit={save} noValidate className="flex flex-col gap-3">
          <Field label="Nome do cartão"><input className={inputClass} maxLength={40} value={labelV} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="4 últimos dígitos"><input className={inputClass} inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Bandeira">
            <select className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value as CardT["brand"])}>
              <option value="master">Mastercard</option><option value="visa">Visa</option><option value="elo">Elo</option>
            </select>
          </Field>
          <Field label="Limite (deixe vazio se não souber)"><input className={inputClass} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="3.000,00" /></Field>
          <Field label="Dia do vencimento" error={error}><input className={inputClass} inputMode="numeric" maxLength={2} value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ""))} /></Field>
          {card.fromBank && <p className="text-xs text-muted">Este cartão vem do Open Finance. O nome que você der aqui continua depois das próximas sincronizações; o limite e o vencimento podem ser atualizados pelo banco.</p>}
          <div className="mt-1 flex gap-2">
            <PrimaryButton type="submit" disabled={busy} className="flex-1">Salvar</PrimaryButton>
            <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
          </div>
          <button type="button" onClick={() => { setError(""); setRemoving(true); }} className="mt-2 min-h-11 self-start text-sm font-medium text-danger underline underline-offset-4">Apagar cartão</button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {purchases > 0
              ? `As ${purchases} compras e as faturas deste cartão saem do app junto com ele. Pagamentos de fatura já feitos pela conta continuam no extrato da conta.`
              : "Este cartão não tem compras. Ele some da lista."}
          </p>
          {card.fromBank && <p className="text-xs text-muted">Como ele veio do Open Finance, a Arvia passa a ignorar este cartão nas próximas sincronizações.</p>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="mt-1 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void remove()} className="min-h-11 flex-1 rounded-lg bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Apagando…" : "Apagar cartão"}</button>
            <SecondaryButton type="button" onClick={() => setRemoving(false)}>Voltar</SecondaryButton>
          </div>
        </div>
      )}
    </Sheet>
  );
}
