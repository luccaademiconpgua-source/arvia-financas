import type { Card, Transaction } from "../types";

export type Recurrence = {
  id: string;
  scope: "pessoal" | "casa" | "empresa";
  type: "receita" | "despesa";
  description: string;
  amountCents: number;
  variable: boolean;
  dayOfMonth: number;
  categoryId: string | null;
  accountId: string | null;
  cardId: string | null;
  payment: Transaction["payment"];
  startMonth: string;
  endMonth: string | null;
  active: boolean;
};

export type OccurrenceState = "paga" | "atrasada" | "hoje" | "proxima" | "futura";

export type Occurrence = {
  rec: Recurrence;
  month: string;
  due: string; // AAAA-MM-DD
  tx?: Transaction;
  state: OccurrenceState;
  daysLeft: number;
};

export function dueDate(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

export function activeIn(r: Recurrence, month: string): boolean {
  return r.active && month >= r.startMonth && (!r.endMonth || month <= r.endMonth);
}

/** Situação de cada conta fixa num mês. "Próxima" = vence em até 7 dias. */
export function occurrences(recs: Recurrence[], txs: Transaction[], month: string, today: string): Occurrence[] {
  const byKey = new Map<string, Transaction>();
  for (const t of txs) if (t.recurrenceId && t.recurrenceMonth) byKey.set(`${t.recurrenceId}|${t.recurrenceMonth}`, t);
  return recs
    .filter((r) => activeIn(r, month))
    .map((r) => {
      const due = dueDate(month, r.dayOfMonth);
      const tx = byKey.get(`${r.id}|${month}`);
      const d = days(due, today);
      const state: OccurrenceState = tx ? "paga" : d < 0 ? "atrasada" : d === 0 ? "hoje" : d <= 7 ? "proxima" : "futura";
      return { rec: r, month, due, ...(tx ? { tx } : {}), state, daysLeft: d };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.rec.description.localeCompare(b.rec.description));
}

export type Projection = {
  balanceCents: number;
  toReceiveCents: number;
  toPayCents: number;
  invoicesCents: number;
  projectedCents: number;
};

/**
 * Saldo previsto no fim do mês: saldo de hoje + o que falta receber − o que falta pagar.
 * Contas fixas no cartão não saem do saldo na data: entram na fatura, que conta pelo valor em aberto.
 */
export function projection(balanceCents: number, occ: Occurrence[], cards: Card[], month: string): Projection {
  let toReceive = 0;
  let toPay = 0;
  for (const o of occ) {
    if (o.state === "paga") continue;
    if (o.rec.type === "receita") toReceive += o.rec.amountCents;
    else if (!o.rec.cardId) toPay += o.rec.amountCents;
  }
  let invoices = 0;
  for (const c of cards) for (const i of c.invoices) if (i.status !== "paga" && i.month <= month) invoices += i.amountCents;
  return {
    balanceCents,
    toReceiveCents: toReceive,
    toPayCents: toPay,
    invoicesCents: invoices,
    projectedCents: balanceCents + toReceive - toPay - invoices,
  };
}
