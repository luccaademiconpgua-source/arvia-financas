import { Link } from "react-router";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassStage } from "./GlassStage";
import { formatBrl } from "../../lib/money";
import type { CashflowPoint } from "../../lib/calc";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useUI } from "../../store/ui";

const monthShort = (ym: string) => format(parseISO(`${ym}-01`), "MMM", { locale: ptBR }).replace(".", "");
export const monthLong = (ym: string) => format(parseISO(`${ym}-01`), "MMMM", { locale: ptBR });

const INCOME = "var(--color-chart-income)";
const EXPENSE = "var(--color-chart-expense)";

type Props = {
  totalCents: number;
  accountsCount: number;
  points: CashflowPoint[];
  selected: string;
  onSelect: (ym: string) => void;
};

export function compact(cents: number) {
  const v = cents / 100;
  if (Math.abs(v) < 1000) return v.toFixed(0);
  const k = v / 1000;
  const txt = Math.abs(k) >= 10 || Number.isInteger(k) ? Math.round(k).toString() : k.toFixed(1).replace(".", ",");
  return `${txt}k`;
}

function TipContent({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: { ym: string; receitas: number; despesas: number } }>; label?: string }) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div className="glass-tip">
      <p className="font-medium capitalize">{label}</p>
      <p className="num">Receitas {formatBrl(p.receitas)}</p>
      <p className="num">Despesas {formatBrl(p.despesas)}</p>
      <p className="mt-1 text-xs text-white/70">Toque para ver este mês</p>
    </div>
  );
}

export function DashboardHero({ totalCents, accountsCount, points, selected, onSelect }: Props) {
  const openTx = useUI((s) => s.openTx);
  const reduced = useReducedMotion();
  const data = points.map((p) => ({ ym: p.ym, mes: monthShort(p.ym), receitas: p.receitasCents, despesas: p.despesasCents }));
  const sel = points.find((p) => p.ym === selected) ?? points[points.length - 1];
  const rec = sel?.receitasCents ?? 0;
  const desp = sel?.despesasCents ?? 0;
  const sobrou = rec - desp;
  const pct = rec > 0 ? Math.round((sobrou / rec) * 100) : null;
  const pick = (d: unknown) => {
    const ym = (d as { payload?: { ym?: string } } | undefined)?.payload?.ym;
    if (ym) onSelect(ym);
  };

  return (
    <GlassStage label="Painel do mês">
      <div className="grid gap-3 lg:grid-cols-12">
        <div className="glass flex flex-col p-4 lg:col-span-4">
          <h2 className="text-sm text-white/75">Saldo total</h2>
          <p className="num font-display mt-1 text-[34px] leading-tight font-semibold tracking-tight">{formatBrl(totalCents)}</p>
          <p className="mt-1 text-sm text-white/70">
            {accountsCount} {accountsCount === 1 ? "conta" : "contas"}{" "}
            <Link to="/carteira" className="underline underline-offset-4 hover:text-white">ver carteira</Link>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:mt-auto lg:pt-4">
            <button type="button" onClick={() => openTx({ type: "receita" })} className="glass-button flex min-h-11 items-center justify-center gap-2 text-sm font-medium">
              <ArrowDownLeft size={16} aria-hidden="true" /> Receita
            </button>
            <button type="button" onClick={() => openTx({ type: "despesa" })} className="glass-button flex min-h-11 items-center justify-center gap-2 text-sm font-medium">
              <ArrowUpRight size={16} aria-hidden="true" /> Despesa
            </button>
          </div>
        </div>

        <div className="glass p-4 lg:col-span-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-semibold">Receitas e despesas</h2>
            <div className="flex gap-3 text-xs text-white/80">
              <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: INCOME }} /> Receitas</span>
              <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: EXPENSE }} /> Despesas</span>
            </div>
          </div>
          {data.every((d) => d.receitas === 0 && d.despesas === 0) ? (
            <p className="flex h-44 items-center justify-center text-center text-sm text-white/75 sm:h-48">Sem lançamentos nos últimos 6 meses. Registre uma receita ou despesa para ver o gráfico.</p>
          ) : (
          <div className="mt-2 h-44 sm:h-48" role="img" aria-label="Receitas e despesas dos últimos 6 meses. Toque num mês para ver os detalhes dele.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
                <XAxis dataKey="mes" hide />
                <YAxis tickLine={false} axisLine={false} width={38} tick={{ fontSize: 11, fill: "rgba(255,255,255,0.55)" }} tickFormatter={compact} />
                <Tooltip content={<TipContent />} cursor={{ fill: "rgba(255,255,255,0.08)", radius: 8 }} />
                <Bar dataKey="receitas" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={!reduced} animationDuration={700} onClick={pick} className="cursor-pointer">
                  {data.map((d) => <Cell key={d.ym} fill={INCOME} fillOpacity={d.ym === sel?.ym ? 1 : 0.4} />)}
                </Bar>
                <Bar dataKey="despesas" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={!reduced} animationDuration={700} animationBegin={120} onClick={pick} className="cursor-pointer">
                  {data.map((d) => <Cell key={d.ym} fill={EXPENSE} fillOpacity={d.ym === sel?.ym ? 1 : 0.4} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
          <div role="tablist" aria-label="Escolher mês" className="mt-2 flex gap-1 overflow-x-auto">
            {data.map((d) => (
              <button
                key={d.ym}
                type="button"
                role="tab"
                aria-selected={d.ym === sel?.ym}
                onClick={() => onSelect(d.ym)}
                className={`min-h-9 flex-1 rounded-lg px-2 text-xs font-medium capitalize ${d.ym === sel?.ym ? "bg-white text-abyss" : "text-white/75 hover:bg-white/10"}`}
              >
                {d.mes}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:col-span-12">
          <div className="glass min-w-0 p-2.5 sm:p-4">
            <p className="flex items-center gap-1.5 text-xs text-white/75 sm:text-sm"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: INCOME }} />Receitas</p>
            <p className="num font-display mt-1 text-sm font-semibold min-[400px]:text-base sm:text-xl">{formatBrl(rec)}</p>
            <p className="text-xs text-white/60 capitalize">{sel ? monthLong(sel.ym) : ""}</p>
          </div>
          <div className="glass min-w-0 p-2.5 sm:p-4">
            <p className="flex items-center gap-1.5 text-xs text-white/75 sm:text-sm"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: EXPENSE }} />Despesas</p>
            <p className="num font-display mt-1 text-sm font-semibold min-[400px]:text-base sm:text-xl">{formatBrl(desp)}</p>
          </div>
          <div className="glass min-w-0 p-2.5 sm:p-4">
            <p className="text-xs text-white/75 sm:text-sm">Sobrou</p>
            <p className="num font-display mt-1 text-sm font-semibold min-[400px]:text-base sm:text-xl">{formatBrl(sobrou)}</p>
            {pct !== null && <p className="text-xs text-white/70">{pct}% da receita</p>}
          </div>
        </div>
      </div>
    </GlassStage>
  );
}
