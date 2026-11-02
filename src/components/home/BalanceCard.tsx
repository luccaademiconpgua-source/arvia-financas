import { Link } from "react-router";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatDistanceStrict, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { nowIso } from "../../lib/clock";
import { formatBrl } from "../../lib/money";
import { totalBalanceCents } from "../../lib/calc";
import { useUI } from "../../store/ui";
import type { Account, Transaction } from "../../types";

export function BalanceCard({ accounts, transactions }: { accounts: Account[]; transactions: Transaction[] }) {
  const openTx = useUI((s) => s.openTx);
  const total = totalBalanceCents(accounts, transactions);
  const synced = accounts
    .map((a) => (a.openFinance?.status === "demo" || a.openFinance?.status === "conectada" ? a.openFinance.syncedAt : undefined))
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);
  const connected = accounts.some((a) => a.openFinance?.status === "demo" || a.openFinance?.status === "conectada");
  return (
    <section aria-label="Saldo total" className="flex h-full flex-col rounded-card bg-brand-dark p-5 text-white shadow-card">
      <h2 className="text-[13px] font-medium tracking-[0.08em] text-white/70 uppercase">Saldo total</h2>
      <p className="num mt-2 text-[32px] leading-tight font-semibold">{formatBrl(total)}</p>
      <p className="mt-1 text-sm text-white/80">
        {accounts.length} {accounts.length === 1 ? "conta ativa" : "contas ativas"}
      </p>
      <p className="mt-1 text-sm text-white/70">
        {connected ? `Demonstração${synced ? ` · atualizado ${formatDistanceStrict(parseISO(synced), parseISO(nowIso()), { locale: ptBR, addSuffix: true })}` : ""}` : "Nenhum banco conectado"}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => openTx({ type: "receita" })} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white/15 text-sm font-medium hover:bg-white/25">
          <ArrowDownLeft size={16} aria-hidden="true" /> Receita
        </button>
        <button type="button" onClick={() => openTx({ type: "despesa" })} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white/15 text-sm font-medium hover:bg-white/25">
          <ArrowUpRight size={16} aria-hidden="true" /> Despesa
        </button>
      </div>
      <Link to="/contas" className="mt-auto inline-flex min-h-11 items-center pt-2 text-sm font-medium underline underline-offset-4">
        Ver contas
      </Link>
    </section>
  );
}
