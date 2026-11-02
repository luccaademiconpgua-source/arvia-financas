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

export async function addTransaction(d: TxDraft): Promise<string> {
  const id = await rpc<string>("add_transaction", {
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
  void afterDataChange().catch(() => undefined);
  return id;
}

export async function addInstallments(d: { mode: Mode; description: string; totalCents: number; count: number; date: string; cardId: string; categoryId?: string | undefined; essential?: boolean | undefined }): Promise<string> {
  const id = await rpc<string>("add_installment_purchase", {
    p_scope: d.mode,
    p_description: d.description,
    p_total_cents: d.totalCents,
    p_count: d.count,
    p_date: d.date,
    p_card_id: d.cardId,
    p_category_id: d.categoryId ?? null,
    p_essential: d.essential ?? null,
  });
  void afterDataChange().catch(() => undefined);
  return id;
}

export async function deleteInstallmentGroup(group: string): Promise<void> {
  await rpc<number>("delete_installment_group", { p_group: group });
}

export async function setTransfer(id: string, value: boolean): Promise<void> {
  await rpc<null>("set_transfer", { p_id: id, p_value: value });
}

export function classifyTransaction(id: string, transfer: boolean, categoryId: string | null, applySame: boolean) {
  return rpc<number>("classify_transaction", { p_id: id, p_transfer: transfer, p_category_id: categoryId, p_apply_same: applySame });
}

export async function unlinkMatch(id: string): Promise<void> {
  await rpc<null>("unlink_match", { p_id: id });
}

/** Depois de qualquer entrada de dados: marca transferências e concilia banco x nota/manual. */
export async function afterDataChange(): Promise<void> {
  try {
    await supabase.rpc("detect_transfers");
    await supabase.rpc("auto_categorize");
    await supabase.rpc("reconcile");
    await supabase.rpc("match_recurrences");
  } finally {
    useRefresh.getState().bump();
  }
}

export function detectTransfers() {
  return rpc<{ by_name: number; pairs: number }>("detect_transfers", {});
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

export type ImportRow = {
  external_id: string;
  type: "receita" | "despesa";
  amount_cents: number;
  date: string;
  description: string;
  category_id?: string | undefined;
};

export function importStatement(target: { accountId?: string; cardId?: string }, rows: ImportRow[]) {
  return rpc<{ inserted: number; skipped: number }>("import_statement", {
    p_account_id: target.accountId ?? null,
    p_card_id: target.cardId ?? null,
    p_rows: rows,
  });
}
