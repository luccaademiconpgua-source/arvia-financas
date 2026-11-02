import type { Category, Transaction } from "../types";

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Despesas acumuladas dia a dia no mês (índice 0 = dia 1). */
export function cumulativeSpend(txs: readonly Transaction[], ym: string): number[] {
  const days = daysInMonth(ym);
  const perDay = new Array<number>(days).fill(0);
  for (const t of txs) {
    if (t.type !== "despesa" || t.isTransfer || !t.date.startsWith(ym)) continue;
    const d = Number(t.date.slice(8, 10));
    if (d >= 1 && d <= days) perDay[d - 1]! += t.amountCents;
  }
  let acc = 0;
  return perDay.map((v) => (acc += v));
}

export type PacePoint = { day: number; atual: number | null; anterior: number | null };

/**
 * Série para o gráfico de ritmo: mês escolhido x mês anterior.
 * O mês atual para no dia de hoje (não desenha o futuro).
 */
export function pace(txs: readonly Transaction[], ym: string, prevYm: string, today: string): PacePoint[] {
  const cur = cumulativeSpend(txs, ym);
  const prev = cumulativeSpend(txs, prevYm);
  const lastDay = today.startsWith(ym) ? Number(today.slice(8, 10)) : cur.length;
  const len = Math.max(cur.length, prev.length);
  const out: PacePoint[] = [];
  for (let i = 0; i < len; i++) {
    out.push({
      day: i + 1,
      atual: i < cur.length && i < lastDay ? cur[i]! : null,
      anterior: i < prev.length ? prev[i]! : null,
    });
  }
  return out;
}

/** Comparação no mesmo dia do mês: quanto a mais (positivo) ou a menos que no mês anterior. */
export function paceDelta(points: PacePoint[]): { day: number; atual: number; anterior: number; delta: number } | null {
  const last = [...points].reverse().find((p) => p.atual !== null);
  if (!last || last.atual === null) return null;
  const anterior = last.anterior ?? points.filter((p) => p.anterior !== null).at(-1)?.anterior ?? 0;
  return { day: last.day, atual: last.atual, anterior, delta: last.atual - anterior };
}

/** Maiores despesas de uma categoria no mês. */
export function topExpenses(txs: readonly Transaction[], ym: string, categoryName: string, categories: readonly Category[], n = 3): Transaction[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return txs
    .filter((t) => t.type === "despesa" && !t.isTransfer && t.date.startsWith(ym) && (names.get(t.categoryId ?? "") ?? "Outras") === categoryName)
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, n);
}
