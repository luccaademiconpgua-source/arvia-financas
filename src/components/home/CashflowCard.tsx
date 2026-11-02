import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "../ui";
import { formatBrl } from "../../lib/money";
import type { CashflowPoint } from "../../lib/calc";

export function CashflowCard({ points }: { points: CashflowPoint[] }) {
  const data = points.map((p) => ({
    mes: format(parseISO(`${p.ym}-01`), "MMM", { locale: ptBR }).replace(".", ""),
    Receitas: p.receitasCents,
    Despesas: p.despesasCents,
  }));
  return (
    <Card title="Fluxo de caixa" className="h-full">
      <div className="mb-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-brand" aria-hidden="true" /> Receitas
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-[#FB7185]" aria-hidden="true" /> Despesas
        </span>
      </div>
      <div className="h-56" role="img" aria-label="Gráfico de receitas e despesas dos últimos 6 meses">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
            <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 12, fill: "#64748B" }} tickFormatter={(v: number) => `${(v / 100000).toString().replace(".", ",")}k`} />
            <Tooltip formatter={(v) => formatBrl(Number(v))} />
            <Line type="monotone" dataKey="Receitas" stroke="#0F766E" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="Despesas" stroke="#FB7185" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
