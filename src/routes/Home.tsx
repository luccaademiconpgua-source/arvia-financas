import { useState } from "react";
import { CardOverview } from "../components/home/CardOverview";
import { GoalsStrip } from "../components/home/GoalsStrip";
import { HealthCard } from "../components/home/HealthCard";
import { RecentCard } from "../components/home/RecentCard";
import { DashboardHero } from "../components/dashboard/DashboardHero";
import { PaceCard } from "../components/dashboard/PaceCard";
import { CategoryCard } from "../components/dashboard/CategoryCard";
import { ProjectionCard } from "../components/dashboard/ProjectionCard";
import { Empty } from "../components/ui";
import { useModeData } from "../hooks/useModeData";
import { cashflow, goalSavedCents, healthScore, inMonth, summarize, totalBalanceCents, worstInvoiceStatus } from "../lib/calc";
import { todayIso } from "../lib/clock";

export function Home() {
  const { ready, mode, accounts, cards, categories, transactions, goals, debts } = useModeData();
  const today = todayIso();
  const [ym, setYm] = useState(today.slice(0, 7));
  if (!ready) return <Empty>Carregando…</Empty>;
  const thisYm = today.slice(0, 7);
  const month = summarize(transactions, "mes", today);
  const emergency = goals.find((g) => g.kind === "emergencia");
  const parcelas = inMonth(transactions, thisYm).filter((t) => t.type === "despesa" && !t.isTransfer && categories.find((c) => c.id === t.categoryId)?.name === "Parcelas").reduce((s, t) => s + t.amountCents, 0);
  const limit = cards.reduce((s, c) => s + (c.limitCents ?? 0), 0);
  const used = cards.reduce((s, c) => s + c.invoices.filter((i) => i.status !== "paga").reduce((x, i) => x + i.amountCents, 0), 0);
  const health = healthScore({
    receitasCents: month.receitasCents,
    sobrouCents: month.sobrouCents,
    hasOverdueInvoice: cards.some((c) => worstInvoiceStatus(c) === "vencida"),
    emergencySavedCents: emergency ? goalSavedCents(emergency, transactions) : 0,
    emergencyTargetCents: emergency?.targetCents ?? 0,
    parcelasCents: parcelas,
    cardUsage: limit > 0 ? used / limit : null,
  });
  const lookups = { categories, accounts, cards };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <DashboardHero
          totalCents={totalBalanceCents(accounts, transactions)}
          accountsCount={accounts.length}
          points={cashflow(transactions, today, 6)}
          selected={ym}
          onSelect={setYm}
        />
      </div>
      <div className="lg:col-span-7"><PaceCard transactions={transactions} ym={ym} today={today} /></div>
      <div className="lg:col-span-5"><CategoryCard transactions={transactions} categories={categories} ym={ym} /></div>
      <div className="lg:col-span-5"><ProjectionCard mode={mode} balanceCents={totalBalanceCents(accounts, transactions)} transactions={transactions} cards={cards} today={today} /></div>
      <div className="lg:col-span-3"><HealthCard health={health} /></div>
      <div className="lg:col-span-4"><CardOverview cards={cards} transactions={transactions} today={today} /></div>
      <div className="lg:col-span-12"><RecentCard transactions={transactions} lookups={lookups} /></div>
      <div className="lg:col-span-12"><GoalsStrip goals={goals} debts={debts} transactions={transactions} /></div>
    </div>
  );
}
