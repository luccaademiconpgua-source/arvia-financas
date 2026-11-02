import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRefresh } from "../store/refresh";
import { addTransaction } from "../store/actions";
import type { Mode, Transaction } from "../types";
import type { Recurrence } from "../lib/recurrence";

type Row = Record<string, unknown>;
const toRec = (r: Row): Recurrence => ({
  id: String(r["id"]),
  scope: r["scope"] as Recurrence["scope"],
  type: r["type"] as Recurrence["type"],
  description: String(r["description"]),
  amountCents: Number(r["amount_cents"]),
  variable: Boolean(r["variable"]),
  dayOfMonth: Number(r["day_of_month"]),
  categoryId: (r["category_id"] as string | null) ?? null,
  accountId: (r["account_id"] as string | null) ?? null,
  cardId: (r["card_id"] as string | null) ?? null,
  payment: r["payment"] as Transaction["payment"],
  startMonth: String(r["start_month"]),
  endMonth: (r["end_month"] as string | null) ?? null,
  active: Boolean(r["active"]),
});

export function useRecurrences(mode: Mode) {
  const version = useRefresh((s) => s.version);
  const [state, setState] = useState<{ list: Recurrence[] | null; mode: Mode | null; error: string }>({ list: null, mode: null, error: "" });
  useEffect(() => {
    let alive = true;
    void supabase
      .from("recurrences")
      .select("*")
      .eq("scope", mode)
      .order("day_of_month")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setState((s) => ({ ...s, error: error.message, mode }));
        else setState({ list: (data ?? []).map(toRec), mode, error: "" });
      });
    return () => {
      alive = false;
    };
  }, [mode, version]);
  return { ready: state.list !== null && state.mode === mode, recurrences: state.list ?? [], error: state.error };
}

const bump = () => useRefresh.getState().bump();
const check = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
};

export type RecurrenceInput = Omit<Recurrence, "id" | "scope" | "active">;

const toRow = (v: RecurrenceInput) => ({
  type: v.type,
  description: v.description,
  amount_cents: v.amountCents,
  variable: v.variable,
  day_of_month: v.dayOfMonth,
  category_id: v.categoryId,
  account_id: v.accountId,
  card_id: v.cardId,
  payment: v.cardId ? "credito" : v.payment,
  start_month: v.startMonth,
  end_month: v.endMonth,
});

export async function saveRecurrence(mode: Mode, v: RecurrenceInput, id?: string) {
  check(id ? await supabase.from("recurrences").update(toRow(v)).eq("id", id) : await supabase.from("recurrences").insert({ scope: mode, ...toRow(v) }));
  await supabase.rpc("match_recurrences");
  bump();
}

export async function setRecurrenceActive(id: string, active: boolean) {
  check(await supabase.from("recurrences").update({ active }).eq("id", id));
  bump();
}

export async function deleteRecurrence(id: string) {
  check(await supabase.from("recurrences").delete().eq("id", id));
  bump();
}

/** Lança o pagamento/recebimento do mês e já liga à conta fixa. */
export async function markPaid(mode: Mode, r: Recurrence, month: string, amountCents: number, date: string, target: { accountId?: string; cardId?: string; payment: Transaction["payment"] }) {
  const id = await addTransaction({
    mode,
    type: r.type,
    description: r.description,
    amountCents,
    date,
    payment: target.cardId ? "credito" : target.payment,
    categoryId: r.categoryId ?? undefined,
    accountId: target.accountId,
    cardId: target.cardId,
  });
  await linkRecurrence(id, r.id, month);
}

export async function linkRecurrence(txId: string, recurrenceId: string | null, month: string) {
  const { error } = await supabase.rpc("link_recurrence", { p_tx: txId, p_recurrence_id: recurrenceId, p_month: month });
  if (error) throw new Error(error.message);
  bump();
}
