import { supabase } from "../lib/supabase";
import type { Account, Card, CardInvoice, Category, Debt, Goal, Mode, Transaction } from "../types";

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v ?? "");
const opt = (v: unknown): string | undefined => (v === null || v === undefined ? undefined : String(v));
const int = (v: unknown): number => Number(v ?? 0);

const toAccount = (r: Row, balances: Map<string, number>, mode: Mode): Account => {
  const status = opt(r["of_status"]);
  return {
    id: str(r["id"]),
    mode,
    name: str(r["name"]),
    type: str(r["type"]) as Account["type"],
    openingBalanceCents: int(r["opening_balance_cents"]),
    balanceCents: balances.get(str(r["id"])) ?? int(r["opening_balance_cents"]),
    ...(opt(r["institution"]) ? { institution: opt(r["institution"]) as string } : {}),
    ...(status ? { openFinance: { status: status as "demo" | "conectada" | "expirada", ...(opt(r["of_synced_at"]) ? { syncedAt: opt(r["of_synced_at"]) as string } : {}) } } : {}),
  };
};

const toInvoice = (r: Row): CardInvoice => ({
  id: str(r["id"]),
  month: str(r["month"]),
  status: str(r["status"]) as CardInvoice["status"],
  amountCents: int(r["amount_cents"]),
  ...(opt(r["paid_from_account_id"]) ? { paidFromAccountId: opt(r["paid_from_account_id"]) as string } : {}),
});

const toCard = (r: Row, mode: Mode): Card => ({
  id: str(r["id"]),
  mode,
  brand: str(r["brand"]) as Card["brand"],
  label: str(r["label"]),
  last4: str(r["last4"]),
  limitCents: r["limit_cents"] === null || r["limit_cents"] === undefined ? null : int(r["limit_cents"]),
  dueDay: int(r["due_day"]),
  invoices: ((r["card_invoices"] as Row[] | null) ?? []).map(toInvoice),
});

const toTx = (r: Row, mode: Mode): Transaction => ({
  id: str(r["id"]),
  mode,
  type: str(r["type"]) as Transaction["type"],
  description: str(r["description"]),
  payment: str(r["payment"]) as Transaction["payment"],
  amountCents: int(r["amount_cents"]),
  date: str(r["date"]),
  affectsBalance: Boolean(r["affects_balance"]),
  source: str(r["source"]) as Transaction["source"],
  ...(r["is_transfer"] ? { isTransfer: true } : {}),
  ...(opt(r["category_id"]) ? { categoryId: opt(r["category_id"]) as string } : {}),
  ...(opt(r["account_id"]) ? { accountId: opt(r["account_id"]) as string } : {}),
  ...(opt(r["card_id"]) ? { cardId: opt(r["card_id"]) as string } : {}),
  ...(opt(r["goal_id"]) ? { goalId: opt(r["goal_id"]) as string } : {}),
  ...(r["signed_cents"] !== null && r["signed_cents"] !== undefined ? { signedCents: int(r["signed_cents"]) } : {}),
  ...(r["essential"] !== null && r["essential"] !== undefined ? { essential: Boolean(r["essential"]) } : {}),
  ...(opt(r["nfce_id"]) ? { nfceId: opt(r["nfce_id"]) as string } : {}),
  ...(opt(r["invoice_id"]) ? { invoiceId: opt(r["invoice_id"]) as string } : {}),
  ...(opt(r["debt_id"]) ? { debtId: opt(r["debt_id"]) as string } : {}),
});

async function all(scope: Mode, table: string, select = "*"): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    let q = supabase.from(table).select(select).eq("scope", scope);
    if (table === "transactions") q = q.order("date", { ascending: false }).order("created_at", { ascending: false });
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export type ModeData = {
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  transactions: Transaction[];
  goals: Goal[];
  debts: Debt[];
};

export async function fetchModeData(mode: Mode): Promise<ModeData> {
  const [accounts, cards, categories, transactions, goals, debts, bal] = await Promise.all([
    all(mode, "accounts"),
    all(mode, "cards", "*, card_invoices(*)"),
    all(mode, "categories"),
    all(mode, "transactions"),
    all(mode, "goals"),
    all(mode, "debts"),
    supabase.from("account_balances").select("account_id,balance_cents"),
  ]);
  const balances = new Map<string, number>((bal.data ?? []).map((b) => [String(b.account_id), Number(b.balance_cents)]));
  return {
    accounts: accounts.map((r) => toAccount(r, balances, mode)),
    cards: cards.map((r) => toCard(r, mode)),
    categories: categories.map((r) => ({ id: str(r["id"]), mode, name: str(r["name"]), kind: str(r["kind"]) as Category["kind"], essential: Boolean(r["essential"]) })),
    transactions: reconcileView(transactions, mode),
    goals: goals.map((r) => ({ id: str(r["id"]), mode, name: str(r["name"]), targetCents: int(r["target_cents"]), kind: str(r["kind"]) as Goal["kind"] })),
    debts: debts.map((r) => ({ id: str(r["id"]), mode, name: str(r["name"]), installmentCount: int(r["installment_count"]), paidInstallments: int(r["paid_installments"]), installmentCents: int(r["installment_cents"]), nextDue: str(r["next_due"]) })),
  };
}

/** Junta o lançamento do banco ao manual/nota que ele confirma: o do banco some da lista e dos totais. */
export function reconcileView(rows: Row[], mode: Mode): Transaction[] {
  const byMatch = new Map<string, Row>();
  for (const r of rows) if (r["match_id"]) byMatch.set(String(r["match_id"]), r);
  const ids = new Set(rows.map((r) => String(r["id"])));
  const out: Transaction[] = [];
  for (const r of rows) {
    // o do banco só some se o par também estiver visível aqui
    if (r["match_id"] && ids.has(String(r["match_id"]))) continue;
    const t = toTx(r, mode);
    const b = byMatch.get(t.id);
    if (b) {
      t.bankMatch = {
        id: String(b["id"]),
        description: String(b["description"] ?? ""),
        date: String(b["date"]),
        source: String(b["source"]) as "open_finance" | "extrato",
        ...(b["account_id"] ? { accountId: String(b["account_id"]) } : {}),
        ...(b["card_id"] ? { cardId: String(b["card_id"]) } : {}),
      };
    }
    out.push(t);
  }
  return out;
}
