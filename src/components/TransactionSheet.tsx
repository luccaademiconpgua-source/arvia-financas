import { useState } from "react";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "./Sheet";
import { useModeData } from "../hooks/useModeData";
import { todayIso } from "../lib/clock";
import { parseBrlToCents } from "../lib/money";
import { makeTxSchema } from "../lib/txSchema";
import { addInstallments, addTransaction } from "../store/actions";
import { formatBrl } from "../lib/money";
import { splitInstallments } from "../lib/installments";
import { useUI, type TxType } from "../store/ui";
import type { Transaction } from "../types";

const typeLabels: Array<{ value: TxType; label: string }> = [
  { value: "receita", label: "Receita" },
  { value: "despesa", label: "Despesa" },
  { value: "reserva", label: "Reserva" },
];
const paymentLabels: Array<{ value: Exclude<Transaction["payment"], "credito">; label: string }> = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
];

export function TransactionSheet() {
  const sheet = useUI((s) => s.txSheet);
  const close = useUI((s) => s.closeTx);
  if (!sheet) return null;
  return (
    <Sheet title="Novo lançamento" onClose={close}>
      <TxForm initialType={sheet.type ?? "despesa"} initialGoalId={sheet.goalId} onClose={close} />
    </Sheet>
  );
}

function TxForm({ initialType, initialGoalId, onClose }: { initialType: TxType; initialGoalId: string | undefined; onClose: () => void }) {
  const { mode, accounts, cards, categories, goals } = useModeData();
  const showToast = useUI((s) => s.showToast);
  const [type, setType] = useState<TxType>(initialType);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayIso());
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [onCard, setOnCard] = useState(false);
  const [parcelas, setParcelas] = useState(1);
  const [cardId, setCardId] = useState("");
  const [payment, setPayment] = useState<Exclude<Transaction["payment"], "credito">>("pix");
  const [essential, setEssential] = useState<boolean | null>(null);
  const [goalId, setGoalId] = useState(initialGoalId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const kind = type === "receita" ? "receita" : "despesa";
  const cats = categories.filter((c) => c.kind === kind);
  const categorySel = categoryId || cats[0]?.id || "";
  const accountSel = accountId || accounts[0]?.id || "";
  const cardSel = cardId || cards[0]?.id || "";
  const goalSel = goalId || goals[0]?.id || "";
  const category = cats.find((c) => c.id === categorySel);
  const essentialSel = essential ?? category?.essential ?? false;
  const canUseCard = type === "despesa" && cards.length > 0;
  const useCard = onCard && canUseCard;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const cents = parseBrlToCents(amount) ?? 0;
    const parsed = makeTxSchema(todayIso()).safeParse({
      type,
      amountCents: cents,
      description,
      date,
      payment: useCard ? "credito" : payment,
      categoryId: type === "reserva" ? undefined : categorySel || undefined,
      accountId: useCard ? undefined : accountSel || undefined,
      cardId: useCard ? cardSel || undefined : undefined,
      goalId: type === "reserva" ? goalSel || undefined : undefined,
      essential: type === "despesa" ? essentialSel : undefined,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const v = parsed.data;
      if (useCard && parcelas > 1 && v.cardId) {
        await addInstallments({ mode, description: v.description, totalCents: v.amountCents, count: parcelas, date: v.date, cardId: v.cardId, categoryId: v.categoryId, essential: v.essential });
        showToast(`Compra lançada em ${parcelas}x`);
        onClose();
        return;
      }
      await addTransaction({
        mode,
        type: v.type,
        description: v.description,
        amountCents: v.amountCents,
        date: v.date,
        payment: v.payment,
        categoryId: v.categoryId,
        accountId: v.accountId,
        cardId: v.cardId,
        goalId: v.goalId,
        essential: v.essential,
      });
      showToast(v.type === "receita" ? "Receita lançada" : v.type === "reserva" ? "Reserva registrada" : "Despesa lançada");
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não consegui salvar o lançamento.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div role="tablist" aria-label="Tipo de lançamento" className="grid grid-cols-3 rounded-xl border border-line p-1">
        {typeLabels.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={type === t.value}
            onClick={() => {
              setType(t.value);
              setCategoryId("");
              setEssential(null);
              setOnCard(false);
              setParcelas(1);
            }}
            className={`min-h-11 rounded-lg text-sm font-medium ${type === t.value ? "bg-brand text-white" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Field label={useCard && parcelas > 1 ? "Valor total da compra" : "Valor"} error={errors["amountCents"]}>
        <input className={inputClass} inputMode="decimal" autoComplete="off" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Descrição" error={errors["description"]}>
        <input className={inputClass} autoComplete="off" maxLength={80} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Data" error={errors["date"]}>
        <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      {type === "reserva" ? (
        <Field label="Meta" error={errors["goalId"]}>
          <select className={inputClass} value={goalSel} onChange={(e) => setGoalId(e.target.value)}>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Categoria">
          <select className={inputClass} value={categorySel} onChange={(e) => setCategoryId(e.target.value)}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {canUseCard && (
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="size-5 accent-brand" checked={useCard} onChange={(e) => setOnCard(e.target.checked)} />
          No cartão de crédito
        </label>
      )}

      {useCard ? (
        <>
        <Field label="Em quantas vezes">
          <select className={inputClass} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
            <option value={1}>À vista</option>
            {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>{n}x</option>
            ))}
          </select>
        </Field>
        {parcelas > 1 && (parseBrlToCents(amount) ?? 0) >= parcelas && (
          <p className="-mt-1 text-sm text-muted">
            {parcelas}x de <span className="num">{formatBrl(splitInstallments(parseBrlToCents(amount) ?? 0, parcelas)[1]!)}</span>. Cada parcela entra na fatura do seu mês.
          </p>
        )}
        <Field label="Cartão" error={errors["cardId"]}>
          <select className={inputClass} value={cardSel} onChange={(e) => setCardId(e.target.value)}>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} final {c.last4}
              </option>
            ))}
          </select>
        </Field>
        </>
      ) : (
        <>
          <Field label="Conta" error={errors["accountId"]}>
            <select className={inputClass} value={accountSel} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Forma de pagamento">
            <select className={inputClass} value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)}>
              {paymentLabels.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      {type === "despesa" && (
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="size-5 accent-brand" checked={essentialSel} onChange={(e) => setEssential(e.target.checked)} />
          Gasto essencial
        </label>
      )}

      {type === "reserva" && <p className="text-sm text-muted">A reserva sai da conta escolhida e não pode passar do saldo dela.</p>}
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <PrimaryButton type="submit" disabled={saving} className="flex-1">
          Salvar lançamento
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onClose}>
          Cancelar
        </SecondaryButton>
      </div>
    </form>
  );
}
