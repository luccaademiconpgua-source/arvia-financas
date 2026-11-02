import { Link } from "react-router";
import { format, parseISO } from "date-fns";
import { Card, Empty } from "../ui";
import { formatBrl } from "../../lib/money";
import { goalProgress, goalSavedCents } from "../../lib/calc";
import type { Debt, Goal, Transaction } from "../../types";

export function GoalsStrip({ goals, debts, transactions }: { goals: Goal[]; debts: Debt[]; transactions: Transaction[] }) {
  const reserve = goals.find((g) => g.kind === "emergencia") ?? goals[0];
  const next = debts.filter((d) => d.paidInstallments < d.installmentCount).sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1))[0];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Reserva">
        {reserve ? (
          <>
            <p className="text-sm font-medium">{reserve.name}</p>
            <p className="num text-sm text-muted">
              {formatBrl(goalSavedCents(reserve, transactions))} de {formatBrl(reserve.targetCents)}
            </p>
            <div className="mt-2 h-2 rounded-full bg-line">
              <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.round(goalProgress(reserve, transactions) * 100)}%` }} />
            </div>
            <Link to="/metas" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-4">
              Ver metas
            </Link>
          </>
        ) : (
          <Empty>Nenhuma meta cadastrada.</Empty>
        )}
      </Card>
      <Card title="Próxima dívida">
        {next ? (
          <>
            <p className="text-sm font-medium">{next.name}</p>
            <p className="num text-sm text-muted">
              {formatBrl(next.installmentCents)} · vence {format(parseISO(next.nextDue), "dd/MM/yyyy")}
            </p>
            <p className="text-sm text-muted">
              Parcela {next.paidInstallments + 1} de {next.installmentCount}
            </p>
            <Link to="/dividas" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-4">
              Ver dívidas
            </Link>
          </>
        ) : (
          <Empty>Nenhuma dívida em aberto.</Empty>
        )}
      </Card>
    </div>
  );
}
