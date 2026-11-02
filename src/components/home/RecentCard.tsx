import { Link } from "react-router";
import { Card, Empty } from "../ui";
import { sortByDateDesc, TransactionRow } from "../TransactionRow";
import type { Account, Card as CardT, Category, Transaction } from "../../types";

export function RecentCard({ transactions, lookups }: { transactions: Transaction[]; lookups: { categories: Category[]; accounts: Account[]; cards: CardT[] } }) {
  const list = sortByDateDesc(transactions).slice(0, 5);
  return (
    <Card title="Últimas movimentações" className="h-full">
      {list.length === 0 ? (
        <Empty>Nenhum lançamento ainda. Use Receita ou Despesa para começar.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((t) => (
            <TransactionRow key={t.id} t={t} lookups={lookups} />
          ))}
        </ul>
      )}
      <Link to="/transacoes" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-4">
        Ver todas
      </Link>
    </Card>
  );
}
