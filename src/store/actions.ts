import { supabase } from "../lib/supabase";
import { todayIso } from "../lib/clock";
import type { Mode, Transaction } from "../types";
import { useRefresh } from "./refresh";

export type TxDraft = {
  mode: Mode;
  type: "receita" | "despesa" | "reserva";
  description: string;
  amountCents: number;
  date: string;
  payment: Transaction["payment"];
  categoryId?: string | undefined;
  accountId?: string | undefined;
  cardId?: string | undefined;
  goalId?: string | undefined;
  essential?: boolean | undefined;
  source?: Transaction["source"];
  nfceId?: string | undefined;
  externalId?: string | undefined;
};

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  useRefresh.getState().bump();
  return data as T;
}

export function addTransaction(d: TxDraft): Promise<string> {
  return rpc<string>("add_transaction", {
    p_scope: d.mode,
    p_type: d.type,
    p_description: d.description,
    p_amount_cents: d.amountCents,
    p_date: d.date,
    p_payment: d.payment,
    p_category_id: d.categoryId ?? null,
    p_account_id: d.accountId ?? null,
    p_card_id: d.cardId ?? null,
    p_goal_id: d.goalId ?? null,
    p_essential: d.essential ?? null,
    p_source: d.source ?? "manual",
    p_nfce_id: d.nfceId ?? null,
    p_external_id: d.externalId ?? null,
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await rpc<null>("delete_transaction", { p_id: id });
}

export async function adjustBalance(accountId: string, newBalanceCents: number): Promise<void> {
  await rpc<null>("adjust_balance", { p_account_id: accountId, p_new_balance_cents: newBalanceCents, p_date: todayIso() });
}

export async function payInvoice(cardId: string, invoiceId: string, accountId: string): Promise<void> {
  await rpc<null>("pay_invoice", { p_card_id: cardId, p_invoice_id: invoiceId, p_account_id: accountId, p_date: todayIso() });
}

export async function payDebtInstallment(debtId: string, accountId: string): Promise<void> {
  await rpc<null>("pay_debt_installment", { p_debt_id: debtId, p_account_id: accountId, p_date: todayIso() });
}
