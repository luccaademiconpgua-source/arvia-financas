import { Card } from "../ui";
import type { Health, Tone } from "../../lib/calc";

const toneText: Record<Tone, string> = { ok: "text-income", warn: "text-warn", danger: "text-danger" };

/** Medidor em meio círculo: vermelho no começo, verde no fim; o arco preenche até a nota. */
function Gauge({ score }: { score: number }) {
  const r = 52;
  const len = Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * len;
  return (
    <svg viewBox="0 0 132 76" className="w-36 shrink-0" role="img" aria-label={`Nota ${score} de 100`}>
      <defs>
        <linearGradient id="healthArc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-danger)" />
          <stop offset="55%" stopColor="var(--color-warn)" />
          <stop offset="100%" stopColor="var(--color-income)" />
        </linearGradient>
      </defs>
      <path d={`M 14 66 A ${r} ${r} 0 0 1 118 66`} fill="none" stroke="var(--color-line)" strokeWidth="10" strokeLinecap="round" />
      <path d={`M 14 66 A ${r} ${r} 0 0 1 118 66`} fill="none" stroke="url(#healthArc)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${filled} ${len}`} />
      <text x="66" y="62" textAnchor="middle" className="num font-display" fontSize="30" fontWeight="700" fill="var(--color-ink)">{score}</text>
    </svg>
  );
}

export function HealthCard({ health }: { health: Health }) {
  const statusTone: Tone = health.status === "Bom" ? "ok" : health.status === "Atenção" ? "warn" : "danger";
  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="card-title">Sua saúde financeira</h2>
          <p className="mt-1 text-sm text-muted">
            Nota de 0 a 100 deste mês: <span className={`font-medium ${toneText[statusTone]}`}>{health.status}</span>
          </p>
        </div>
        <Gauge score={health.score} />
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2" aria-label="O que explica a nota">
        {health.pillars.map((p) => (
          <li key={p.label} className="rounded-xl bg-page px-2 py-3 text-center">
            <p className="text-xs text-muted">{p.label}</p>
            <p className={`font-display mt-0.5 text-sm font-semibold sm:text-base ${toneText[p.tone]}`}>{p.value}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted">{p.hint}</p>
          </li>
        ))}
      </ul>
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
