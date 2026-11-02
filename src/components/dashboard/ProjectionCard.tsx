import { Link } from "react-router";
import { format, parseISO } from "date-fns";
import { Card } from "../ui";
import { formatBrl } from "../../lib/money";
import { occurrences, projection } from "../../lib/recurrence";
import { useRecurrences } from "../../services/recurrences";
import { monthLong } from "./DashboardHero";
import type { Card as CardT, Mode, Transaction } from "../../types";

export function ProjectionCard({ mode, balanceCents, transactions, cards, today }: { mode: Mode; balanceCents: number; transactions: Transaction[]; cards: CardT[]; today: string }) {
  const { ready, recurrences } = useRecurrences(mode);
  const ym = today.slice(0, 7);
  const occ = occurrences(recurrences, transactions, ym, today);
  const p = projection(balanceCents, occ, cards, ym);
  const pending = occ.filter((o) => o.state !== "paga" && o.state !== "futura");

  return (
    <Card title={`Previsão para o fim de ${monthLong(ym)}`} className="h-full">
      {!ready ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Saldo hoje</dt><dd className="num">{formatBrl(p.balanceCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Ainda vai receber</dt><dd className="num">+ {formatBrl(p.toReceiveCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Contas fixas a pagar</dt><dd className="num">- {formatBrl(p.toPayCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Faturas em aberto</dt><dd className="num">- {formatBrl(p.invoicesCents)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 font-semibold">
              <dt>Deve sobrar</dt>
              <dd className={`num font-display text-lg ${p.projectedCents < 0 ? "text-expense" : ""}`}>{formatBrl(p.projectedCents)}</dd>
            </div>
          </dl>
          {p.projectedCents < 0 && <p className="mt-2 text-sm text-expense">Pelo previsto, o mês fecha no vermelho. Vale segurar gastos que não são essenciais.</p>}
          {pending.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              {pending.slice(0, 4).map((o) => (
                <li key={o.rec.id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {o.rec.description}{" "}
                    <span className={o.state === "atrasada" ? "text-danger" : "text-muted"}>
                      {o.state === "atrasada" ? "atrasada" : o.state === "hoje" ? "vence hoje" : `dia ${format(parseISO(o.due), "dd/MM")}`}
                    </span>
                  </span>
                  <span className="num shrink-0">{formatBrl(o.rec.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/contas-fixas" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-4">
            {recurrences.length ? "Ver contas fixas" : "Cadastrar contas fixas para prever o mês"}
          </Link>
        </>
      )}
    </Card>
  );
}
