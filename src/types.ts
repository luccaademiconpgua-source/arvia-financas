export type Mode = "pessoal" | "casa";

export type Account = {
  id: string;
  mode: Mode;
  name: string;
  type: "corrente" | "digital" | "dinheiro" | "investimento";
  /** saldo inicial semeado; o saldo exibido é derivado das transações */
  openingBalanceCents: number;
  /** saldo vindo da view account_balances (opening + lançamentos que mexem no saldo) */
  balanceCents?: number;
  institution?: string;
  openFinance?: {
    status: "demo" | "conectada" | "expirada";
    syncedAt?: string;
  };
};

export type CardInvoice = {
  id: string;
  month: string; // YYYY-MM
  status: "paga" | "vencida" | "aberta";
  amountCents: number;
  paidFromAccountId?: string;
};

export type Card = {
  id: string;
  mode: Mode;
  brand: "visa" | "master" | "elo";
  label: string;
  last4: string;
  limitCents: number | null;
  dueDay: number;
  invoices: CardInvoice[];
};

export type Category = {
  id: string;
  mode: Mode;
  name: string;
  kind: "receita" | "despesa";
  essential: boolean;
};

export type Transaction = {
  id: string;
  mode: Mode;
  type: "receita" | "despesa" | "reserva" | "ajuste";
  description: string;
  categoryId?: string;
  accountId?: string;
  cardId?: string;
  goalId?: string;
  payment: "pix" | "dinheiro" | "debito" | "credito";
  amountCents: number; // sempre positivo
  /** só para type "ajuste": delta com sinal em centavos */
  signedCents?: number;
  date: string; // ISO 8601
  essential?: boolean;
  /** false: histórico do seed e despesa no cartão. true: mexe no saldo da conta */
  affectsBalance: boolean;
  source: "manual" | "nfce" | "open_finance" | "fatura" | "extrato";
  nfceId?: string;
  /** fatura afetada: compra no crédito soma nela, pagamento de fatura a quita */
  invoiceId?: string;
  /** dívida cuja parcela esta transação pagou */
  debtId?: string;
};

export type Goal = {
  id: string;
  mode: Mode;
  name: string;
  targetCents: number;
  /** o progresso é derivado das transações type reserva com goalId */
  kind: "emergencia" | "geral";
};

export type Debt = {
  id: string;
  mode: Mode;
  name: string;
  installmentCount: number;
  paidInstallments: number;
  installmentCents: number;
  nextDue: string; // YYYY-MM-DD
};

export type NfceItem = {
  description: string;
  quantity: number;
  unit: string;
  totalCents: number;
};

export type NfceScan = {
  id: string;
  url: string;
  accessKey?: string;
  storeName: string;
  cnpj?: string;
  issuedAt: string;
  totalCents: number;
  payment?: Transaction["payment"] | "desconhecido";
  items: NfceItem[];
  state?: string;
  status: "rascunho" | "lancada";
  transactionId?: string;
  createdAt: string;
};
