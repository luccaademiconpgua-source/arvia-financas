import { useMemo, useState } from "react";
import { format, parseISO, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../components/Sheet";
import { useModeData } from "../hooks/useModeData";
import { todayIso } from "../lib/clock";
import { formatBrl } from "../lib/money";
import { budgetLines } from "../lib/budget";
import {
  MEAL_LABEL,
  estimateList,
  lastPrice,
  missingForPlan,
  nameMatches,
  pantrySuggestions,
  parseItemText,
  plannedIngredients,
  priceSummaries,
  pricesFor,
  type Ingredient,
  type MealSlot,
  type Recipe,
} from "../lib/kitchen";
import { useBudgets } from "../services/budgets";
import {
  addMeal,
  addPantry,
  addShopping,
  clearChecked,
  deleteRecipe,
  removeMeal,
  removePantry,
  removeShopping,
  saveRecipe,
  setPantryStatus,
  toggleShopping,
  useKitchen,
  type KitchenData,
} from "../services/kitchen";
import { useUI } from "../store/ui";
import type { Mode } from "../types";

type Tab = "lista" | "despensa" | "cardapio" | "precos";
const TABS: Array<{ v: Tab; l: string }> = [
  { v: "lista", l: "Lista" },
  { v: "despensa", l: "Despensa" },
  { v: "cardapio", l: "Cardápio" },
  { v: "precos", l: "Preços" },
];
const dayLabel = (iso: string) => { const t = format(parseISO(iso), "EEEE, dd/MM", { locale: ptBR }); return t.charAt(0).toUpperCase() + t.slice(1); };
const dm = (iso: string) => format(parseISO(iso), "dd/MM");
const qtyText = (q: number | null, u: string | null) => (q === null ? "" : `${String(q).replace(".", ",")}${u ? ` ${u}` : ""}`);

export function Kitchen() {
  const { ready: mReady, mode, categories, transactions } = useModeData();
  const [tab, setTab] = useState<Tab>("lista");
  const [week, setWeek] = useState(() => format(startOfWeek(parseISO(todayIso()), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const weekEnd = format(addDays(parseISO(week), 6), "yyyy-MM-dd");
  const k = useKitchen(mode, week, weekEnd);
  const { budgets } = useBudgets(mode);

  if (!mReady || !k.ready) return <Empty>{k.error || "Carregando…"}</Empty>;

  const mercado = categories.find((c) => c.kind === "despesa" && c.name === "Mercado");
  const mercadoLine = mercado ? budgetLines(budgets, transactions, todayIso().slice(0, 7), todayIso()).find((l) => l.categoryId === mercado.id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Compras e cozinha" className="grid grid-cols-4 rounded-xl border border-line bg-card p-1">
        {TABS.map((t) => (
          <button key={t.v} type="button" role="tab" aria-selected={tab === t.v} onClick={() => setTab(t.v)} className={`min-h-11 rounded-lg text-sm font-medium ${tab === t.v ? "bg-brand text-white" : "text-muted"}`}>
            {t.l}
          </button>
        ))}
      </div>
      {mode === "pessoal" && (
        <p className="text-xs text-muted">Você está no modo Pessoal. Para dividir a lista com a outra pessoa da casa, troque para Casa no topo.</p>
      )}
      {tab === "lista" && <ListTab mode={mode} k={k} mercadoRemaining={mercadoLine?.remainingCents ?? null} />}
      {tab === "despensa" && <PantryTab mode={mode} k={k} />}
      {tab === "cardapio" && <PlanTab mode={mode} k={k} week={week} setWeek={setWeek} />}
      {tab === "precos" && <PricesTab k={k} />}
    </div>
  );
}

// ---------- Lista ----------

function ListTab({ mode, k, mercadoRemaining }: { mode: Mode; k: KitchenData; mercadoRemaining: number | null }) {
  const [text, setText] = useState("");
  const showToast = useUI((s) => s.showToast);
  const open = k.shopping.filter((i) => !i.checked);
  const done = k.shopping.filter((i) => i.checked);
  const est = estimateList(k.shopping, k.prices);
  const suggestions = pantrySuggestions(k.pantry, todayIso()).filter((s) => !open.some((i) => nameMatches(i.name, s.item.key)));

  return (
    <>
      <Card>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const parts = text.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
            if (parts.length === 0) return;
            void addShopping(mode, parts.map(parseItemText)).then(() => setText(""));
          }}
        >
          <label className="sr-only" htmlFor="novo-item">Adicionar item</label>
          <input id="novo-item" className={`${inputClass} min-w-0 flex-1`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: 2 kg arroz, leite, 6 ovos" autoComplete="off" />
          <PrimaryButton type="submit" aria-label="Adicionar"><Plus size={18} aria-hidden="true" /></PrimaryButton>
        </form>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>
            Estimativa: <strong className="num">{formatBrl(est.totalCents)}</strong>
            {est.missing > 0 && <span className="text-muted"> ({est.missing} {est.missing === 1 ? "item" : "itens"} sem preço)</span>}
          </span>
          {mercadoRemaining !== null && (
            <span className={mercadoRemaining < est.totalCents ? "text-danger" : "text-muted"}>
              {mercadoRemaining >= 0 ? `Sobram ${formatBrl(mercadoRemaining)} no orçamento de Mercado` : `Orçamento de Mercado já passou ${formatBrl(-mercadoRemaining)}`}
            </span>
          )}
        </div>
      </Card>

      <Card title={`Para comprar (${open.length})`}>
        {open.length === 0 ? (
          <p className="text-sm text-muted">Lista vazia. Adicione itens acima, separando por vírgula, ou use as sugestões da despensa.</p>
        ) : (
          <ul className="divide-y divide-line">
            {open.map((i) => {
              const p = lastPrice(i.name, k.prices);
              return (
                <li key={i.id} className="flex items-center gap-3 py-2">
                  <button type="button" aria-label={`Marcar ${i.name} como comprado`} onClick={() => void toggleShopping(i.id, true)} className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-line hover:border-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.name} {i.quantity !== null && <span className="text-muted">{qtyText(i.quantity, i.unit)}</span>}</span>
                    <span className="block truncate text-xs text-muted">
                      {p ? `${formatBrl(p.unitCents)}${p.unit !== "UN" ? `/${p.unit.toLowerCase()}` : ""} no ${p.store} em ${dm(p.date)}` : "sem preço nas notas ainda"}
                      {i.source !== "manual" ? `, veio ${i.source === "despensa" ? "da despensa" : "do cardápio"}` : ""}
                    </span>
                  </span>
                  <button type="button" aria-label={`Tirar ${i.name}`} onClick={() => void removeShopping(i.id)} className="flex size-9 items-center justify-center rounded-lg text-muted hover:text-danger"><Trash2 size={16} aria-hidden="true" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {suggestions.length > 0 && (
        <Card title="Talvez esteja acabando">
          <ul className="flex flex-wrap gap-2">
            {suggestions.slice(0, 12).map((s) => (
              <li key={s.item.id}>
                <button
                  type="button"
                  onClick={() => void addShopping(mode, [{ name: s.item.name, qty: null, unit: null }], "despensa").then(() => showToast(`${s.item.name} na lista`))}
                  className="flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-sm hover:border-brand"
                >
                  <Plus size={14} aria-hidden="true" /> {s.item.name}
                  <span className="text-xs text-muted">{s.reason === "acabou" ? "acabou" : s.reason === "acabando" ? "acabando" : `há ${s.daysSince} dias`}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {done.length > 0 && (
        <Card title={`Já no carrinho (${done.length})`}>
          <ul className="divide-y divide-line">
            {done.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2 text-muted">
                <button type="button" aria-label={`Desmarcar ${i.name}`} onClick={() => void toggleShopping(i.id, false)} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-white"><Check size={16} aria-hidden="true" /></button>
                <span className="min-w-0 flex-1 truncate line-through">{i.name} {qtyText(i.quantity, i.unit)}</span>
              </li>
            ))}
          </ul>
          <SecondaryButton type="button" className="mt-2" onClick={() => void clearChecked(mode)}>Limpar os comprados</SecondaryButton>
          <p className="mt-2 text-xs text-muted">Depois do mercado, escaneie a nota: os itens entram na despensa e os preços ficam guardados.</p>
        </Card>
      )}
    </>
  );
}

const normalized = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

// ---------- Despensa ----------

function PantryTab({ mode, k }: { mode: Mode; k: KitchenData }) {
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const showToast = useUI((s) => s.showToast);
  const list = k.pantry.filter((p) => !filter || normalized(p.name).includes(normalized(filter)));
  const STATUS = { tem: { l: "Tem", tone: "ok" }, acabando: { l: "Acabando", tone: "warn" }, acabou: { l: "Acabou", tone: "danger" } } as const;
  return (
    <>
      <Card>
        <p className="text-sm text-muted">
          Tudo o que vem nas notas fiscais escaneadas entra aqui sozinho. Marque o que está acabando, e a Arvia sugere na lista de compras, junto com o que já passou do tempo normal de recompra.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void addPantry(mode, name.trim()).then(() => setName("")).catch((err: Error) => showToast(err.message));
          }}
        >
          <label className="sr-only" htmlFor="desp-item">Adicionar à despensa</label>
          <input id="desp-item" className={`${inputClass} min-w-0 flex-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Adicionar item à mão" />
          <SecondaryButton type="submit">Adicionar</SecondaryButton>
        </form>
      </Card>
      <Card title={`Na despensa (${k.pantry.length})`}>
        {k.pantry.length > 8 && <input className={`${inputClass} mb-2`} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Procurar" aria-label="Procurar na despensa" />}
        {list.length === 0 ? (
          <p className="text-sm text-muted">A despensa enche quando você escaneia as notas do mercado.</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-muted">
                    {p.lastBought ? `comprado em ${dm(p.lastBought)}` : "sem compra registrada"}
                    {p.avgIntervalDays ? `, costuma comprar a cada ${p.avgIntervalDays} dias` : ""}
                  </span>
                </span>
                <div role="radiogroup" aria-label={`Situação de ${p.name}`} className="flex gap-1">
                  {(["tem", "acabando", "acabou"] as const).map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={p.status === s} onClick={() => void setPantryStatus(p.id, s)} className={`min-h-9 rounded-full border px-2.5 text-xs ${p.status === s ? "border-brand bg-brand text-white" : "border-line text-muted"}`}>
                      {STATUS[s].l}
                    </button>
                  ))}
                </div>
                <button type="button" aria-label={`Tirar ${p.name} da despensa`} onClick={() => void removePantry(p.id)} className="flex size-9 items-center justify-center rounded-lg text-muted hover:text-danger"><Trash2 size={16} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

// ---------- Cardápio ----------

function PlanTab({ mode, k, week, setWeek }: { mode: Mode; k: KitchenData; week: string; setWeek: (w: string) => void }) {
  const showToast = useUI((s) => s.showToast);
  const [recipeSheet, setRecipeSheet] = useState<null | { recipe?: Recipe }>(null);
  const [adding, setAdding] = useState<null | { date: string }>(null);
  const days = Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(week), i), "yyyy-MM-dd"));
  const ings = useMemo(() => plannedIngredients(k.plan, k.recipes), [k.plan, k.recipes]);
  const missing = useMemo(() => missingForPlan(ings, k.pantry, k.shopping), [ings, k.pantry, k.shopping]);

  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Semana anterior" onClick={() => setWeek(format(addDays(parseISO(week), -7), "yyyy-MM-dd"))} className="flex size-11 items-center justify-center rounded-lg border border-line"><ChevronLeft size={20} aria-hidden="true" /></button>
          <h2 className="font-display text-center text-base font-semibold">Semana de {format(parseISO(week), "dd/MM")} a {format(addDays(parseISO(week), 6), "dd/MM")}</h2>
          <button type="button" aria-label="Próxima semana" onClick={() => setWeek(format(addDays(parseISO(week), 7), "yyyy-MM-dd"))} className="flex size-11 items-center justify-center rounded-lg border border-line"><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {days.map((d) => {
            const meals = k.plan.filter((m) => m.date === d);
            return (
              <li key={d} className="py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{dayLabel(d)}</span>
                  <button type="button" className="flex min-h-9 items-center gap-1 text-sm text-brand" onClick={() => setAdding({ date: d })}><Plus size={14} aria-hidden="true" /> Refeição</button>
                </div>
                {meals.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {meals.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate"><span className="text-muted">{MEAL_LABEL[m.meal]}:</span> {m.title} <span className="text-muted">({m.people} {m.people === 1 ? "pessoa" : "pessoas"})</span></span>
                        <button type="button" aria-label={`Tirar ${m.title}`} onClick={() => void removeMeal(m.id)} className="flex size-8 items-center justify-center text-muted hover:text-danger"><Trash2 size={14} aria-hidden="true" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Ingredientes da semana">
        {ings.length === 0 ? (
          <p className="text-sm text-muted">Monte o cardápio com receitas salvas e a Arvia soma os ingredientes, ajustados ao número de pessoas.</p>
        ) : (
          <>
            <ul className="space-y-1 text-sm">
              {ings.map((g) => {
                const miss = missing.includes(g);
                return (
                  <li key={`${g.name}|${g.unit}`} className="flex justify-between gap-2">
                    <span>{g.name} <span className="text-muted">{qtyText(g.qty, g.unit)}</span></span>
                    <span className={miss ? "text-danger" : "text-income"}>{miss ? "falta" : "tem ou já está na lista"}</span>
                  </li>
                );
              })}
            </ul>
            {missing.length > 0 && (
              <PrimaryButton type="button" className="mt-3" onClick={() => void addShopping(mode, missing, "cardapio").then(() => showToast(`${missing.length} itens na lista de compras`))}>
                Mandar o que falta para a lista ({missing.length})
              </PrimaryButton>
            )}
          </>
        )}
      </Card>

      <Card title="Receitas">
        {k.recipes.length === 0 ? (
          <p className="text-sm text-muted">Salve as receitas que vocês fazem, com os ingredientes para quantas pessoas elas servem.</p>
        ) : (
          <ul className="divide-y divide-line">
            {k.recipes.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setRecipeSheet({ recipe: r })} className="flex min-h-11 w-full items-center justify-between gap-2 py-2 text-left text-sm">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-muted">{r.ingredients.length} ingredientes, serve {r.servings}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <SecondaryButton type="button" className="mt-3" onClick={() => setRecipeSheet({})}>Nova receita</SecondaryButton>
      </Card>

      {recipeSheet && <RecipeSheet mode={mode} {...(recipeSheet.recipe ? { recipe: recipeSheet.recipe } : {})} onClose={() => setRecipeSheet(null)} />}
      {adding && <MealSheet mode={mode} date={adding.date} recipes={k.recipes} onClose={() => setAdding(null)} onNewRecipe={() => { setAdding(null); setRecipeSheet({}); }} />}
    </>
  );
}

function MealSheet({ mode, date, recipes, onClose, onNewRecipe }: { mode: Mode; date: string; recipes: Recipe[]; onClose: () => void; onNewRecipe: () => void }) {
  const [meal, setMeal] = useState<MealSlot>("almoco");
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [people, setPeople] = useState("2");
  const [error, setError] = useState("");
  return (
    <Sheet title={`Refeição de ${dayLabel(date).toLowerCase()}`} onClose={onClose}>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const r = recipes.find((x) => x.id === recipeId);
          const t = r?.title ?? title.trim();
          const n = Number(people);
          if (!t) return setError("Escolha uma receita ou escreva o que vai ter.");
          if (!Number.isInteger(n) || n < 1 || n > 50) return setError("Informe quantas pessoas.");
          void addMeal(mode, { date, meal, recipeId: r?.id ?? null, title: t.slice(0, 80), people: n }).then(onClose).catch((err: Error) => setError(err.message));
        }}
      >
        <div role="radiogroup" aria-label="Refeição" className="grid grid-cols-4 gap-1">
          {(Object.keys(MEAL_LABEL) as MealSlot[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={meal === m} onClick={() => setMeal(m)} className={`min-h-11 rounded-lg border text-sm ${meal === m ? "border-brand bg-brand text-white" : "border-line"}`}>{MEAL_LABEL[m]}</button>
          ))}
        </div>
        <Field label="Receita">
          <select className={inputClass} value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
            {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            <option value="">Sem receita (só o nome)</option>
          </select>
        </Field>
        {!recipeId && <Field label="O que vai ter"><input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pizza de sexta" /></Field>}
        <Field label="Quantas pessoas"><input className={inputClass} inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, "").slice(0, 2))} /></Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="submit" className="flex-1">Adicionar ao cardápio</PrimaryButton>
          <SecondaryButton type="button" onClick={onNewRecipe}>Criar receita</SecondaryButton>
        </div>
      </form>
    </Sheet>
  );
}

function RecipeSheet({ mode, recipe, onClose }: { mode: Mode; recipe?: Recipe; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const [title, setTitle] = useState(recipe?.title ?? "");
  const [servings, setServings] = useState(String(recipe?.servings ?? 2));
  const [ingText, setIngText] = useState((recipe?.ingredients ?? []).map((g) => `${g.qty !== null ? `${String(g.qty).replace(".", ",")}${g.unit ? ` ${g.unit}` : ""} ` : ""}${g.name}`).join("\n"));
  const [notes, setNotes] = useState(recipe?.notes ?? "");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet title={recipe ? recipe.title : "Nova receita"} onClose={onClose}>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(servings);
          const ingredients: Ingredient[] = ingText.split("\n").map((l) => l.trim()).filter(Boolean).map(parseItemText);
          if (title.trim().length < 2) return setError("Dê um nome à receita.");
          if (!Number.isInteger(n) || n < 1 || n > 50) return setError("Informe para quantas pessoas a receita serve.");
          if (ingredients.length === 0) return setError("Liste ao menos um ingrediente.");
          void saveRecipe(mode, { title: title.trim().slice(0, 80), servings: n, ingredients, notes: notes.trim() || null }, recipe?.id)
            .then(() => { showToast("Receita salva"); onClose(); })
            .catch((err: Error) => setError(err.message));
        }}
      >
        <Field label="Nome"><input className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Strogonoff de frango" /></Field>
        <Field label="Serve quantas pessoas"><input className={inputClass} inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value.replace(/\D/g, "").slice(0, 2))} /></Field>
        <Field label="Ingredientes (um por linha)">
          <textarea className={`${inputClass} min-h-40 py-2`} value={ingText} onChange={(e) => setIngText(e.target.value)} placeholder={"500 g frango\n1 caixa creme de leite\n200 g champignon\nsal"} />
        </Field>
        <p className="-mt-2 text-xs text-muted">Escreva a quantidade antes do nome, como "500 g frango". Sem quantidade também vale.</p>
        <Field label="Modo de preparo (opcional)"><textarea className={`${inputClass} min-h-24 py-2`} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <PrimaryButton type="submit" className="flex-1">Salvar receita</PrimaryButton>
          <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
        </div>
        {recipe && (
          <div className="border-t border-line pt-3 text-sm">
            {!confirm ? (
              <button type="button" className="min-h-11 text-muted underline" onClick={() => setConfirm(true)}>Excluir receita</button>
            ) : (
              <button type="button" className="min-h-11 rounded-lg bg-danger px-3 font-medium text-white" onClick={() => void deleteRecipe(recipe.id).then(onClose)}>Confirmar exclusão</button>
            )}
          </div>
        )}
      </form>
    </Sheet>
  );
}

// ---------- Preços ----------

function PricesTab({ k }: { k: KitchenData }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const all = useMemo(() => priceSummaries(k.prices), [k.prices]);
  const list = q.trim() ? all.filter((s) => pricesFor(q, [s.last]).length > 0) : all;
  return (
    <Card title="Histórico de preços">
      <p className="text-sm text-muted">Montado com os itens das notas fiscais escaneadas: quanto vocês pagaram em cada produto, quando e onde.</p>
      <input className={`${inputClass} mt-3`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar produto, ex.: arroz" aria-label="Procurar produto" />
      {list.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{all.length === 0 ? "Escaneie notas do mercado para começar o histórico." : "Nenhum produto com esse nome."}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {list.slice(0, 80).map((s) => (
            <li key={s.key} className="py-2">
              <button type="button" className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={open === s.key} onClick={() => setOpen(open === s.key ? null : s.key)}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{s.item}</span>
                  <span className="text-xs text-muted">
                    {s.count} {s.count === 1 ? "compra" : "compras"}
                    {s.count > 1 ? `, mais barato no ${s.cheapestStore} (${formatBrl(s.min.unitCents)})` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block text-sm font-semibold">{formatBrl(s.last.unitCents)}{s.last.unit !== "UN" ? `/${s.last.unit.toLowerCase()}` : ""}</span>
                  {s.changePct !== null && Math.abs(s.changePct) >= 1 && (
                    <span className={`flex items-center justify-end gap-0.5 text-xs ${s.changePct > 0 ? "text-expense" : "text-income"}`}>
                      {s.changePct > 0 ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
                      {s.changePct > 0 ? "subiu" : "caiu"} {Math.abs(s.changePct).toFixed(0)}%
                    </span>
                  )}
                </span>
              </button>
              {open === s.key && (
                <ul className="mt-2 space-y-1 rounded-lg bg-page p-2 text-xs">
                  {k.prices.filter((p) => p.key === s.key).map((p) => (
                    <li key={`${p.scanId}${p.date}`} className="flex justify-between gap-2">
                      <span>{dm(p.date)} no {p.store}</span>
                      <span className="num">{formatBrl(p.unitCents)}{p.unit !== "UN" ? `/${p.unit.toLowerCase()}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {all.length > 0 && <Pill tone="neutral">{all.length} produtos acompanhados</Pill>}
    </Card>
  );
}
