import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, Empty } from "../components/ui";
import { useModeData } from "../hooks/useModeData";
import { expenseByCategory, inMonth, variationPct } from "../lib/calc";
import { shiftMonth, todayIso } from "../lib/clock";
import { formatBrl } from "../lib/money";
import type { Transaction } from "../types";

const sum = (txs: Transaction[], type: Transaction["type"]) => txs.reduce((s, t) => (t.type === type ? s + t.amountCents : s), 0);
const payLabel = { pix: "Pix", dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito" } as const;

function Variation({ cur, prev, goodWhenUp }: { cur: number; prev: number; goodWhenUp: boolean }) {
  const v = variationPct(cur, prev);
  if (v === null) return <span className="text-sm text-muted">Sem mês anterior para comparar</span>;
  const up = v >= 0;
  const good = up === goodWhenUp;
  return (
    <span className={`text-sm font-medium ${v === 0 ? "text-muted" : good ? "text-income" : "text-expense"}`}>
      {up ? "subiu" : "caiu"} {Math.abs(v).toFixed(1).replace(".", ",")}% em relação ao mês anterior
    </span>
  );
}

export function Reports() {
  const { ready, transactions, categories } = useModeData();
  const [ym, setYm] = useState(todayIso().slice(0, 7));
  if (!ready) return <Empty>Carregando…</Empty>;
  const month = inMonth(transactions, ym);
  const prev = inMonth(transactions, shiftMonth(ym, -1));
  const rec = sum(month, "receita");
  const desp = sum(month, "despesa");
  const expenses = month.filter((t) => t.type === "despesa");
  const essential = expenses.filter((t) => (t.essential ?? categories.find((c) => c.id === t.categoryId)?.essential) === true).reduce((s, t) => s + t.amountCents, 0);
  const slices = expenseByCategory(transactions, ym, categories);
  const byPay = (["pix", "dinheiro", "debito", "credito"] as const).map((p) => ({ p, cents: expenses.filter((t) => t.payment === p).reduce((s, t) => s + t.amountCents, 0) })).filter((x) => x.cents > 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Mês anterior" onClick={() => setYm(shiftMonth(ym, -1))} className="flex size-11 items-center justify-center rounded-lg border border-line">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <h2 className="text-lg font-semibold capitalize">{format(parseISO(`${ym}-01`), "MMMM 'de' yyyy", { locale: ptBR })}</h2>
          <button type="button" aria-label="Próximo mês" onClick={() => setYm(shiftMonth(ym, 1))} className="flex size-11 items-center justify-center rounded-lg border border-line">
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </Card>
      {month.length === 0 ? (
        <Card>
          <Empty>Sem lançamentos neste mês.</Empty>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Receitas">
              <p className="num text-2xl font-semibold text-income">{formatBrl(rec)}</p>
              <Variation cur={rec} prev={sum(prev, "receita")} goodWhenUp />
            </Card>
            <Card title="Despesas">
              <p className="num text-2xl font-semibold text-expense">{formatBrl(desp)}</p>
              <Variation cur={desp} prev={sum(prev, "despesa")} goodWhenUp={false} />
            </Card>
          </div>
          <Card title="Essencial e não essencial">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">Essencial</dt>
                <dd className="num text-lg font-semibold">{formatBrl(essential)}</dd>
              </div>
              <div>
                <dt className="text-muted">Não essencial</dt>
                <dd className="num text-lg font-semibold">{formatBrl(desp - essential)}</dd>
              </div>
            </dl>
          </Card>
          <Card title="Despesas por categoria">
            {slices.length === 0 ? (
              <Empty>Sem despesas neste mês.</Empty>
            ) : (
              <ul className="space-y-3">
                {slices.map((s) => (
                  <li key={s.name}>
                    <div className="flex justify-between text-sm">
                      <span>{s.name}</span>
                      <span className="num font-medium">{formatBrl(s.cents)} · {s.pct.toString().replace(".", ",")}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-line">
                      <div className="h-2 rounded-full bg-brand" style={{ width: `${s.pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Formas de pagamento">
            {byPay.length === 0 ? (
              <Empty>Sem despesas neste mês.</Empty>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {byPay.map((x) => (
                  <li key={x.p} className="flex justify-between py-2">
                    <span>{payLabel[x.p]}</span>
                    <span className="num font-medium">{formatBrl(x.cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
