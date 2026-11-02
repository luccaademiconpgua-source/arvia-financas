import { useState } from "react";
import { format, parseISO } from "date-fns";
import { NewDebtSheet } from "../components/CreateSheets";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../components/Sheet";
import { useModeData } from "../hooks/useModeData";
import { formatBrl } from "../lib/money";
import { payDebtInstallment } from "../store/actions";
import { useUI } from "../store/ui";
import type { Debt } from "../types";

export function Debts() {
  const { mode, ready, debts } = useModeData();
  const [paying, setPaying] = useState<Debt | null>(null);
  const [creating, setCreating] = useState(false);
  if (!ready) return <Empty>Carregando…</Empty>;
  return (
    <Card title="Dívidas">
      {debts.length === 0 ? (
        <Empty>Nenhuma dívida cadastrada.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {debts.map((d) => {
            const done = d.paidInstallments >= d.installmentCount;
            const left = (d.installmentCount - d.paidInstallments) * d.installmentCents;
            return (
              <li key={d.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{d.name}</p>
                  {done ? (
                    <Pill tone="ok">Quitada</Pill>
                  ) : (
                    <PrimaryButton type="button" onClick={() => setPaying(d)}>
                      Registrar pagamento
                    </PrimaryButton>
                  )}
                </div>
                <p className="num mt-1 text-sm text-muted">
                  {d.paidInstallments} de {d.installmentCount} parcelas pagas · parcela de {formatBrl(d.installmentCents)}
                  {!done && ` · vence ${format(parseISO(d.nextDue), "dd/MM/yyyy")} · falta ${formatBrl(left)}`}
                </p>
                <div role="progressbar" aria-valuemin={0} aria-valuemax={d.installmentCount} aria-valuenow={d.paidInstallments} aria-label={`Parcelas pagas de ${d.name}`} className="mt-2 h-2 rounded-full bg-line">
                  <div className="h-2 rounded-full bg-brand" style={{ width: `${(d.paidInstallments / d.installmentCount) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PrimaryButton type="button" onClick={() => setCreating(true)} className="mt-3">Nova dívida</PrimaryButton>
      {creating && <NewDebtSheet mode={mode} onClose={() => setCreating(false)} />}
      {paying && <DebtSheet debt={paying} onClose={() => setPaying(null)} />}
    </Card>
  );
}

function DebtSheet({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const { accounts } = useModeData();
  const showToast = useUI((s) => s.showToast);
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState("");
  const sel = accountId || accounts[0]?.id || "";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sel) return setError("Escolha a conta que pagou a parcela.");
    try {
      await payDebtInstallment(debt.id, sel);
      showToast("Pagamento registrado");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui registrar o pagamento.");
    }
  }
  return (
    <Sheet title="Registrar pagamento" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          {debt.name}, parcela {debt.paidInstallments + 1} de {debt.installmentCount}: {formatBrl(debt.installmentCents)}.
        </p>
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
