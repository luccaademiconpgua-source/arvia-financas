import { useState } from "react";
import { Link } from "react-router";
import { Banknote, CreditCard, Landmark, PiggyBank } from "lucide-react";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton } from "../components/Sheet";
import { GlassStage } from "../components/dashboard/GlassStage";
import { useModeData } from "../hooks/useModeData";
import { accountBalanceCents } from "../lib/calc";
import { formatBrl, parseBrlToCents } from "../lib/money";
import { walletSummary } from "../lib/wallet";
import { supabase } from "../lib/supabase";
import { adjustBalance } from "../store/actions";
import { useRefresh } from "../store/refresh";
import { useUI } from "../store/ui";
import type { Account, Mode } from "../types";

const TYPE_LABEL = { corrente: "Conta corrente", digital: "Conta digital", dinheiro: "Dinheiro", investimento: "Investimento" } as const;

export function Wallet() {
  const { ready, mode, accounts, cards, transactions } = useModeData();
  if (!ready) return <Empty>Carregando…</Empty>;
  const s = walletSummary(accounts, cards, transactions);
  const cash = accounts.filter((a) => a.type === "dinheiro");
  const banks = accounts.filter((a) => a.type === "corrente" || a.type === "digital");
  const invest = accounts.filter((a) => a.type === "investimento");
  const tiles = [
    { label: "Em dinheiro", value: s.cashCents, Icon: Banknote },
    { label: "Nas contas", value: s.accountsCents, Icon: Landmark },
    { label: "Limite livre nos cartões", value: s.creditAvailableCents, Icon: CreditCard },
    { label: "Investido", value: s.investedCents, Icon: PiggyBank },
  ];

  return (
    <div className="flex flex-col gap-4">
      <GlassStage label="Resumo da carteira">
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="glass p-4 lg:col-span-5">
            <p className="text-sm text-white/75">Disponível agora</p>
            <p className="num font-display mt-1 text-[34px] leading-tight font-semibold tracking-tight">{formatBrl(s.availableNowCents)}</p>
            <p className="text-sm text-white/70">dinheiro em mãos mais o saldo das contas</p>
            <div className="mt-4 border-t border-white/15 pt-3">
              <p className="text-sm text-white/75">Contando o limite livre dos cartões</p>
              <p className="num font-display text-xl font-semibold">{formatBrl(s.withCreditCents)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:col-span-7">
            {tiles.map(({ label, value, Icon }) => (
              <div key={label} className="glass flex flex-col justify-center p-3 sm:p-4">
                <p className="flex items-center gap-1.5 text-xs text-white/75 sm:text-sm"><Icon size={16} aria-hidden="true" /> {label}</p>
                <p className="num font-display mt-1 text-lg font-semibold sm:text-2xl">{formatBrl(value)}</p>
              </div>
            ))}
          </div>
        </div>
      </GlassStage>

      <Card title="Dinheiro em mãos">
        {cash.length === 0 ? (
          <NewCashAccount mode={mode} />
        ) : (
          <ul className="divide-y divide-line">
            {cash.map((a) => <CashRow key={a.id} account={a} balance={accountBalanceCents(a, transactions)} />)}
          </ul>
        )}
      </Card>

      <Card title="Contas">
        {banks.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma conta neste modo. <Link to="/contas" className="text-brand underline">Criar conta</Link></p>
        ) : (
          <ul className="divide-y divide-line">
            {banks.map((a) => {
              const b = accountBalanceCents(a, transactions);
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="text-xs text-muted">
                      {TYPE_LABEL[a.type]}
                      {a.openFinance?.status === "conectada" ? ", saldo vindo do banco" : ""}
                    </span>
                  </span>
                  <span className={`num shrink-0 font-semibold ${b < 0 ? "text-danger" : ""}`}>{formatBrl(b)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Cartões de crédito">
        {s.cards.length === 0 ? (
          <p className="text-sm text-muted">Nenhum cartão neste modo. <Link to="/cartoes" className="text-brand underline">Ver cartões</Link></p>
        ) : (
          <ul className="divide-y divide-line">
            {s.cards.map(({ card, usedCents, limitCents, availableCents }) => {
              const pct = limitCents ? Math.min(100, (usedCents / limitCents) * 100) : 0;
              return (
                <li key={card.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{card.label} final {card.last4}</span>
                    {availableCents === null ? (
                      <Link to={`/cartoes/${card.id}`} className="text-sm text-brand underline">Informar limite</Link>
                    ) : (
                      <span className="num shrink-0 font-semibold">{formatBrl(availableCents)} livre</span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    Em aberto {formatBrl(usedCents)}
                    {limitCents !== null ? ` de ${formatBrl(limitCents)} de limite` : ""}
                  </p>
                  {limitCents !== null && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${Math.round(pct)}% do limite usado`}>
                      <div className={`h-1.5 rounded-full ${pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warn" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {invest.length > 0 && (
        <Card title="Investimentos">
          <ul className="divide-y divide-line">
            {invest.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-3">
                <span className="truncate font-medium">{a.name}</span>
                <span className="num font-semibold">{formatBrl(accountBalanceCents(a, transactions))}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Investimentos não entram no "disponível agora", porque normalmente não são usados no dia a dia.</p>
        </Card>
      )}
    </div>
  );
}

function CashRow({ account, balance }: { account: Account; balance: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const showToast = useUI((s) => s.showToast);
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{account.name}</span>
        <span className="flex items-center gap-2">
          <span className={`num font-semibold ${balance < 0 ? "text-danger" : ""}`}>{formatBrl(balance)}</span>
          {balance < 0 && <Pill tone="danger">Confira</Pill>}
        </span>
      </div>
      {!editing ? (
        <SecondaryButton type="button" className="mt-2" onClick={() => { setValue((balance / 100).toFixed(2).replace(".", ",")); setEditing(true); }}>
          Contei o dinheiro
        </SecondaryButton>
      ) : (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const c = parseBrlToCents(value);
            if (c === null || c < 0) return setError("Informe quanto tem, como 85,00.");
            if (c === balance) return setEditing(false);
            void adjustBalance(account.id, c).then(() => { showToast("Valor da carteira atualizado"); setEditing(false); }).catch((err: Error) => setError(err.message));
          }}
        >
          <Field label="Quanto tem agora" error={error}><input className={`${inputClass} w-36`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus /></Field>
          <PrimaryButton type="submit">Salvar</PrimaryButton>
          <SecondaryButton type="button" onClick={() => setEditing(false)}>Cancelar</SecondaryButton>
        </form>
      )}
    </li>
  );
}

function NewCashAccount({ mode }: { mode: Mode }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const showToast = useUI((s) => s.showToast);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const c = value.trim() === "" ? 0 : parseBrlToCents(value);
        if (c === null || c < 0) return setError("Informe quanto tem, como 85,00.");
        void supabase
          .from("accounts")
          .insert({ scope: mode, name: "Carteira", type: "dinheiro", opening_balance_cents: c })
          .then(({ error: err }) => {
            if (err) return setError(err.message);
            useRefresh.getState().bump();
            showToast("Carteira criada");
          });
      }}
    >
      <p className="text-sm text-muted">Registre quanto você tem em dinheiro vivo. Gastos em dinheiro lançados nessa carteira descontam daqui.</p>
      <Field label="Quanto tem em dinheiro" error={error}><input className={inputClass} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" /></Field>
      <PrimaryButton type="submit" className="self-start">Criar carteira</PrimaryButton>
    </form>
  );
}
