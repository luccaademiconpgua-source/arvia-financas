import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../ui";
import { formatBrl } from "../../lib/money";
import type { BalancePoint } from "../../lib/calc";
import { useReducedMotion } from "../../hooks/useReducedMotion";

const label = (ym: string) => format(parseISO(`${ym}-01`), "MMM yy", { locale: ptBR }).replace(".", "");

function Tip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { ym: string; cents: number } }> }) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div className="light-tip">
      <p className="font-medium">Fim de {format(parseISO(`${p.ym}-01`), "MMMM 'de' yyyy", { locale: ptBR })}</p>
      <p className="num">{formatBrl(p.cents)}</p>
    </div>
  );
}

/** Evolução do saldo das contas nos últimos 12 meses, com a variação desde o primeiro mês. */
export function BalanceCard({ points }: { points: BalancePoint[] }) {
  const reduced = useReducedMotion();
  const last = points[points.length - 1]?.cents ?? 0;
  const first = points[0]?.cents ?? 0;
  const pct = first > 0 ? ((last - first) / first) * 100 : null;
  const data = points.map((p) => ({ ...p, mes: label(p.ym) }));
  const flat = points.every((p) => p.cents === first);
  return (
    <Card className="h-full">
      <h2 className="card-title">Evolução do saldo</h2>
      <p className="mt-1 text-sm text-muted">Quanto tinha nas contas no fim de cada mês, nos últimos 12 meses.</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
        <p className="num font-display text-3xl font-semibold tracking-tight">{formatBrl(last)}</p>
        {pct !== null && Math.abs(pct) >= 0.1 && (
          <p className={`num text-sm font-medium ${pct >= 0 ? "text-income" : "text-danger"}`}>
            {pct >= 0 ? "+" : "−"}{Math.abs(pct).toFixed(1).replace(".", ",")}% em 12 meses
          </p>
        )}
      </div>
      {flat ? (
        <p className="py-8 text-center text-sm text-muted">Ainda não há movimento suficiente para desenhar a evolução.</p>
      ) : (
        <div className="mt-2 h-44" role="img" aria-label={`Saldo no fim de cada mês, de ${data[0]?.mes} a ${data[data.length - 1]?.mes}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-pace)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-pace)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="mes" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip content={<Tip />} cursor={{ stroke: "var(--color-pace-prev)", strokeDasharray: "3 3" }} />
              <Area
                type="monotone"
                dataKey="cents"
                stroke="var(--color-pace)"
                strokeWidth={2}
                fill="url(#balFill)"
                dot={false}
                activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2 }}
                isAnimationActive={!reduced}
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
