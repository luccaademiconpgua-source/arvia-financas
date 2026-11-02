import type { Transaction } from "../types";

export type InstallmentPurchase = {
  group: string;
  description: string;
  cardId?: string;
  total: number; // número de parcelas
  totalCents: number;
  paidCount: number; // parcelas com data até hoje
  remainingCents: number;
  installmentCents: number;
  next?: { no: number; date: string; amountCents: number };
  lastDate: string;
};

/** Divide o total em parcelas iguais; a sobra dos centavos vai na 1ª (igual ao banco). */
export function splitInstallments(totalCents: number, count: number): number[] {
  const each = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => each + (i === 0 ? totalCents - each * count : 0));
}

/** Agrupa as compras parceladas e mostra quanto já passou e quanto falta. */
export function installmentPurchases(txs: readonly Transaction[], today: string): InstallmentPurchase[] {
  const by = new Map<string, Transaction[]>();
  for (const t of txs) if (t.installment) by.set(t.installment.group, [...(by.get(t.installment.group) ?? []), t]);
  const out: InstallmentPurchase[] = [];
  for (const [group, list] of by) {
    const sorted = [...list].sort((a, b) => a.installment!.no - b.installment!.no);
    const first = sorted[0]!;
    const future = sorted.filter((t) => t.date > today);
    const nxt = future[0];
    out.push({
      group,
      description: first.description,
      ...(first.cardId ? { cardId: first.cardId } : {}),
      total: first.installment!.total,
      totalCents: sorted.reduce((s, t) => s + t.amountCents, 0),
      paidCount: sorted.length - future.length,
      remainingCents: future.reduce((s, t) => s + t.amountCents, 0),
      installmentCents: sorted[sorted.length - 1]!.amountCents,
      ...(nxt ? { next: { no: nxt.installment!.no, date: nxt.date, amountCents: nxt.amountCents } } : {}),
      lastDate: sorted[sorted.length - 1]!.date,
    });
  }
  return out.sort((a, b) => b.remainingCents - a.remainingCents || a.description.localeCompare(b.description));
}

/** Quanto deste mês (o que ainda não passou) e dos próximos já está comprometido com parcelas. Mês YYYY-MM -> centavos. */
export function committedByMonth(txs: readonly Transaction[], today: string, months = 6, cardId?: string): Array<{ month: string; cents: number }> {
  const start = today.slice(0, 7);
  const keys: string[] = [];
  const [y, m] = start.split("-").map(Number) as [number, number];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const acc = new Map(keys.map((k) => [k, 0]));
  for (const t of txs) {
    if (!t.installment || t.date <= today) continue;
    if (cardId && t.cardId !== cardId) continue;
    const k = t.date.slice(0, 7);
    if (acc.has(k)) acc.set(k, acc.get(k)! + t.amountCents);
  }
  return keys.map((k) => ({ month: k, cents: acc.get(k)! }));
}
