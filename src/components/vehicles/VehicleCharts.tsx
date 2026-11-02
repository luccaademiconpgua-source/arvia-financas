import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "../ui";
import { formatBrl } from "../../lib/money";
import type { ConsumptionPoint, MonthRow } from "../../lib/vehicle";

const GAS = "#D97706";
const ETH = "#16A34A";
const kmFmt = new Intl.NumberFormat("pt-BR");
const kml = (n: number) => n.toFixed(1).replace(".", ",");

export function ConsumptionChart({ points, average }: { points: ConsumptionPoint[]; average: number | null }) {
  const data = points.slice(-12).map((p) => ({ ...p, label: format(parseISO(p.date), "dd/MM") }));
  return (
    <Card title="Consumo a cada tanque cheio" className="h-full">
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          O consumo aparece a partir do segundo abastecimento com tanque cheio. Registre a quilometragem toda vez que abastecer.
        </p>
      ) : (
        <>
          <div className="h-48" role="img" aria-label={`Consumo em km por litro nos últimos ${data.length} trechos`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                <YAxis tickLine={false} axisLine={false} width={36} domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 11, fill: "#64748B" }} tickFormatter={(v: number) => v.toFixed(0)} />
                {average && <ReferenceLine y={average} stroke="#94A3B8" strokeDasharray="4 4" label={{ value: `média ${kml(average)}`, position: "insideTopRight", fill: "#64748B", fontSize: 11 }} />}
                <Tooltip
                  cursor={{ stroke: "#94A3B8", strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (ConsumptionPoint & { label: string }) | undefined;
                    if (!active || !p) return null;
                    return (
                      <div className="light-tip">
                        <p className="font-medium">{p.label}{p.fuel ? `, ${p.fuel}` : ""}</p>
                        <p className="num">{kml(p.kmPerLiter)} km/L</p>
                        <p className="num text-muted">{kmFmt.format(p.km)} km com {p.liters.toString().replace(".", ",")} L</p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="kmPerLiter"
                  stroke="#0F766E"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={(props: { cx?: number; cy?: number; payload?: ConsumptionPoint; index?: number }) => (
                    <circle key={props.index} cx={props.cx} cy={props.cy} r={5} fill={props.payload?.fuel === "etanol" ? ETH : GAS} stroke="#fff" strokeWidth={2} />
                  )}
                  activeDot={{ r: 7, stroke: "#fff", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: GAS }} /> Gasolina</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: ETH }} /> Etanol</span>
          </div>
        </>
      )}
    </Card>
  );
}

const SERIES = [
  { key: "combustivel", label: "Combustível", color: "#D97706" },
  { key: "servicos", label: "Serviços", color: "#0F766E" },
  { key: "despesas", label: "Outras despesas", color: "#6366F1" },
] as const;

export function MonthlyCostChart({ rows }: { rows: MonthRow[] }) {
  const data = rows.map((r) => ({ ...r, mes: format(parseISO(`${r.ym}-01`), "MMM", { locale: ptBR }).replace(".", "") }));
  const empty = rows.every((r) => r.combustivel + r.servicos + r.despesas === 0);
  return (
    <Card title="Gastos com o veículo por mês" className="h-full">
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}</span>
        ))}
      </div>
      {empty ? (
        <p className="py-8 text-center text-sm text-muted">Sem gastos nos últimos 6 meses.</p>
      ) : (
        <div className="h-52" role="img" aria-label="Gastos com o veículo nos últimos 6 meses, separados por tipo">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: "#64748B" }} tickFormatter={(v: number) => (v >= 100000 ? `${(v / 100000).toFixed(v % 100000 ? 1 : 0).replace(".", ",")}k` : String(Math.round(v / 100)))} />
              <Tooltip
                cursor={{ fill: "rgba(15,118,110,0.06)" }}
                content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as (MonthRow & { mes: string }) | undefined;
                  if (!active || !r) return null;
                  const tot = r.combustivel + r.servicos + r.despesas;
                  return (
                    <div className="light-tip">
                      <p className="font-medium capitalize">{r.mes}: <span className="num">{formatBrl(tot)}</span></p>
                      {SERIES.map((s) => r[s.key] > 0 && <p key={s.key} className="num text-muted">{s.label} {formatBrl(r[s.key])}</p>)}
                      {r.km !== null && <p className="num mt-1">{kmFmt.format(r.km)} km rodados{r.km > 0 ? `, ${formatBrl(Math.round(tot / r.km))} por km` : ""}</p>}
                    </div>
                  );
                }}
              />
              {SERIES.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="#fff" strokeWidth={1} radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
