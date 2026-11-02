import { useState } from "react";
import { format, parseISO } from "date-fns";
import { PrimaryButton, SecondaryButton, Sheet } from "./Sheet";
import { useModeData } from "../hooks/useModeData";
import { formatBrl } from "../lib/money";
import { classifyTransaction, deleteInstallmentGroup, deleteTransaction, unlinkMatch } from "../store/actions";
import { inputClass } from "./Sheet";
import type { Transaction } from "../types";
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
    ...(t.merchant ? ([["No extrato", t.description]] as Array<[string, string]>) : []),
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
  if (t.isTransfer) rows.push(["Conta nos totais", "Não, é transferência"]);
  if (t.installment) rows.push(["Parcela", `${t.installment.no} de ${t.installment.total}`]);
  const canTransfer = (t.type === "receita" || t.type === "despesa") && t.source !== "fatura";

  return (
    <Sheet title={t.merchant || t.description} onClose={done}>
      <dl className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="num text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {t.bankMatch && <BankMatch t={t} />}
      {canTransfer && <Classify key={t.id} t={t} />}
      <p className="mt-3 text-sm text-muted">Excluir desfaz o efeito deste lançamento no saldo, nas faturas e nas metas.</p>
      <div className="mt-4 flex flex-wrap gap-2">
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
              {t.installment ? "Excluir só esta parcela" : "Confirmar exclusão"}
            </button>
            {t.installment && (
              <button
                type="button"
                onClick={() => {
                  void deleteInstallmentGroup(t.installment!.group).then(() => {
                    showToast("Compra parcelada excluída");
                    done();
                  });
                }}
                className="min-h-11 flex-1 rounded-lg bg-danger px-4 text-sm font-medium text-white"
              >
                Excluir as {t.installment.total} parcelas
              </button>
            )}
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

function Classify({ t }: { t: Transaction }) {
  const { categories } = useModeData();
  const showToast = useUI((s) => s.showToast);
  const options = categories.filter((c) => c.kind === t.type);
  const [mode, setMode] = useState<"transfer" | "category">(t.isTransfer ? "transfer" : "category");
  const [categoryId, setCategoryId] = useState(t.categoryId ?? options.find((c) => c.name.startsWith("Outra"))?.id ?? options[0]?.id ?? "");
  const [same, setSame] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = (mode === "transfer") !== Boolean(t.isTransfer) || (mode === "category" && categoryId !== (t.categoryId ?? ""));
  const label = t.type === "despesa" ? "Despesa" : "Receita";

  async function save() {
    setBusy(true);
    setError("");
    try {
      const n = await classifyTransaction(t.id, mode === "transfer", mode === "category" ? categoryId || null : null, same);
      showToast(n > 1 ? `${n} lançamentos atualizados` : "Classificação salva");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="mt-3 rounded-lg border border-line p-3">
      <legend className="px-1 text-sm font-medium">Como contar este lançamento</legend>
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-start gap-2">
          <input type="radio" name="classify" className="mt-1 size-4" checked={mode === "transfer"} onChange={() => setMode("transfer")} />
          <span>
            Transferência entre contas
            <span className="block text-xs text-muted">Dinheiro que só mudou de lugar. Não entra em receitas nem despesas.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="classify" className="mt-1 size-4" checked={mode === "category"} onChange={() => setMode("category")} />
          <span>
            {label} de verdade
            <span className="block text-xs text-muted">{t.type === "despesa" ? "Conta como gasto na categoria escolhida." : "Conta como ganho na categoria escolhida."}</span>
          </span>
        </label>
        {mode === "category" && (
          <select aria-label="Categoria" className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1 size-4" checked={same} onChange={(e) => setSame(e.target.checked)} />
          <span>Aplicar a todos de "{t.merchant || t.description}" e lembrar para os próximos</span>
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <SecondaryButton type="button" className="mt-3" disabled={busy || (!changed && !same)} onClick={() => void save()}>
        {busy ? "Salvando…" : "Salvar classificação"}
      </SecondaryButton>
    </fieldset>
  );
}

function BankMatch({ t }: { t: Transaction }) {
  const { accounts, cards } = useModeData();
  const showToast = useUI((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const m = t.bankMatch!;
  const where = m.cardId ? cards.find((c) => c.id === m.cardId)?.label : accounts.find((a) => a.id === m.accountId)?.name;
  return (
    <div className="mt-3 rounded-lg border border-income/30 bg-income-bg p-3 text-sm">
      <p className="font-medium text-income">Conferido no banco</p>
      <p className="mt-1">
        {m.description} em {format(parseISO(m.date), "dd/MM/yyyy")}
        {where ? `, ${where}` : ""} ({m.source === "open_finance" ? "Open Finance" : "extrato importado"}).
      </p>
      <p className="mt-1 text-xs text-muted">É a mesma compra: conta uma vez só, com os dados deste lançamento.</p>
      <SecondaryButton
        type="button"
        className="mt-2 bg-card"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void unlinkMatch(t.id)
            .then(() => showToast("Vínculo desfeito: os dois voltam a contar separados"))
            .finally(() => setBusy(false));
        }}
      >
        Não é a mesma compra
      </SecondaryButton>
    </div>
  );
}
