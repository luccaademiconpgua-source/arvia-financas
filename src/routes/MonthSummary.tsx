import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { Card, Empty } from "../components/ui";
import { txName } from "../components/TransactionRow";
import { useModeData } from "../hooks/useModeData";
import { shiftMonth, todayIso } from "../lib/clock";
import { formatBrl } from "../lib/money";
import { monthReport } from "../lib/monthReport";
import { useBudgets } from "../services/budgets";
import { useNetWorthData } from "../services/networth";

const monthName = (ym: string) => format(parseISO(`${ym}-01`), "MMMM", { locale: ptBR });
const pctTxt = (v: number) => `${Math.abs(v).toFixed(0)}%`;

export function MonthSummary() {
  const [params, setParams] = useSearchParams();
  const lastClosed = shiftMonth(todayIso().slice(0, 7), -1);
  const ym = /^\d{4}-\d{2}$/.test(params.get("mes") ?? "") ? params.get("mes")! : lastClosed;
  const { ready, mode, transactions, categories } = useModeData();
  const { budgets } = useBudgets(mode);
  const nw = useNetWorthData(mode);
  const [showAll, setShowAll] = useState(false);
  if (!ready || !nw.ready) return <Empty>Carregando…</Empty>;

  const r = monthReport({ txs: transactions, categories, ym, budgets, snapshots: nw.snapshots });
  const go = (m: string) => setParams(m === lastClosed ? {} : { mes: m }, { replace: true });
  const isCurrent = ym === todayIso().slice(0, 7);
  const maxCat = Math.max(...r.topCategories.map((c) => c.cents), 1);
  const Name = monthName(ym).replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Mês anterior" onClick={() => go(shiftMonth(ym, -1))} className="flex size-11 items-center justify-center rounded-lg border border-line"><ChevronLeft size={20} aria-hidden="true" /></button>
          <h2 className="font-display text-base font-semibold">Resumo de {monthName(ym)} de {ym.slice(0, 4)}</h2>
          <button type="button" aria-label="Próximo mês" disabled={ym >= todayIso().slice(0, 7)} onClick={() => go(shiftMonth(ym, 1))} className="flex size-11 items-center justify-center rounded-lg border border-line disabled:opacity-40"><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        {isCurrent && <p className="mt-2 text-center text-xs text-muted">Este mês ainda não acabou: os números são parciais.</p>}

        {r.txCount === 0 ? (
          <p className="mt-6 text-center text-sm text-muted">Nenhum lançamento em {monthName(ym)}.</p>
        ) : (
          <>
            <p className="font-display mt-6 text-center text-2xl leading-snug font-semibold text-balance">
              {r.incomeCents === 0
                ? `${Name} teve ${formatBrl(r.expenseCents)} de despesas e nenhuma entrada registrada.`
                : r.leftCents >= 0
                  ? `Em ${monthName(ym)} sobrou ${formatBrl(r.leftCents)}, ${pctTxt(r.leftPct ?? 0)} do que entrou.`
                  : `Em ${monthName(ym)} saiu ${formatBrl(-r.leftCents)} a mais do que entrou.`}
            </p>
            <dl className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-income-bg p-2"><dt className="text-muted">Entrou</dt><dd className="num font-semibold text-income">{formatBrl(r.incomeCents)}</dd></div>
              <div className="rounded-lg bg-expense-bg p-2"><dt className="text-muted">Saiu</dt><dd className="num font-semibold text-expense">{formatBrl(r.expenseCents)}</dd></div>
              <div className="rounded-lg bg-page p-2"><dt className="text-muted">Guardou em metas</dt><dd className="num font-semibold">{formatBrl(r.savedToGoalsCents)}</dd></div>
            </dl>
            {r.expenseChangePct !== null && (
              <p className="mt-3 text-center text-sm text-muted">
                Os gastos {r.expenseChangePct >= 0 ? "subiram" : "caíram"} {pctTxt(r.expenseChangePct)} em relação a {monthName(shiftMonth(ym, -1))}
                {r.expenseCents > 0 ? `. Essenciais foram ${pctTxt((r.essentialCents / r.expenseCents) * 100)} do total.` : "."}
              </p>
            )}
          </>
        )}
      </Card>

      {r.txCount > 0 && (
        <>
          {(r.biggestRise || r.biggestDrop) && (
            <Card title="O que mudou">
              <ul className="space-y-3 text-sm">
                {r.biggestRise && (
                  <li className="flex gap-3">
                    <TrendingUp size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-expense" />
                    <span>
                      <strong>{r.biggestRise.name}</strong> foi o que mais subiu: <span className="num">{formatBrl(r.biggestRise.cents)}</span>, contra <span className="num">{formatBrl(r.biggestRise.avgCents)}</span> na média dos meses anteriores
                      {r.biggestRise.changePct !== null ? ` (${pctTxt(r.biggestRise.changePct)} a mais)` : ""}.
                    </span>
                  </li>
                )}
                {r.biggestDrop && (
                  <li className="flex gap-3">
                    <TrendingDown size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-income" />
                    <span>
                      <strong>{r.biggestDrop.name}</strong> foi a maior economia: <span className="num">{formatBrl(r.biggestDrop.cents)}</span>, contra <span className="num">{formatBrl(r.biggestDrop.avgCents)}</span> na média.
                    </span>
                  </li>
                )}
              </ul>
            </Card>
          )}

          {r.topCategories.length > 0 && (
            <Card title="Onde mais foi o dinheiro">
              <ul className="space-y-2">
                {r.topCategories.map((c) => (
                  <li key={c.categoryId} className="text-sm">
                    <span className="flex justify-between gap-2"><span>{c.name}</span><span className="num font-medium">{formatBrl(c.cents)}</span></span>
                    <span className="mt-1 block h-2 rounded-full bg-page" aria-hidden="true"><span className="block h-2 rounded-full bg-brand" style={{ width: `${(c.cents / maxCat) * 100}%` }} /></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {r.biggestExpenses.length > 0 && (
            <Card title="Maiores gastos">
              <ul className="divide-y divide-line text-sm">
                {(showAll ? r.biggestExpenses : r.biggestExpenses.slice(0, 3)).map((t) => (
                  <li key={t.id} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{txName(t)} <span className="text-muted">em {format(parseISO(t.date), "dd/MM")}</span></span>
                    <span className="num shrink-0 font-medium">{formatBrl(t.amountCents)}</span>
                  </li>
                ))}
              </ul>
              {r.biggestExpenses.length > 3 && !showAll && <button type="button" className="mt-1 min-h-11 text-sm text-brand" onClick={() => setShowAll(true)}>Ver os 5 maiores</button>}
            </Card>
          )}

          {r.budgets.length > 0 && (
            <Card title="Orçamento">
              <p className="text-sm text-muted">
                {r.budgets.filter((b) => !b.over).length} de {r.budgets.length} categorias ficaram dentro do limite.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {r.budgets.map((b) => (
                  <li key={b.name} className="flex justify-between gap-2">
                    <span>{b.name}</span>
                    <span className={`num ${b.over ? "text-expense" : "text-income"}`}>{formatBrl(b.spentCents)} de {formatBrl(b.limitCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Patrimônio">
            {r.netWorth ? (
              <p className="text-sm">
                Fechou {monthName(ym)} em <strong className="num">{formatBrl(r.netWorth.endCents)}</strong>
                {r.netWorth.prevCents !== null && (
                  <span className={r.netWorth.endCents >= r.netWorth.prevCents ? "text-income" : "text-expense"}>
                    {", "}
                    {r.netWorth.endCents >= r.netWorth.prevCents ? "subiu" : "caiu"} <span className="num">{formatBrl(Math.abs(r.netWorth.endCents - r.netWorth.prevCents))}</span> no mês
                  </span>
                )}
                .
              </p>
            ) : (
              <p className="text-sm text-muted">
                Sem registro do patrimônio neste mês. A Arvia guarda o valor sozinha a cada mês em que o app é usado; veja a tela de <Link to="/patrimonio" className="text-brand underline">Patrimônio</Link>.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
