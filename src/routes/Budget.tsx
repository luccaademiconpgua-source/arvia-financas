import type { Mode } from "../types";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton } from "../components/Sheet";
import { useModeData } from "../hooks/useModeData";
import { shiftMonth, todayIso } from "../lib/clock";
import { formatBrl, parseBrlToCents } from "../lib/money";
import { budgetLines, monthlyAverage, savingsStatus, type BudgetLine } from "../lib/budget";
import { removeBudget, setCategoryLimit, setSavingsPct, useBudgets } from "../services/budgets";
import { useUI } from "../store/ui";

const monthName = (ym: string) => format(parseISO(`${ym}-01`), "MMMM 'de' yyyy", { locale: ptBR });
const BAR = { ok: "bg-brand", alerta: "bg-warn", estourou: "bg-danger" } as const;

export function Budget() {
  const { ready, mode, categories, transactions } = useModeData();
  const { ready: bReady, budgets } = useBudgets(mode);
  const today = todayIso();
  const [ym, setYm] = useState(today.slice(0, 7));
  const lines = useMemo(() => budgetLines(budgets, transactions, ym, today), [budgets, transactions, ym, today]);
  const avg = useMemo(() => monthlyAverage(transactions, ym), [transactions, ym]);

  if (!ready || !bReady) return <Empty>Carregando…</Empty>;

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Categoria";
  const total = lines.reduce((s, l) => s + l.limitCents, 0);
  const spent = lines.reduce((s, l) => s + l.spentCents, 0);
  const savings = budgets.find((b) => b.savingsPct !== null);
  const without = categories.filter((c) => c.kind === "despesa" && !budgets.some((b) => b.categoryId === c.id));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Mês anterior" onClick={() => setYm(shiftMonth(ym, -1))} className="flex size-11 items-center justify-center rounded-lg border border-line"><ChevronLeft size={20} aria-hidden="true" /></button>
          <h2 className="font-display text-center text-lg font-semibold">Orçamento de {monthName(ym)}</h2>
          <button type="button" aria-label="Próximo mês" onClick={() => setYm(shiftMonth(ym, 1))} className="flex size-11 items-center justify-center rounded-lg border border-line"><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        {lines.length > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Gasto nas categorias com teto</span>
              <span className="num font-medium">{formatBrl(spent)} de {formatBrl(total)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${Math.round((spent / total) * 100)}% do orçamento usado`}>
              <div className={`h-2 rounded-full ${spent > total ? "bg-danger" : spent >= total * 0.8 ? "bg-warn" : "bg-brand"}`} style={{ width: `${Math.min(100, (spent / total) * 100)}%` }} />
            </div>
          </div>
        )}
      </Card>

      <SavingsCard mode={mode} pct={savings?.savingsPct ?? null} existing={savings} ym={ym} />

      <Card title="Tetos por categoria">
        {lines.length === 0 ? (
          <p className="text-sm text-muted">Defina quanto quer gastar por mês em cada categoria. A barra fica amarela a partir de 80% e vermelha quando passa do teto.</p>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((l) => <LineItem key={l.categoryId} line={l} name={catName(l.categoryId)} mode={mode} />)}
          </ul>
        )}
      </Card>

      {without.length > 0 && <AddLimit mode={mode} options={without} avg={avg} />}
    </div>
  );
}

function LineItem({ line, name, mode }: { line: BudgetLine; name: string; mode: Mode }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState((line.limitCents / 100).toFixed(2).replace(".", ","));
  const showToast = useUI((s) => s.showToast);
  const pct = Math.round(line.pct * 100);
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{name}</span>
        <span className="flex items-center gap-2">
          {line.state !== "ok" && <Pill tone={line.state === "estourou" ? "danger" : "warn"}>{line.state === "estourou" ? "Passou do teto" : `${pct}% usado`}</Pill>}
          <button type="button" className="text-sm text-brand underline underline-offset-4" onClick={() => setEditing((v) => !v)}>{editing ? "Fechar" : "Alterar"}</button>
        </span>
      </div>
      <div className="mt-1 flex justify-between text-sm">
        <span className="num">{formatBrl(line.spentCents)} de {formatBrl(line.limitCents)}</span>
        <span className={`num ${line.remainingCents < 0 ? "text-danger" : "text-muted"}`}>
          {line.remainingCents >= 0 ? `sobram ${formatBrl(line.remainingCents)}` : `passou ${formatBrl(-line.remainingCents)}`}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${pct}% do teto de ${name}`}>
        <div className={`h-2 rounded-full ${BAR[line.state]}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {(line.perDayCents !== null || line.forecastCents !== null) && (
        <p className="mt-1 text-xs text-muted">
          {line.perDayCents !== null ? `Dá para gastar ${formatBrl(line.perDayCents)} por dia até o fim do mês.` : ""}
          {line.forecastCents !== null && line.forecastCents > line.limitCents ? ` No ritmo atual, termina o mês em ${formatBrl(line.forecastCents)}.` : ""}
        </p>
      )}
      {editing && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const c = parseBrlToCents(value);
            if (!c || c <= 0) return;
            void setCategoryLimit(mode, line.budget, line.categoryId, c).then(() => { showToast("Teto atualizado"); setEditing(false); });
          }}
        >
          <Field label="Teto por mês"><input className={`${inputClass} w-36`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
          <PrimaryButton type="submit">Salvar</PrimaryButton>
          <button type="button" aria-label={`Tirar ${name} do orçamento`} className="flex size-11 items-center justify-center rounded-lg text-muted hover:text-danger" onClick={() => void removeBudget(line.budget.id)}>
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </form>
      )}
    </li>
  );
}

function AddLimit({ mode, options, avg }: { mode: Mode; options: Array<{ id: string; name: string }>; avg: Map<string, number> }) {
  const showToast = useUI((s) => s.showToast);
  const sorted = [...options].sort((a, b) => (avg.get(b.id) ?? 0) - (avg.get(a.id) ?? 0));
  const [picked, setCat] = useState(sorted[0]?.id ?? "");
  // se a categoria escolhida acabou de entrar no orçamento, volta para a primeira da lista
  const cat = sorted.some((c) => c.id === picked) ? picked : (sorted[0]?.id ?? "");
  const suggestion = avg.get(cat) ?? 0;
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <Card title="Adicionar teto">
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const c = parseBrlToCents(value) ?? (value.trim() === "" && suggestion > 0 ? suggestion : null);
          if (!cat) return setError("Escolha a categoria.");
          if (!c || c <= 0) return setError("Informe o teto, como 1.200,00.");
          setError("");
          void setCategoryLimit(mode, undefined, cat, c).then(() => { showToast("Teto criado"); setValue(""); });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoria">
            <select className={inputClass} value={cat} onChange={(e) => setCat(e.target.value)}>
              {sorted.map((c) => <option key={c.id} value={c.id}>{c.name}{avg.get(c.id) ? `, média ${formatBrl(avg.get(c.id)!)}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Teto por mês" error={error}>
            <input className={inputClass} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={suggestion > 0 ? (suggestion / 100).toFixed(2).replace(".", ",") : "1.200,00"} />
          </Field>
        </div>
        {suggestion > 0 && <p className="text-xs text-muted">Você gastou em média {formatBrl(suggestion)} por mês nos últimos 3 meses. Deixe em branco para usar esse valor.</p>}
        <PrimaryButton type="submit" className="self-start">Adicionar ao orçamento</PrimaryButton>
      </form>
    </Card>
  );
}

function SavingsCard({ mode, pct, existing, ym }: { mode: Mode; pct: number | null; existing: ReturnType<typeof useBudgets>["budgets"][number] | undefined; ym: string }) {
  const { transactions } = useModeData();
  const [value, setValue] = useState(pct ? String(pct) : "20");
  const showToast = useUI((s) => s.showToast);
  const s = pct ? savingsStatus(pct, transactions, ym) : null;
  return (
    <Card title="Meta de guardar">
      {s ? (
        <>
          <p className="text-sm">
            Guardar <strong>{pct}%</strong> do que entra: {formatBrl(s.targetCents)} de {formatBrl(s.incomeCents)} recebidos.
          </p>
          <p className={`mt-1 text-sm ${s.reached ? "text-income" : "text-muted"}`}>
            {s.incomeCents === 0
              ? "Ainda não entrou receita neste mês."
              : s.reached
                ? `Até agora sobrou ${formatBrl(s.savedCents)}: meta batida.`
                : `Até agora sobrou ${formatBrl(Math.max(0, s.savedCents))}. Faltam ${formatBrl(s.targetCents - Math.max(0, s.savedCents))} para a meta.`}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">Quanto da sua receita você quer que sobre todo mês? Uma referência comum é 20%.</p>
      )}
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(value);
          if (!Number.isInteger(n) || n < 1 || n > 90) return;
          void setSavingsPct(mode, existing, n).then(() => showToast("Meta salva"));
        }}
      >
        <Field label="Porcentagem"><input className={`${inputClass} w-24`} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 2))} /></Field>
        <PrimaryButton type="submit">{pct ? "Atualizar" : "Definir meta"}</PrimaryButton>
        {pct && <SecondaryButton type="button" onClick={() => void setSavingsPct(mode, existing, null)}>Remover</SecondaryButton>}
      </form>
    </Card>
  );
}
