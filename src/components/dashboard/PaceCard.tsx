import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../ui";
import { formatBrl } from "../../lib/money";
import { pace, paceDelta } from "../../lib/dashboard";
import { shiftMonth } from "../../lib/clock";
import { compact, monthLong } from "./DashboardHero";
import type { Transaction } from "../../types";

const CUR = "var(--color-pace)";
const PREV = "var(--color-pace-prev)";

function Tip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number | null }>; label?: number }) {
  if (!active || !payload?.length) return null;
  const cur = payload.find((p) => p.dataKey === "atual")?.value;
  const prev = payload.find((p) => p.dataKey === "anterior")?.value;
  return (
    <div className="light-tip">
      <p className="font-medium">Até o dia {label}</p>
      {cur != null && <p className="num">Mês escolhido {formatBrl(cur)}</p>}
      {prev != null && <p className="num text-muted">Mês anterior {formatBrl(prev)}</p>}
    </div>
  );
}

export function PaceCard({ transactions, ym, today }: { transactions: Transaction[]; ym: string; today: string }) {
  const prevYm = shiftMonth(ym, -1);
  const data = pace(transactions, ym, prevYm, today);
  const d = paceDelta(data);
  const empty = data.every((p) => !p.atual && !p.anterior);
  return (
    <Card title={`Ritmo de gastos em ${monthLong(ym)}`} className="h-full">
      <div className="mb-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 rounded" style={{ background: CUR }} /> <span className="capitalize">{monthLong(ym)}</span></span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 rounded border-t-2 border-dashed" style={{ borderColor: PREV }} /> <span className="capitalize">{monthLong(prevYm)}</span></span>
      </div>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted">Sem despesas nestes dois meses.</p>
      ) : (
        <div className="h-48" role="img" aria-label={`Despesas acumuladas dia a dia em ${monthLong(ym)}, comparadas com ${monthLong(prevYm)}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CUR} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={CUR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} interval={6} tick={{ fontSize: 12, fill: "var(--color-muted)" }} />
              <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickFormatter={compact} />
              <Tooltip content={<Tip />} cursor={{ stroke: "var(--color-pace-prev)", strokeDasharray: "3 3" }} />
              <Line type="monotone" dataKey="anterior" stroke={PREV} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
              <Area type="monotone" dataKey="atual" stroke={CUR} strokeWidth={2} fill="url(#paceFill)" dot={false} activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {d && (d.atual > 0 || d.anterior > 0) && (
        <p className="mt-2 text-sm text-muted">
          Até o dia {d.day} você gastou <span className="num font-medium text-ink">{formatBrl(d.atual)}</span>,{" "}
          {d.delta === 0 ? "o mesmo que no mês anterior" : (
            <>
              <span className="num font-medium text-ink">{formatBrl(Math.abs(d.delta))}</span> {d.delta > 0 ? "a mais" : "a menos"} que no mesmo ponto do mês anterior
            </>
          )}
          .
        </p>
      )}
    </Card>
  );
}
