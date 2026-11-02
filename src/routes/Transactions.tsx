import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, Empty } from "../components/ui";
import { inputClass } from "../components/Sheet";
import { sortByDateDesc, TransactionRow } from "../components/TransactionRow";
import { useModeData } from "../hooks/useModeData";
import type { Transaction } from "../types";

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const chips = [
  { value: "", label: "Todos" },
  { value: "receita", label: "Receitas" },
  { value: "despesa", label: "Despesas" },
  { value: "reserva", label: "Reservas" },
  { value: "transferencia", label: "Transferências" },
];
const payments = [
  { value: "", label: "Todas as formas" },
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
];

export function Transactions() {
  const { ready, transactions, categories, accounts, cards } = useModeData();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const type = params.get("tipo") ?? "";
  const cat = params.get("categoria") ?? "";
  const pay = params.get("pagamento") ?? "";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return sortByDateDesc(
      transactions.filter((t) => {
        if (type === "transferencia") {
          if (!t.isTransfer) return false;
        } else if (type && (t.type !== type || t.isTransfer)) return false;
        if (cat && t.categoryId !== cat) return false;
        if (pay && t.payment !== pay) return false;
        if (nq && !norm(`${t.description} ${t.merchant ?? ""}`).includes(nq)) return false;
        return true;
      }),
    );
  }, [transactions, q, type, cat, pay]);

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of filtered) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m.entries()];
  }, [filtered]);

  if (!ready) return <Empty>Carregando…</Empty>;
  const lookups = { categories, accounts, cards };
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Buscar lançamento</span>
          <input type="search" className={inputClass} value={q} onChange={(e) => set("q", e.target.value)} placeholder="Descrição" />
        </label>
        <div role="group" aria-label="Tipo" className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.value} type="button" aria-pressed={type === c.value} onClick={() => set("tipo", c.value)} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${type === c.value ? "border-brand bg-brand text-white" : "border-line text-muted"}`}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Categoria</span>
            <select className={inputClass} value={cat} onChange={(e) => set("categoria", e.target.value)}>
              <option value="">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Forma de pagamento</span>
            <select className={inputClass} value={pay} onChange={(e) => set("pagamento", e.target.value)}>
              {payments.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>
      {groups.length === 0 ? (
        <Card>
          <Empty>Nenhum lançamento encontrado.</Empty>
        </Card>
      ) : (
        groups.map(([date, list]) => (
          <Card key={date} title={format(parseISO(date), "EEEE, dd 'de' MMMM", { locale: ptBR })}>
            <ul className="divide-y divide-line">
              {list.map((t) => (
                <TransactionRow key={t.id} t={t} lookups={lookups} />
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
