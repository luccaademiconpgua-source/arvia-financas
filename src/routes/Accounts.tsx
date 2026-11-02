import { useState } from "react";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../components/Sheet";
import { useModeData } from "../hooks/useModeData";
import { accountBalanceCents, totalBalanceCents } from "../lib/calc";
import { formatBrl, parseBrlToCents } from "../lib/money";
import { NewAccountSheet } from "../components/CreateSheets";
import { adjustBalance } from "../store/actions";
import { useUI } from "../store/ui";
import type { Account } from "../types";

const typeLabel = { corrente: "Conta corrente", digital: "Conta digital", dinheiro: "Dinheiro", investimento: "Investimento" } as const;

export function Accounts() {
  const { mode, ready, accounts, transactions } = useModeData();
  const [adjusting, setAdjusting] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  if (!ready) return <Empty>Carregando…</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <Card title="Saldo total">
        <p className="num text-2xl font-semibold">{formatBrl(totalBalanceCents(accounts, transactions))}</p>
      </Card>
      <Card title="Contas">
        {accounts.length === 0 ? (
          <Empty>Nenhuma conta ainda. Crie a primeira para começar a lançar.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium">{a.name}</p>
                  <p className="text-sm text-muted">{[a.institution, typeLabel[a.type]].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end gap-1">
                    <p className="num text-base font-semibold">{formatBrl(accountBalanceCents(a, transactions))}</p>
                    {a.openFinance && <Pill tone="neutral">Demonstração</Pill>}
                  </div>
                  <SecondaryButton type="button" onClick={() => setAdjusting(a)} aria-label={`Ajustar saldo de ${a.name}`}>
                    Ajustar saldo
                  </SecondaryButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <PrimaryButton type="button" onClick={() => setCreating(true)} className="self-start">Nova conta</PrimaryButton>
      {creating && <NewAccountSheet mode={mode} onClose={() => setCreating(false)} />}
      {adjusting && <AdjustSheet account={adjusting} current={accountBalanceCents(adjusting, transactions)} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

function AdjustSheet({ account, current, onClose }: { account: Account; current: number; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseBrlToCents(value);
    if (cents === null) return setError("Informe um valor válido, como 1.250,00.");
    try {
      await adjustBalance(account.id, cents);
      showToast("Saldo ajustado");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui ajustar o saldo.");
    }
  }
  return (
    <Sheet title={`Ajustar saldo de ${account.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <p className="text-sm text-muted">Saldo atual: {formatBrl(current)}. O ajuste vira um lançamento do tipo ajuste.</p>
        <Field label="Novo saldo" error={error}>
          <input className={inputClass} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" />
        </Field>
        <div className="flex gap-2">
          <PrimaryButton type="submit" className="flex-1">
            Salvar ajuste
          </PrimaryButton>
          <SecondaryButton type="button" onClick={onClose}>
            Cancelar
          </SecondaryButton>
        </div>
      </form>
    </Sheet>
  );
}
