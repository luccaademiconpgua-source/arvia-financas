import { useState } from "react";
import { CardOverview } from "../components/home/CardOverview";
import { GoalsStrip } from "../components/home/GoalsStrip";
import { HealthCard } from "../components/home/HealthCard";
import { RecentCard } from "../components/home/RecentCard";
import { DashboardHero } from "../components/dashboard/DashboardHero";
import { PaceCard } from "../components/dashboard/PaceCard";
import { CategoryCard } from "../components/dashboard/CategoryCard";
import { ProjectionCard } from "../components/dashboard/ProjectionCard";
import { BudgetCard } from "../components/dashboard/BudgetCard";
import { BalanceCard } from "../components/dashboard/BalanceCard";
import { Empty } from "../components/ui";
import { useModeData } from "../hooks/useModeData";
import { goalPlan } from "../lib/goals";
import { balanceHistory, cashflow, healthScore, inMonth, summarize, totalBalanceCents, worstInvoiceStatus } from "../lib/calc";
import { todayIso } from "../lib/clock";

export function Home() {
  const { ready, mode, accounts, cards, categories, transactions, goals, debts } = useModeData();
  const today = todayIso();
  const [ym, setYm] = useState(today.slice(0, 7));
  if (!ready) return <Empty>Carregando…</Empty>;
  const thisYm = today.slice(0, 7);
  const month = summarize(transactions, "mes", today);
  const emergency = goals.find((g) => g.kind === "emergencia");
  const emergencyPlan = emergency ? goalPlan(emergency, { txs: transactions, accounts, categories, assets: [], today }) : null;
  const parcelas = inMonth(transactions, thisYm).filter((t) => t.type === "despesa" && !t.isTransfer && categories.find((c) => c.id === t.categoryId)?.name === "Parcelas").reduce((s, t) => s + t.amountCents, 0);
  const limit = cards.reduce((s, c) => s + (c.limitCents ?? 0), 0);
  const used = cards.reduce((s, c) => s + c.invoices.filter((i) => i.status !== "paga").reduce((x, i) => x + i.amountCents, 0), 0);
  const health = healthScore({
    receitasCents: month.receitasCents,
    sobrouCents: month.sobrouCents,
    hasOverdueInvoice: cards.some((c) => worstInvoiceStatus(c) === "vencida"),
    emergencySavedCents: emergencyPlan?.savedCents ?? 0,
    emergencyTargetCents: emergencyPlan?.targetCents ?? 0,
    parcelasCents: parcelas,
    cardUsage: limit > 0 ? used / limit : null,
  });
  const lookups = { categories, accounts, cards };
  const balance = totalBalanceCents(accounts, transactions);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <DashboardHero
          totalCents={balance}
          accountsCount={accounts.length}
          points={cashflow(transactions, today, 6)}
          selected={ym}
          onSelect={setYm}
        />
      </div>
      <div className="lg:col-span-7"><BalanceCard points={balanceHistory(transactions, balance, today, 12)} /></div>
      <div className="lg:col-span-5"><HealthCard health={health} /></div>
      <div className="lg:col-span-7"><PaceCard transactions={transactions} ym={ym} today={today} /></div>
      <div className="lg:col-span-5"><CategoryCard transactions={transactions} categories={categories} ym={ym} /></div>
      <div className="lg:col-span-6"><ProjectionCard mode={mode} balanceCents={balance} transactions={transactions} cards={cards} today={today} /></div>
      <div className="lg:col-span-6"><BudgetCard mode={mode} transactions={transactions} categories={categories} today={today} /></div>
      <div className="lg:col-span-6"><CardOverview cards={cards} transactions={transactions} today={today} /></div>
      <div className="lg:col-span-6"><RecentCard transactions={transactions} lookups={lookups} /></div>
      <div className="lg:col-span-12"><GoalsStrip goals={goals} debts={debts} transactions={transactions} /></div>
    </div>
  );
}
