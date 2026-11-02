import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card } from "../ui";
import { formatBrl } from "../../lib/money";
import { expenseByCategory } from "../../lib/calc";
import { topExpenses } from "../../lib/dashboard";
import { useUI } from "../../store/ui";
import { monthLong } from "./DashboardHero";
import type { Category, Transaction } from "../../types";

// ordem fixa: a cor acompanha a posição no ranking do mês, o "Outras categorias" é sempre cinza
const COLORS = ["#0F766E", "#E11D48", "#D97706", "#4F46E5"];
const OTHER = "#94A3B8";
const colorFor = (name: string, i: number) => (name === "Outras categorias" ? OTHER : (COLORS[i] ?? OTHER));

export function CategoryCard({ transactions, categories, ym }: { transactions: Transaction[]; categories: Category[]; ym: string }) {
  const slices = expenseByCategory(transactions, ym, categories);
  const [active, setActive] = useState(0);
  const openDetail = useUI((s) => s.openDetail);
  const idx = Math.min(active, Math.max(0, slices.length - 1));
  const cur = slices[idx];
  const total = slices.reduce((s, x) => s + x.cents, 0);
  const tops = cur && cur.name !== "Outras categorias" ? topExpenses(transactions, ym, cur.name, categories) : [];

  return (
    <Card title={`Para onde foi o dinheiro em ${monthLong(ym)}`} className="h-full">
      {!cur ? (
        <p className="py-10 text-center text-sm text-muted">Sem despesas neste mês.</p>
      ) : (
        <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
          <div className="relative mx-auto size-44" role="img" aria-label={`${cur.name}: ${cur.pct}% das despesas`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="cents"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                  onMouseEnter={(_, i) => setActive(i)}
                  onClick={(_, i) => setActive(i)}
                  isAnimationActive={false}
                >
                  {slices.map((s, i) => <Cell key={s.name} fill={colorFor(s.name, i)} fillOpacity={i === idx ? 1 : 0.35} className="cursor-pointer outline-none" />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <span className="line-clamp-2 text-xs text-muted">{cur.name}</span>
              <span className="num font-display text-xl font-semibold">{cur.pct.toString().replace(".", ",")}%</span>
            </div>
          </div>

          <div className="min-w-0">
            <ul className="space-y-1" aria-label="Categorias">
              {slices.map((s, i) => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    onMouseEnter={() => setActive(i)}
                    aria-pressed={i === idx}
                    className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm ${i === idx ? "bg-page font-medium" : "hover:bg-page"}`}
                  >
                    <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: colorFor(s.name, i) }} />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="num">{formatBrl(s.cents)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 px-2 text-xs text-muted">Total de despesas: <span className="num">{formatBrl(total)}</span></p>
            {tops.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="px-2 text-xs text-muted">Maiores gastos em {cur.name}</p>
                <ul>
                  {tops.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => openDetail(t.id)} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-sm hover:bg-page">
                        <span className="min-w-0 truncate">{t.merchant || t.description}</span>
                        <span className="num shrink-0">{formatBrl(t.amountCents)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
