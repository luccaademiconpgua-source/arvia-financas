import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, ChevronLeft, ChevronRight, Link2, Plus } from "lucide-react";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../components/Sheet";
import { useModeData } from "../hooks/useModeData";
import { shiftMonth, todayIso } from "../lib/clock";
import { formatBrl, parseBrlToCents } from "../lib/money";
import { occurrences, type Occurrence, type Recurrence } from "../lib/recurrence";
import { deleteRecurrence, linkRecurrence, markPaid, saveRecurrence, setRecurrenceActive, useRecurrences, type RecurrenceInput } from "../services/recurrences";
import { useUI } from "../store/ui";
import type { Transaction } from "../types";

const monthName = (ym: string) => format(parseISO(`${ym}-01`), "MMMM 'de' yyyy", { locale: ptBR });
const dm = (iso: string) => format(parseISO(iso), "dd/MM");

const STATE: Record<Occurrence["state"], { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  paga: { label: "Paga", tone: "ok" },
  atrasada: { label: "Atrasada", tone: "danger" },
  hoje: { label: "Vence hoje", tone: "warn" },
  proxima: { label: "Vence logo", tone: "warn" },
  futura: { label: "A vencer", tone: "neutral" },
};

const INCOME_LABEL: Record<Occurrence["state"], string> = { paga: "Recebido", atrasada: "Atrasado", hoje: "Cai hoje", proxima: "Em breve", futura: "A receber" };

type Open = null | { kind: "edit"; rec?: Recurrence } | { kind: "pay"; occ: Occurrence } | { kind: "link"; occ: Occurrence };

export function Recurring() {
  const { ready, mode, transactions } = useModeData();
  const { ready: rReady, recurrences, error } = useRecurrences(mode);
  const today = todayIso();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [open, setOpen] = useState<Open>(null);
  const occ = useMemo(() => occurrences(recurrences, transactions, ym, today), [recurrences, transactions, ym, today]);

  if (!ready || !rReady) return <Empty>{error || "Carregando…"}</Empty>;

  const sum = (f: (o: Occurrence) => boolean) => occ.filter(f).reduce((s, o) => s + (o.tx?.amountCents ?? o.rec.amountCents), 0);
  const pagar = sum((o) => o.rec.type === "despesa" && o.state !== "paga");
  const pago = sum((o) => o.rec.type === "despesa" && o.state === "paga");
  const receber = sum((o) => o.rec.type === "receita" && o.state !== "paga");
  const paused = recurrences.filter((r) => !r.active);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Mês anterior" onClick={() => setYm(shiftMonth(ym, -1))} className="flex size-11 items-center justify-center rounded-lg border border-line"><ChevronLeft size={20} aria-hidden="true" /></button>
          <h2 className="font-display text-center text-lg font-semibold">Contas fixas de {monthName(ym)}</h2>
          <button type="button" aria-label="Próximo mês" onClick={() => setYm(shiftMonth(ym, 1))} className="flex size-11 items-center justify-center rounded-lg border border-line"><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-lg bg-expense-bg p-3"><dt className="text-muted">Falta pagar</dt><dd className="num font-semibold">{formatBrl(pagar)}</dd></div>
          <div className="rounded-lg bg-page p-3"><dt className="text-muted">Já pago</dt><dd className="num font-semibold">{formatBrl(pago)}</dd></div>
          <div className="rounded-lg bg-income-bg p-3"><dt className="text-muted">A receber</dt><dd className="num font-semibold">{formatBrl(receber)}</dd></div>
        </dl>
      </Card>

      <Card title="Neste mês">
        {occ.length === 0 ? (
          <p className="text-sm text-muted">
            Cadastre o que se repete todo mês: aluguel, internet, luz, escola, assinaturas, salário. A Arvia avisa o que está para vencer, reconhece o pagamento quando ele aparece no banco e calcula quanto vai sobrar no fim do mês.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {occ.map((o) => (
              <li key={o.rec.id} className="flex flex-wrap items-center gap-3 py-3">
                <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-full ${o.rec.type === "receita" ? "bg-income-bg text-income" : "bg-expense-bg text-expense"}`}>
                  <CalendarClock size={18} />
                </span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen({ kind: "edit", rec: o.rec })}>
                  <span className="block truncate font-medium">{o.rec.description}</span>
                  <span className="block text-xs text-muted">
                    {o.rec.type === "receita" ? "Recebe" : "Vence"} dia {dm(o.due)}
                    {o.rec.variable ? ", valor variável" : ""}
                    {o.tx ? `, ${o.rec.type === "receita" ? "recebido" : "pago"} em ${dm(o.tx.date)}` : o.state === "atrasada" ? `, ${-o.daysLeft} ${-o.daysLeft === 1 ? "dia" : "dias"} de atraso` : ""}
                  </span>
                </button>
                <span className="num font-semibold">{formatBrl(o.tx?.amountCents ?? o.rec.amountCents)}</span>
                <Pill tone={STATE[o.state].tone}>{o.rec.type === "receita" ? INCOME_LABEL[o.state] : STATE[o.state].label}</Pill>
                <div className="flex w-full gap-2 pl-13 sm:w-auto sm:pl-0">
                  {o.tx ? (
                    <SecondaryButton type="button" onClick={() => void linkRecurrence(o.tx!.id, null, ym)}>Desfazer</SecondaryButton>
                  ) : (
                    <>
                      <PrimaryButton type="button" onClick={() => setOpen({ kind: "pay", occ: o })}>{o.rec.type === "receita" ? "Recebi" : "Paguei"}</PrimaryButton>
                      <SecondaryButton type="button" onClick={() => setOpen({ kind: "link", occ: o })} className="flex items-center gap-1"><Link2 size={16} aria-hidden="true" /> Já está lançado</SecondaryButton>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <PrimaryButton type="button" className="mt-3 flex items-center gap-1" onClick={() => setOpen({ kind: "edit" })}><Plus size={16} aria-hidden="true" /> Nova conta fixa</PrimaryButton>
      </Card>

      {paused.length > 0 && (
        <Card title="Pausadas">
          <ul className="divide-y divide-line text-sm">
            {paused.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <span>{r.description}, {formatBrl(r.amountCents)}</span>
                <SecondaryButton type="button" onClick={() => void setRecurrenceActive(r.id, true)}>Retomar</SecondaryButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {open?.kind === "edit" && <RecurrenceSheet {...(open.rec ? { rec: open.rec } : {})} onClose={() => setOpen(null)} />}
      {open?.kind === "pay" && <PaySheet occ={open.occ} onClose={() => setOpen(null)} />}
      {open?.kind === "link" && <LinkSheet occ={open.occ} transactions={transactions} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RecurrenceSheet({ rec, onClose }: { rec?: Recurrence; onClose: () => void }) {
  const { mode, categories, accounts, cards } = useModeData();
  const showToast = useUI((s) => s.showToast);
  const [type, setType] = useState<"receita" | "despesa">(rec?.type ?? "despesa");
  const [description, setDescription] = useState(rec?.description ?? "");
  const [amount, setAmount] = useState(rec ? (rec.amountCents / 100).toFixed(2).replace(".", ",") : "");
  const [variable, setVariable] = useState(rec?.variable ?? false);
  const [day, setDay] = useState(String(rec?.dayOfMonth ?? 10));
  const [categoryId, setCategoryId] = useState(rec?.categoryId ?? "");
  const [source, setSource] = useState(rec?.cardId ? `c:${rec.cardId}` : rec?.accountId ? `a:${rec.accountId}` : "");
  const [payment, setPayment] = useState<Transaction["payment"]>(rec?.payment && rec.payment !== "credito" ? rec.payment : "pix");
  const [start, setStart] = useState(rec?.startMonth ?? todayIso().slice(0, 7));
  const [end, setEnd] = useState(rec?.endMonth ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const cats = categories.filter((c) => c.kind === type);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseBrlToCents(amount);
    const d = Number(day);
    if (description.trim().length < 2) return setError("Dê um nome, como Aluguel ou Internet.");
    if (!cents || cents <= 0) return setError("Informe o valor, como 1.800,00.");
    if (!Number.isInteger(d) || d < 1 || d > 31) return setError("O dia precisa ser de 1 a 31.");
    if (end && end < start) return setError("O mês final é antes do inicial.");
    const input: RecurrenceInput = {
      type,
      description: description.trim().slice(0, 60),
      amountCents: cents,
      variable,
      dayOfMonth: d,
      categoryId: categoryId || null,
      accountId: source.startsWith("a:") ? source.slice(2) : null,
      cardId: source.startsWith("c:") && type === "despesa" ? source.slice(2) : null,
      payment,
      startMonth: start,
      endMonth: end || null,
    };
    setBusy(true);
    try {
      await saveRecurrence(mode, input, rec?.id);
      showToast(rec ? "Conta fixa atualizada" : "Conta fixa criada");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={rec ? "Editar conta fixa" : "Nova conta fixa"} onClose={onClose}>
      <form noValidate className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 rounded-xl border border-line p-1">
          {(["despesa", "receita"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => { setType(t); setCategoryId(""); }} className={`min-h-11 rounded-lg text-sm font-medium ${type === t ? "bg-brand text-white" : "text-muted"}`}>
              {t === "despesa" ? "Conta a pagar" : "Valor a receber"}
            </button>
          ))}
        </div>
        <Field label="Nome"><input className={inputClass} value={description} maxLength={60} onChange={(e) => setDescription(e.target.value)} placeholder={type === "despesa" ? "Aluguel" : "Salário"} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor"><input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1.800,00" /></Field>
          <Field label={type === "despesa" ? "Dia do vencimento" : "Dia que cai"}><input className={inputClass} inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))} /></Field>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-4" checked={variable} onChange={(e) => setVariable(e.target.checked)} />
          <span>O valor muda todo mês <span className="block text-xs text-muted">Como luz e água. O valor acima vira uma média, e a Arvia aceita até 25% de diferença ao reconhecer o pagamento.</span></span>
        </label>
        <Field label="Categoria">
          <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sem categoria</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={type === "despesa" ? "Paga com" : "Cai em"}>
          <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Qualquer conta</option>
            {accounts.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
            {type === "despesa" && cards.map((c) => <option key={c.id} value={`c:${c.id}`}>Cartão {c.label} final {c.last4}</option>)}
          </select>
        </Field>
        {!source.startsWith("c:") && (
          <Field label="Forma">
            <select className={inputClass} value={payment} onChange={(e) => setPayment(e.target.value as Transaction["payment"])}>
              <option value="pix">Pix</option><option value="debito">Débito ou boleto</option><option value="dinheiro">Dinheiro</option>
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Começa em"><input type="month" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Termina em (opcional)"><input type="month" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <PrimaryButton type="submit" disabled={busy} className="flex-1">{busy ? "Salvando…" : "Salvar"}</PrimaryButton>
          <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
        </div>
        {rec && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-3 text-sm">
            <SecondaryButton type="button" onClick={() => void setRecurrenceActive(rec.id, false).then(onClose)}>Pausar</SecondaryButton>
            {!confirmDel ? (
              <button type="button" className="min-h-11 px-2 text-muted underline" onClick={() => setConfirmDel(true)}>Excluir</button>
            ) : (
              <button type="button" className="min-h-11 rounded-lg bg-danger px-3 font-medium text-white" onClick={() => void deleteRecurrence(rec.id).then(() => { showToast("Conta fixa excluída"); onClose(); })}>
                Confirmar exclusão (os lançamentos ficam)
              </button>
            )}
          </div>
        )}
      </form>
    </Sheet>
  );
}

function PaySheet({ occ, onClose }: { occ: Occurrence; onClose: () => void }) {
  const { mode, accounts, cards } = useModeData();
  const showToast = useUI((s) => s.showToast);
  const r = occ.rec;
  const today = todayIso();
  const [amount, setAmount] = useState((r.amountCents / 100).toFixed(2).replace(".", ","));
  const [date, setDate] = useState(occ.due < today ? occ.due : today);
  const [source, setSource] = useState(r.cardId ? `c:${r.cardId}` : r.accountId ? `a:${r.accountId}` : accounts[0] ? `a:${accounts[0].id}` : "");
  const [payment, setPayment] = useState<Transaction["payment"]>(r.payment === "credito" ? "pix" : r.payment);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const recebe = r.type === "receita";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseBrlToCents(amount);
    if (!cents || cents <= 0) return setError("Informe o valor.");
    if (!source) return setError("Escolha a conta.");
    setBusy(true);
    try {
      await markPaid(mode, r, occ.month, cents, date, source.startsWith("c:") ? { cardId: source.slice(2), payment: "credito" } : { accountId: source.slice(2), payment });
      showToast(recebe ? "Recebimento lançado" : "Pagamento lançado");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível lançar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`${recebe ? "Recebi" : "Paguei"}: ${r.description}`} onClose={onClose}>
      <form noValidate className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor"><input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Data"><input type="date" className={inputClass} value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label={recebe ? "Caiu em" : "Pago com"}>
          <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
            {!recebe && cards.map((c) => <option key={c.id} value={`c:${c.id}`}>Cartão {c.label} final {c.last4}</option>)}
          </select>
        </Field>
        {source.startsWith("a:") && (
          <Field label="Forma">
            <select className={inputClass} value={payment} onChange={(e) => setPayment(e.target.value as Transaction["payment"])}>
              <option value="pix">Pix</option><option value="debito">Débito ou boleto</option><option value="dinheiro">Dinheiro</option>
            </select>
          </Field>
        )}
        <p className="text-xs text-muted">Se o banco trouxer o mesmo pagamento depois, a Arvia junta os dois e conta uma vez só.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <PrimaryButton type="submit" disabled={busy} className="flex-1">{busy ? "Lançando…" : "Lançar"}</PrimaryButton>
          <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
        </div>
      </form>
    </Sheet>
  );
}

function LinkSheet({ occ, transactions, onClose }: { occ: Occurrence; transactions: Transaction[]; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const r = occ.rec;
  const from = shiftDays(occ.due, -20);
  const to = shiftDays(occ.due, 20);
  const candidates = transactions
    .filter((t) => t.type === r.type && !t.recurrenceId && t.date >= from && t.date <= to)
    .sort((a, b) => Math.abs(a.amountCents - r.amountCents) - Math.abs(b.amountCents - r.amountCents) || b.date.localeCompare(a.date))
    .slice(0, 12);
  return (
    <Sheet title={`Qual lançamento é ${r.description}?`} onClose={onClose}>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted">Não achei lançamentos perto do vencimento. Use "{r.type === "receita" ? "Recebi" : "Paguei"}" para lançar agora.</p>
      ) : (
        <ul className="divide-y divide-line">
          {candidates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-page"
                onClick={() => void linkRecurrence(t.id, r.id, occ.month).then(() => { showToast("Ligado à conta fixa"); onClose(); })}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.merchant || t.description}</span>
                  <span className="text-xs text-muted">{dm(t.date)}</span>
                </span>
                <span className="num shrink-0">{formatBrl(t.amountCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function shiftDays(iso: string, delta: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
