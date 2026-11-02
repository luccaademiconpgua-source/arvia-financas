import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, Empty } from "../ui";
import { formatBrl } from "../../lib/money";
import type { CategorySlice } from "../../lib/calc";

export const sliceColors = ["#0F766E", "#FB7185", "#F59E0B", "#6366F1", "#94A3B8"];

export function SpendingCard({ slices }: { slices: CategorySlice[] }) {
  const top = slices[0];
  return (
    <Card title="Gastos por categoria" className="h-full">
      {!top ? (
        <Empty>Sem despesas neste mês.</Empty>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="relative size-44 shrink-0" role="img" aria-label={`Maior gasto: ${top.name}, ${top.pct}%`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="cents" nameKey="name" innerRadius={56} outerRadius={80} paddingAngle={2} stroke="none" isAnimationActive={false}>
                  {slices.map((s, i) => (
                    <Cell key={s.name} fill={sliceColors[i % sliceColors.length] ?? "#94A3B8"} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-muted">Maior gasto</span>
              <span className="num text-lg font-semibold">{top.pct.toString().replace(".", ",")}%</span>
            </div>
          </div>
          <ul className="w-full space-y-2 text-sm">
            {slices.map((s, i) => (
              <li key={s.name} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: sliceColors[i % sliceColors.length] }} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="num font-medium">{formatBrl(s.cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
