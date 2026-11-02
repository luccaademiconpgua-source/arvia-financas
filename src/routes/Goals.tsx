import { useState } from "react";
import { NewGoalSheet } from "../components/CreateSheets";
import { Card, Empty } from "../components/ui";
import { PrimaryButton } from "../components/Sheet";
import { useModeData } from "../hooks/useModeData";
import { goalProgress, goalSavedCents } from "../lib/calc";
import { formatBrl } from "../lib/money";
import { useUI } from "../store/ui";

export function Goals() {
  const { mode, ready, goals, transactions } = useModeData();
  const [creating, setCreating] = useState(false);
  const openTx = useUI((s) => s.openTx);
  if (!ready) return <Empty>Carregando…</Empty>;
  return (
    <Card title="Metas">
      {goals.length === 0 ? (
        <Empty>Nenhuma meta ainda.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {goals.map((g) => {
            const pct = Math.round(goalProgress(g, transactions) * 100);
            return (
              <li key={g.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{g.name}</p>
                  <PrimaryButton type="button" onClick={() => openTx({ type: "reserva", goalId: g.id })}>
                    Reservar agora
                  </PrimaryButton>
                </div>
                <p className="num mt-1 text-sm text-muted">
                  {formatBrl(goalSavedCents(g, transactions))} de {formatBrl(g.targetCents)} · {pct}%
                </p>
                <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Progresso de ${g.name}`} className="mt-2 h-2 rounded-full bg-line">
                  <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PrimaryButton type="button" onClick={() => setCreating(true)} className="mt-3">Nova meta</PrimaryButton>
      {creating && <NewGoalSheet mode={mode} onClose={() => setCreating(false)} />}
    </Card>
  );
}
