import { useState } from "react";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "./Sheet";
import { supabase } from "../lib/supabase";
import { todayIso } from "../lib/clock";
import { parseBrlToCents } from "../lib/money";
import { useRefresh } from "../store/refresh";
import { useUI } from "../store/ui";
import type { Mode } from "../types";

type Props = { mode: Mode; onClose: () => void };

function useSave(onClose: () => void, okMessage: string) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const showToast = useUI((s) => s.showToast);
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    const { error: err } = await fn();
    setBusy(false);
    if (err) return setError(err.message);
    useRefresh.getState().bump();
    showToast(okMessage);
    onClose();
  }
  return { error, setError, busy, run };
}

function Actions({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }) {
  return (
    <div className="mt-2 flex gap-2">
      <PrimaryButton type="submit" disabled={busy} className="flex-1">{label}</PrimaryButton>
      <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
    </div>
  );
}

export function NewAccountSheet({ mode, onClose }: Props) {
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [type, setType] = useState("corrente");
  const [opening, setOpening] = useState("");
  const { error, setError, busy, run } = useSave(onClose, "Conta criada");
  return (
    <Sheet title="Nova conta" onClose={onClose}>
      <form noValidate className="flex flex-col gap-3" onSubmit={(e) => {
        e.preventDefault();
        const cents = opening.trim() === "" ? 0 : parseBrlToCents(opening);
        if (name.trim().length < 1) return setError("Informe o nome da conta.");
        if (cents === null) return setError("Informe o saldo atual, como 1.250,00.");
        void run(() => supabase.from("accounts").insert({ scope: mode, name: name.trim(), type, institution: institution.trim() || null, opening_balance_cents: cents }));
      }}>
        <Field label="Nome da conta"><input className={inputClass} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Conta corrente" /></Field>
        <Field label="Banco ou instituição"><input className={inputClass} value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Nubank" /></Field>
        <Field label="Tipo">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="corrente">Conta corrente</option><option value="digital">Conta digital</option><option value="dinheiro">Dinheiro</option><option value="investimento">Investimento</option>
          </select>
        </Field>
        <Field label="Saldo atual" error={error}><input className={inputClass} inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0,00" /></Field>
        <Actions busy={busy} onClose={onClose} label="Criar conta" />
      </form>
    </Sheet>
  );
}

export function NewCardSheet({ mode, onClose }: Props) {
  const [label, setLabel] = useState("");
  const [brand, setBrand] = useState("master");
  const [last4, setLast4] = useState("");
  const [limit, setLimit] = useState("");
  const [dueDay, setDueDay] = useState("10");
  const { error, setError, busy, run } = useSave(onClose, "Cartão criado");
  return (
    <Sheet title="Novo cartão" onClose={onClose}>
      <form noValidate className="flex flex-col gap-3" onSubmit={(e) => {
        e.preventDefault();
        const lim = limit.trim() === "" ? null : parseBrlToCents(limit);
        const day = Number(dueDay);
        if (label.trim().length < 1) return setError("Informe o nome do cartão.");
        if (!/^\d{4}$/.test(last4)) return setError("Informe os 4 últimos dígitos.");
        if (limit.trim() !== "" && lim === null) return setError("Informe o limite, como 3.000,00.");
        if (!Number.isInteger(day) || day < 1 || day > 31) return setError("O dia de vencimento vai de 1 a 31.");
        void run(() => supabase.from("cards").insert({ scope: mode, label: label.trim(), brand, last4, limit_cents: lim, due_day: day }));
      }}>
        <Field label="Nome do cartão"><input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Inter" /></Field>
        <Field label="Bandeira">
          <select className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value)}><option value="master">Mastercard</option><option value="visa">Visa</option><option value="elo">Elo</option></select>
        </Field>
        <Field label="Final do cartão"><input className={inputClass} inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value)} /></Field>
        <Field label="Limite (opcional)"><input className={inputClass} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0,00" /></Field>
        <Field label="Dia do vencimento" error={error}><input className={inputClass} inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} /></Field>
        <Actions busy={busy} onClose={onClose} label="Criar cartão" />
      </form>
    </Sheet>
  );
}

export function NewGoalSheet({ mode, onClose }: Props) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState("geral");
  const { error, setError, busy, run } = useSave(onClose, "Meta criada");
  return (
    <Sheet title="Nova meta" onClose={onClose}>
      <form noValidate className="flex flex-col gap-3" onSubmit={(e) => {
        e.preventDefault();
        const cents = parseBrlToCents(target);
        if (name.trim().length < 1) return setError("Informe o nome da meta.");
        if (cents === null || cents <= 0) return setError("Informe o valor da meta, como 50.000,00.");
        void run(() => supabase.from("goals").insert({ scope: mode, name: name.trim(), target_cents: cents, kind }));
      }}>
        <Field label="Nome da meta"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Reserva de emergência" /></Field>
        <Field label="Tipo">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}><option value="emergencia">Reserva de emergência</option><option value="geral">Outra meta</option></select>
        </Field>
        <Field label="Valor da meta" error={error}><input className={inputClass} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0,00" /></Field>
        <Actions busy={busy} onClose={onClose} label="Criar meta" />
      </form>
    </Sheet>
  );
}

export function NewDebtSheet({ mode, onClose }: Props) {
  const [name, setName] = useState("");
  const [count, setCount] = useState("");
  const [paid, setPaid] = useState("0");
  const [value, setValue] = useState("");
  const [due, setDue] = useState(todayIso());
  const { error, setError, busy, run } = useSave(onClose, "Dívida criada");
  return (
    <Sheet title="Nova dívida" onClose={onClose}>
      <form noValidate className="flex flex-col gap-3" onSubmit={(e) => {
        e.preventDefault();
        const cents = parseBrlToCents(value);
        const n = Number(count);
        const p = Number(paid);
        if (name.trim().length < 1) return setError("Informe o nome da dívida.");
        if (!Number.isInteger(n) || n < 1) return setError("Informe quantas parcelas tem.");
        if (!Number.isInteger(p) || p < 0 || p > n) return setError("As parcelas pagas vão de 0 até o total.");
        if (cents === null || cents <= 0) return setError("Informe o valor da parcela, como 349,00.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return setError("Informe o próximo vencimento.");
        void run(() => supabase.from("debts").insert({ scope: mode, name: name.trim(), installment_count: n, paid_installments: p, installment_cents: cents, next_due: due }));
      }}>
        <Field label="Nome da dívida"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Colombo" /></Field>
        <Field label="Total de parcelas"><input className={inputClass} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        <Field label="Parcelas já pagas"><input className={inputClass} inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>
        <Field label="Valor da parcela"><input className={inputClass} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" /></Field>
        <Field label="Próximo vencimento" error={error}><input className={inputClass} type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Actions busy={busy} onClose={onClose} label="Criar dívida" />
      </form>
    </Sheet>
  );
}
