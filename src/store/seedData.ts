import type { Account, Card, Category, Debt, Goal, Mode, Transaction } from "../types";

export type SeedData = {
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  transactions: Transaction[];
  goals: Goal[];
  debts: Debt[];
};

const uid = (): string => crypto.randomUUID();

type TxInput = {
  mode: Mode;
  type: Transaction["type"];
  description: string;
  amountCents: number;
  date: string;
  payment: Transaction["payment"];
  category?: string;
  account?: Account;
  card?: Card;
  goal?: Goal;
};

/** Dados de demonstração. Outubro de 2026 é o mês corrente da demo. */
export function buildSeed(): SeedData {
  const accounts: Account[] = [];
  const cards: Card[] = [];
  const categories: Category[] = [];
  const transactions: Transaction[] = [];
  const goals: Goal[] = [];
  const debts: Debt[] = [];

  const addAccount = (
    mode: Mode,
    name: string,
    type: Account["type"],
    openingBalanceCents: number,
    institution?: string,
  ): Account => {
    const a: Account = { id: uid(), mode, name, type, openingBalanceCents, institution };
    accounts.push(a);
    return a;
  };

  const addCategory = (mode: Mode, name: string, kind: Category["kind"], essential: boolean): void => {
    categories.push({ id: uid(), mode, name, kind, essential });
  };

  const findCategory = (mode: Mode, name: string): Category => {
    const c = categories.find((x) => x.mode === mode && x.name === name);
    if (!c) throw new Error(`Categoria inexistente no seed: ${mode}/${name}`);
    return c;
  };

  const addGoal = (mode: Mode, name: string, targetCents: number, kind: Goal["kind"]): Goal => {
    const g: Goal = { id: uid(), mode, name, targetCents, kind };
    goals.push(g);
    return g;
  };

  // Histórico do seed nunca mexe no saldo: opening já é o saldo atual de cada conta.
  const addTx = (i: TxInput): void => {
    const cat = i.category ? findCategory(i.mode, i.category) : undefined;
    transactions.push({
      id: uid(),
      mode: i.mode,
      type: i.type,
      description: i.description,
      categoryId: cat?.id,
      accountId: i.account?.id,
      cardId: i.card?.id,
      goalId: i.goal?.id,
      payment: i.payment,
      amountCents: i.amountCents,
      date: i.date,
      essential: cat?.essential,
      affectsBalance: false,
      source: "manual",
    });
  };

  // ---------- Pessoal ----------
  const despesasPessoais: Array<[string, boolean]> = [
    ["Academia", true],
    ["Contas", true],
    ["Alimentação", true],
    ["Saúde e bem-estar", true],
    ["Mercado", true],
    ["Parcelas", true],
    ["Vestuário", false],
    ["Gasolina", false],
    ["Plano de telefone", true],
    ["Lazer", false],
    ["Restaurante", false],
    ["Educação", false],
    ["Assinaturas", false],
    ["Moradia", true],
    ["Compras online", false],
    ["Outras", false],
  ];
  for (const [name, essential] of despesasPessoais) addCategory("pessoal", name, "despesa", essential);
  addCategory("pessoal", "Salário", "receita", false);
  addCategory("pessoal", "Outras receitas", "receita", false);

  const nubank = addAccount("pessoal", "Conta digital", "digital", 842966, "Nubank");
  const itau = addAccount("pessoal", "Conta corrente", "corrente", 420000, "Itaú");
  const dinheiro = addAccount("pessoal", "Dinheiro", "dinheiro", 230000);

  const inter: Card = {
    id: uid(),
    mode: "pessoal",
    brand: "master",
    label: "Inter",
    last4: "4412",
    limitCents: 300000,
    dueDay: 17,
    invoices: [
      { id: uid(), month: "2026-09", status: "paga", amountCents: 31464 },
      { id: uid(), month: "2026-10", status: "vencida", amountCents: 37163 },
      { id: uid(), month: "2026-11", status: "aberta", amountCents: 11663 },
    ],
  };
  cards.push(inter);

  const reservaEmergencia = addGoal("pessoal", "Reserva de emergência", 5000000, "emergencia");
  addGoal("pessoal", "Meta principal", 100000000, "geral");

  debts.push(
    { id: uid(), mode: "pessoal", name: "Colombo", installmentCount: 10, paidInstallments: 7, installmentCents: 34900, nextDue: "2026-11-10" },
    { id: uid(), mode: "pessoal", name: "Magazine Luiza", installmentCount: 12, paidInstallments: 6, installmentCents: 7000, nextDue: "2026-11-05" },
  );

  // Fluxo de caixa de maio a setembro. Valores em reais do contrato, gravados em centavos.
  const historico: Array<[string, number, number]> = [
    ["2026-05", 7200, 6100],
    ["2026-06", 7500, 6400],
    ["2026-07", 7000, 6900],
    ["2026-08", 8100, 6000],
    ["2026-09", 9000, 5800],
  ];
  for (const [ym, receita, despesa] of historico) {
    const receitaCents = receita * 100;
    const despesaCents = despesa * 100;
    const fixas = 180000 + 90000 + 120000;
    const petShop = ym === "2026-09" ? 15600 : 0;
    addTx({ mode: "pessoal", type: "receita", description: "Salário", amountCents: 500000, date: `${ym}-05`, payment: "pix", category: "Salário", account: nubank });
    addTx({ mode: "pessoal", type: "receita", description: "Freela", amountCents: receitaCents - 500000, date: `${ym}-18`, payment: "pix", category: "Outras receitas", account: nubank });
    addTx({ mode: "pessoal", type: "despesa", description: "Aluguel", amountCents: 180000, date: `${ym}-05`, payment: "pix", category: "Moradia", account: itau });
    addTx({ mode: "pessoal", type: "despesa", description: "Parcelas do mês", amountCents: 120000, date: `${ym}-10`, payment: "pix", category: "Parcelas", account: nubank });
    addTx({ mode: "pessoal", type: "despesa", description: "Alimentação", amountCents: 90000, date: `${ym}-15`, payment: "debito", category: "Alimentação", account: nubank });
    addTx({ mode: "pessoal", type: "despesa", description: "Despesas variáveis", amountCents: despesaCents - fixas - petShop, date: `${ym}-20`, payment: "debito", category: "Outras", account: nubank });
    if (petShop > 0) {
      addTx({ mode: "pessoal", type: "despesa", description: "Pet shop", amountCents: petShop, date: "2026-09-20", payment: "credito", category: "Outras", card: inter });
    }
  }

  // Reservas históricas: R$ 800 na reserva de emergência.
  addTx({ mode: "pessoal", type: "reserva", description: "Reserva de emergência", amountCents: 30000, date: "2026-08-10", payment: "pix", account: nubank, goal: reservaEmergencia });
  addTx({ mode: "pessoal", type: "reserva", description: "Reserva de emergência", amountCents: 50000, date: "2026-09-10", payment: "pix", account: nubank, goal: reservaEmergencia });

  // Outubro de 2026: receitas somam R$ 8.250,00.
  addTx({ mode: "pessoal", type: "receita", description: "Salário", amountCents: 500000, date: "2026-10-05", payment: "pix", category: "Salário", account: nubank });
  addTx({ mode: "pessoal", type: "receita", description: "Freela de projeto", amountCents: 280000, date: "2026-10-18", payment: "pix", category: "Outras receitas", account: nubank });
  addTx({ mode: "pessoal", type: "receita", description: "Revisão de texto", amountCents: 45000, date: "2026-10-24", payment: "pix", category: "Outras receitas", account: nubank });

  // Outubro de 2026: despesas somam R$ 6.856,33.
  // Parcelas R$ 2.280,00
  addTx({ mode: "pessoal", type: "despesa", description: "Parcela Colombo (7/10)", amountCents: 34900, date: "2026-10-10", payment: "pix", category: "Parcelas", account: nubank });
  addTx({ mode: "pessoal", type: "despesa", description: "Parcela Magazine Luiza (6/12)", amountCents: 7000, date: "2026-10-05", payment: "pix", category: "Parcelas", account: nubank });
  addTx({ mode: "pessoal", type: "despesa", description: "Parcela do notebook", amountCents: 56100, date: "2026-10-08", payment: "pix", category: "Parcelas", account: itau });
  addTx({ mode: "pessoal", type: "despesa", description: "Parcela do celular", amountCents: 30000, date: "2026-10-12", payment: "pix", category: "Parcelas", account: itau });
  for (const n of [3, 4, 5, 6]) {
    addTx({ mode: "pessoal", type: "despesa", description: `Acordo do cartão (${n}/6)`, amountCents: 25000, date: "2026-10-24", payment: "pix", category: "Parcelas", account: nubank });
  }
  // Moradia R$ 1.800,00
  addTx({ mode: "pessoal", type: "despesa", description: "Aluguel", amountCents: 180000, date: "2026-10-05", payment: "pix", category: "Moradia", account: itau });
  // Compras online R$ 936,63
  addTx({ mode: "pessoal", type: "despesa", description: "Tênis de corrida", amountCents: 11663, date: "2026-10-23", payment: "credito", category: "Compras online", card: inter });
  addTx({ mode: "pessoal", type: "despesa", description: "Cadeira de escritório", amountCents: 52000, date: "2026-10-14", payment: "debito", category: "Compras online", account: itau });
  addTx({ mode: "pessoal", type: "despesa", description: "Fone de ouvido", amountCents: 30000, date: "2026-10-19", payment: "debito", category: "Compras online", account: nubank });
  // Alimentação R$ 756,50
  addTx({ mode: "pessoal", type: "despesa", description: "Almoços da semana", amountCents: 45650, date: "2026-10-09", payment: "debito", category: "Alimentação", account: nubank });
  addTx({ mode: "pessoal", type: "despesa", description: "Padaria e lanches", amountCents: 30000, date: "2026-10-21", payment: "dinheiro", category: "Alimentação", account: dinheiro });
  // Demais categorias somam R$ 1.083,20
  addTx({ mode: "pessoal", type: "despesa", description: "Mercado do mês", amountCents: 37430, date: "2026-10-07", payment: "debito", category: "Mercado", account: nubank });
  addTx({ mode: "pessoal", type: "despesa", description: "Luz e internet", amountCents: 21000, date: "2026-10-15", payment: "pix", category: "Contas", account: itau });
  addTx({ mode: "pessoal", type: "despesa", description: "Gasolina", amountCents: 18000, date: "2026-10-11", payment: "debito", category: "Gasolina", account: nubank });
  addTx({ mode: "pessoal", type: "despesa", description: "Academia", amountCents: 12000, date: "2026-10-03", payment: "pix", category: "Academia", account: nubank });
  addTx({ mode: "pessoal", type: "despesa", description: "Plano de telefone", amountCents: 9990, date: "2026-10-06", payment: "debito", category: "Plano de telefone", account: nubank });
  addTx({ mode: "pessoal", type: "despesa", description: "Mensalidade do clube", amountCents: 9900, date: "2026-10-02", payment: "credito", category: "Lazer", card: inter });

  // ---------- Empresa ----------
  addCategory("casa", "Receita de serviço", "receita", false);
  addCategory("casa", "Pró-labore", "despesa", true);
  addCategory("casa", "Impostos", "despesa", true);
  addCategory("casa", "Fornecedores", "despesa", true);
  addCategory("casa", "Tarifa bancária", "despesa", true);

  const contaEmpresa = addAccount("casa", "Conta empresa", "corrente", 2240000);
  const reservaEmpresa = addGoal("casa", "Reserva da empresa", 3000000, "emergencia");
  addTx({ mode: "casa", type: "reserva", description: "Reserva da empresa", amountCents: 400000, date: "2026-09-15", payment: "pix", account: contaEmpresa, goal: reservaEmpresa });

  // Receitas de outubro somam R$ 12.000,00. Despesas somam R$ 7.400,00.
  addTx({ mode: "casa", type: "receita", description: "Contrato de consultoria", amountCents: 800000, date: "2026-10-06", payment: "pix", category: "Receita de serviço", account: contaEmpresa });
  addTx({ mode: "casa", type: "receita", description: "Projeto de implantação", amountCents: 400000, date: "2026-10-20", payment: "pix", category: "Receita de serviço", account: contaEmpresa });
  addTx({ mode: "casa", type: "despesa", description: "Pró-labore", amountCents: 300000, date: "2026-10-05", payment: "pix", category: "Pró-labore", account: contaEmpresa });
  addTx({ mode: "casa", type: "despesa", description: "Impostos do mês", amountCents: 140000, date: "2026-10-20", payment: "pix", category: "Impostos", account: contaEmpresa });
  addTx({ mode: "casa", type: "despesa", description: "Fornecedor de software", amountCents: 291000, date: "2026-10-10", payment: "pix", category: "Fornecedores", account: contaEmpresa });
  addTx({ mode: "casa", type: "despesa", description: "Tarifa bancária", amountCents: 9000, date: "2026-10-28", payment: "debito", category: "Tarifa bancária", account: contaEmpresa });

  return { accounts, cards, categories, transactions, goals, debts };
}
