import { useState } from "react";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../components/Sheet";
import { useModeData } from "../hooks/useModeData";
import { accountBalanceCents, totalBalanceCents } from "../lib/calc";
import { formatBrl, parseBrlToCents } from "../lib/money";
import { NewAccountSheet } from "../components/CreateSheets";
import { adjustBalance, deleteAccount, updateAccount } from "../store/actions";
import { useUI } from "../store/ui";
import type { Account } from "../types";

const typeLabel = { corrente: "Conta corrente", digital: "Conta digital", dinheiro: "Dinheiro", investimento: "Investimento" } as const;

export function Accounts() {
  const { mode, ready, accounts, transactions } = useModeData();
  const [adjusting, setAdjusting] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
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
                    {a.openFinance && <Pill tone="neutral">{a.openFinance.status === "demo" ? "Demonstração" : "Open Finance"}</Pill>}
                  </div>
                  <SecondaryButton type="button" onClick={() => setEditing(a)} aria-label={`Editar ${a.name}`}>
                    Editar
                  </SecondaryButton>
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
      {editing && (
        <EditSheet
          account={editing}
          others={accounts.filter((x) => x.id !== editing.id)}
          txCount={transactions.filter((t) => t.accountId === editing.id).length}
          onClose={() => setEditing(null)}
        />
      )}
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

function EditSheet({ account, others, txCount, onClose }: { account: Account; others: Account[]; txCount: number; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const [name, setName] = useState(account.name);
  const [institution, setInstitution] = useState(account.institution ?? "");
  const [type, setType] = useState<Account["type"]>(account.type);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
  const [keep, setKeep] = useState<"mover" | "apagar">(txCount > 0 && others.length > 0 ? "mover" : "apagar");
  const fromBank = !!account.openFinance && account.openFinance.status !== "demo";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Informe o nome da conta.");
    setBusy(true);
    try {
      await updateAccount(account.id, { name: name.trim(), institution: institution.trim() || null, type });
      showToast("Conta atualizada");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteAccount(account.id, keep === "mover" ? moveTo : null);
      showToast(`${account.name} apagada`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui apagar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={removing ? `Apagar ${account.name}?` : `Editar ${account.name}`} onClose={onClose}>
      {!removing ? (
        <form onSubmit={save} noValidate className="flex flex-col gap-3">
          <Field label="Nome da conta">
            <input className={inputClass} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Banco ou instituição">
            <input className={inputClass} maxLength={60} value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Nubank" />
          </Field>
          <Field label="Tipo" error={error}>
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as Account["type"])}>
              <option value="corrente">Conta corrente</option>
              <option value="digital">Conta digital</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="investimento">Investimento</option>
            </select>
          </Field>
          {fromBank && <p className="text-xs text-muted">Esta conta vem do Open Finance. O nome que você der aqui continua mesmo depois das próximas sincronizações.</p>}
          <div className="mt-1 flex gap-2">
            <PrimaryButton type="submit" disabled={busy} className="flex-1">Salvar</PrimaryButton>
            <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
          </div>
          <button type="button" onClick={() => { setError(""); setRemoving(true); }} className="mt-2 min-h-11 self-start text-sm font-medium text-danger underline underline-offset-4">
            Apagar conta
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          {txCount === 0 ? (
            <p className="text-sm text-muted">Esta conta não tem lançamentos. Ela some da lista e do saldo total.</p>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm">Ela tem {txCount} {txCount === 1 ? "lançamento" : "lançamentos"}. O que fazer com {txCount === 1 ? "ele" : "eles"}?</legend>
              {others.length > 0 && (
                <label className="flex min-h-11 items-start gap-3 rounded-lg border border-line p-3 text-sm">
                  <input type="radio" name="keep" className="mt-0.5" checked={keep === "mover"} onChange={() => setKeep("mover")} />
                  <span className="flex flex-1 flex-col gap-2">
                    Passar para outra conta
                    {keep === "mover" && (
                      <select className={inputClass} aria-label="Conta que recebe os lançamentos" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                        {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    )}
                  </span>
                </label>
              )}
              <label className="flex min-h-11 items-start gap-3 rounded-lg border border-line p-3 text-sm">
                <input type="radio" name="keep" className="mt-0.5" checked={keep === "apagar"} onChange={() => setKeep("apagar")} />
                <span>Apagar junto. Esses lançamentos saem dos relatórios e do orçamento.</span>
              </label>
            </fieldset>
          )}
          {fromBank && <p className="text-xs text-muted">Como ela veio do Open Finance, a Arvia passa a ignorar esta conta nas próximas sincronizações.</p>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="mt-1 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void remove()} className="min-h-11 flex-1 rounded-lg bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Apagando…" : "Apagar conta"}
            </button>
            <SecondaryButton type="button" onClick={() => setRemoving(false)}>Voltar</SecondaryButton>
          </div>
        </div>
      )}
    </Sheet>
  );
}
