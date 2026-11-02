import { Card, Pill } from "../ui";
import type { Health } from "../../lib/calc";

export function HealthCard({ health }: { health: Health }) {
  const tone = health.status === "Bom" ? "ok" : health.status === "Atenção" ? "warn" : "danger";
  const bar = health.status === "Bom" ? "bg-income" : health.status === "Atenção" ? "bg-warn" : "bg-danger";
  return (
    <Card title="Saúde financeira" className="h-full">
      <p className="num text-4xl font-semibold">
        {health.score}
        <span className="text-base font-medium text-muted"> /100</span>
      </p>
      <div className="mt-2">
        <Pill tone={tone}>{health.status}</Pill>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={health.score} aria-label="Nota de saúde financeira" className="mt-3 h-2 rounded-full bg-line">
        <div className={`h-2 rounded-full ${bar}`} style={{ width: `${health.score}%` }} />
      </div>
      {health.tips.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          {health.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
