import { BalanceCard } from "../components/home/BalanceCard";
import { CardOverview } from "../components/home/CardOverview";
import { CashflowCard } from "../components/home/CashflowCard";
import { GoalsStrip } from "../components/home/GoalsStrip";
import { HealthCard } from "../components/home/HealthCard";
import { RecentCard } from "../components/home/RecentCard";
import { SpendingCard } from "../components/home/SpendingCard";
import { SummaryCard } from "../components/home/SummaryCard";
import { Empty } from "../components/ui";
import { useModeData } from "../hooks/useModeData";
import { cashflow, expenseByCategory, goalSavedCents, healthScore, inMonth, summarize, worstInvoiceStatus } from "../lib/calc";
import { todayIso } from "../lib/clock";

export function Home() {
  const { ready, accounts, cards, categories, transactions, goals, debts } = useModeData();
  if (!ready) return <Empty>Carregando…</Empty>;
  const today = todayIso();
  const ym = today.slice(0, 7);
  const month = summarize(transactions, "mes", today);
  const emergency = goals.find((g) => g.kind === "emergencia");
  const parcelas = inMonth(transactions, ym).filter((t) => t.type === "despesa" && categories.find((c) => c.id === t.categoryId)?.name === "Parcelas").reduce((s, t) => s + t.amountCents, 0);
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
      <div className="lg:col-span-4"><BalanceCard accounts={accounts} transactions={transactions} /></div>
      <div className="lg:col-span-5"><SummaryCard transactions={transactions} today={today} /></div>
      <div className="lg:col-span-3"><HealthCard health={health} /></div>
      <div className="lg:col-span-7"><CashflowCard points={cashflow(transactions, today, 6)} /></div>
      <div className="lg:col-span-5"><SpendingCard slices={expenseByCategory(transactions, ym, categories)} /></div>
      <div className="lg:col-span-5"><CardOverview cards={cards} transactions={transactions} today={today} /></div>
      <div className="lg:col-span-7"><RecentCard transactions={transactions} lookups={lookups} /></div>
      <div className="lg:col-span-12"><GoalsStrip goals={goals} debts={debts} transactions={transactions} /></div>
    </div>
  );
}
