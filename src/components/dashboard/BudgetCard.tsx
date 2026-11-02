import { Link } from "react-router";
import { Card } from "../ui";
import { formatBrl } from "../../lib/money";
import { budgetLines } from "../../lib/budget";
import { useBudgets } from "../../services/budgets";
import type { Category, Mode, Transaction } from "../../types";

const BAR = { ok: "bg-brand", alerta: "bg-warn", estourou: "bg-danger" } as const;

export function BudgetCard({ mode, transactions, categories, today }: { mode: Mode; transactions: Transaction[]; categories: Category[]; today: string }) {
  const { ready, budgets } = useBudgets(mode);
  const lines = budgetLines(budgets, transactions, today.slice(0, 7), today).slice(0, 4);
  return (
    <Card title="Orçamento do mês" className="h-full">
      {!ready ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted">Defina um teto por categoria para acompanhar aqui quanto ainda pode gastar.</p>
      ) : (
        <ul className="space-y-3">
          {lines.map((l) => (
            <li key={l.categoryId}>
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate">{categories.find((c) => c.id === l.categoryId)?.name}</span>
                <span className={`num shrink-0 ${l.remainingCents < 0 ? "text-danger" : "text-muted"}`}>
                  {l.remainingCents >= 0 ? `sobram ${formatBrl(l.remainingCents)}` : `passou ${formatBrl(-l.remainingCents)}`}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                <div className={`h-1.5 rounded-full ${BAR[l.state]}`} style={{ width: `${Math.min(100, l.pct * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link to="/orcamento" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-4">
        {lines.length ? "Ver orçamento" : "Montar orçamento"}
      </Link>
    </Card>
  );
}
