import { useState } from "react";
import { format, parseISO } from "date-fns";
import { PrimaryButton, SecondaryButton, Sheet } from "./Sheet";
import { useModeData } from "../hooks/useModeData";
import { formatBrl } from "../lib/money";
import { deleteTransaction } from "../store/actions";
import { useUI } from "../store/ui";

const typeLabel = { receita: "Receita", despesa: "Despesa", reserva: "Reserva", ajuste: "Ajuste de saldo" } as const;
const payLabel = { pix: "Pix", dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito" } as const;
const sourceLabel = { manual: "Lançamento manual", nfce: "Nota fiscal (NFC-e)", open_finance: "Open Finance", fatura: "Pagamento de fatura", extrato: "Extrato importado" } as const;

export function TransactionDetailSheet() {
  const id = useUI((s) => s.detailId);
  const close = useUI((s) => s.closeDetail);
  const showToast = useUI((s) => s.showToast);
  const [confirming, setConfirming] = useState(false);
  const { transactions, categories, accounts, cards, goals } = useModeData();
  const found = id ? transactions.find((x) => x.id === id) : undefined;
  const data = found
    ? {
        t: found,
        category: categories.find((c) => c.id === found.categoryId)?.name,
        account: accounts.find((a) => a.id === found.accountId)?.name,
        card: cards.find((c) => c.id === found.cardId)?.label,
        goal: goals.find((g) => g.id === found.goalId)?.name,
      }
    : null;

  if (!id) return null;
  const done = () => {
    setConfirming(false);
    close();
  };
  if (!data) {
    return (
      <Sheet title="Lançamento" onClose={done}>
        <p className="text-sm text-muted">Carregando…</p>
      </Sheet>
    );
  }
  const { t } = data;
  const rows: Array<[string, string]> = [
    ["Tipo", typeLabel[t.type]],
    ["Valor", formatBrl(t.amountCents)],
    ["Data", format(parseISO(t.date), "dd/MM/yyyy")],
    ["Categoria", data.category ?? "-"],
    [t.cardId ? "Cartão" : "Conta", (t.cardId ? data.card : data.account) ?? "-"],
    ["Forma de pagamento", payLabel[t.payment]],
    ["Origem", sourceLabel[t.source]],
  ];
  if (data.goal) rows.push(["Meta", data.goal]);
  if (t.type === "despesa") rows.push(["Essencial", t.essential ? "Sim" : "Não"]);

  return (
    <Sheet title={t.description} onClose={done}>
      <dl className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="num text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted">Excluir desfaz o efeito deste lançamento no saldo, nas faturas e nas metas.</p>
      <div className="mt-4 flex gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => {
                void deleteTransaction(t.id).then(() => {
                  showToast("Lançamento excluído");
                  done();
                });
              }}
              className="min-h-11 flex-1 rounded-lg bg-danger px-4 text-sm font-medium text-white"
            >
              Confirmar exclusão
            </button>
            <SecondaryButton type="button" onClick={() => setConfirming(false)}>
              Cancelar
            </SecondaryButton>
          </>
        ) : (
          <>
            <SecondaryButton type="button" onClick={() => setConfirming(true)} className="flex-1">
              Excluir lançamento
            </SecondaryButton>
            <PrimaryButton type="button" onClick={done}>
              Fechar
            </PrimaryButton>
          </>
        )}
      </div>
    </Sheet>
  );
}
