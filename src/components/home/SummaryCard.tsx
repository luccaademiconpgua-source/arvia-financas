import { useState } from "react";
import { Card, Pill } from "../ui";
import { formatBrl } from "../../lib/money";
import { summarize, type Range } from "../../lib/calc";
import type { Transaction } from "../../types";

const ranges: Array<{ value: Range; label: string }> = [
  { value: "mes", label: "Este mês" },
  { value: "30d", label: "30 dias" },
  { value: "6m", label: "6 meses" },
];

export function SummaryCard({ transactions, today }: { transactions: Transaction[]; today: string }) {
  const [range, setRange] = useState<Range>("mes");
  const s = summarize(transactions, range, today);
  return (
    <Card title="Resumo" className="h-full">
      <div role="tablist" aria-label="Período" className="mb-3 grid grid-cols-3 rounded-xl border border-line p-1">
        {ranges.map((r) => (
          <button key={r.value} type="button" role="tab" aria-selected={range === r.value} onClick={() => setRange(r.value)} className={`min-h-11 rounded-lg text-sm font-medium ${range === r.value ? "bg-brand text-white" : "text-muted"}`}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-xl bg-income-bg px-3 py-2 text-income">
          <span className="block text-xs">Receitas</span>
          <span className="num text-base font-semibold">{formatBrl(s.receitasCents)}</span>
        </span>
        <span className="rounded-xl bg-expense-bg px-3 py-2 text-expense">
          <span className="block text-xs">Despesas</span>
          <span className="num text-base font-semibold">{formatBrl(s.despesasCents)}</span>
        </span>
      </div>
      <p className="mt-3 text-sm text-muted">Sobrou</p>
      <p className={`num text-2xl font-semibold ${s.sobrouCents < 0 ? "text-expense" : "text-ink"}`}>
        {formatBrl(s.sobrouCents)}
        {s.sobrouPct !== null && <span className="ml-2 text-sm font-medium text-muted">{Math.round(s.sobrouPct * 100)}% da receita</span>}
      </p>
      {s.recebidoAteHojeCents !== null && s.pagoNoCartaoCents !== null && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted">Recebido até hoje</dt>
            <dd className="num font-medium">{formatBrl(s.recebidoAteHojeCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Pago e no cartão</dt>
            <dd className="num font-medium">{formatBrl(s.pagoNoCartaoCents)}</dd>
          </div>
        </dl>
      )}
      {s.receitasCents === 0 && s.despesasCents === 0 && <Pill tone="neutral">Sem lançamentos neste período</Pill>}
    </Card>
  );
}
