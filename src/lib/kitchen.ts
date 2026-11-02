// Cozinha e compras: casar o nome digitado com os itens das notas, preços, despensa e cardápio.

export type PricePoint = { scanId: string; store: string; date: string; item: string; key: string; quantity: number; unit: string; unitCents: number; totalCents: number };
export type ShoppingItem = { id: string; name: string; quantity: number | null; unit: string | null; checked: boolean; source: "manual" | "despensa" | "cardapio"; createdAt: string };
export type PantryItem = { id: string; name: string; key: string; status: "tem" | "acabando" | "acabou"; lastBought: string | null; buyCount: number; avgIntervalDays: number | null };
export type Ingredient = { name: string; qty: number | null; unit: string | null };
export type Recipe = { id: string; title: string; servings: number; ingredients: Ingredient[]; notes: string | null };
export type MealSlot = "cafe" | "almoco" | "jantar" | "lanche";
export type MealPlanItem = { id: string; date: string; meal: MealSlot; recipeId: string | null; title: string; people: number };

export const MEAL_LABEL: Record<MealSlot, string> = { cafe: "Café", almoco: "Almoço", jantar: "Jantar", lanche: "Lanche" };

export const normKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "com", "c"]);
const tokens = (s: string) => normKey(s).split(" ").filter((t) => t.length >= 2 && !STOP.has(t));

/** "arroz" casa com "ARROZ TIO JOAO 5KG"; "leite integral" casa com "LEITE UHT INTEGRAL ITALAC". */
export function nameMatches(query: string, itemKey: string): boolean {
  const q = tokens(query);
  if (q.length === 0) return false;
  const hay = ` ${itemKey} `;
  return q.every((t) => hay.includes(` ${t}`));
}

export function pricesFor(name: string, points: PricePoint[]): PricePoint[] {
  return points.filter((p) => nameMatches(name, p.key)).sort((a, b) => b.date.localeCompare(a.date));
}

export function lastPrice(name: string, points: PricePoint[]): PricePoint | null {
  return pricesFor(name, points)[0] ?? null;
}

/** Total estimado da lista: último preço por unidade × quantidade (1 se não informada). */
export function estimateList(items: ShoppingItem[], points: PricePoint[]): { totalCents: number; priced: number; missing: number } {
  let total = 0;
  let priced = 0;
  let missing = 0;
  for (const i of items) {
    if (i.checked) continue;
    const p = lastPrice(i.name, points);
    if (!p) {
      missing++;
      continue;
    }
    // preço por unidade (ou por kg/litro) da última compra × quantidade da lista (1 se não informada)
    total += Math.round(p.unitCents * (i.quantity ?? 1));
    priced++;
  }
  return { totalCents: total, priced, missing };
}

export type PriceSummary = { key: string; item: string; last: PricePoint; min: PricePoint; max: PricePoint; count: number; cheapestStore: string; changePct: number | null };

/** Um resumo por produto: último preço, menor e maior, mercado mais barato e variação desde a primeira compra. */
export function priceSummaries(points: PricePoint[]): PriceSummary[] {
  const by = new Map<string, PricePoint[]>();
  for (const p of points) by.set(p.key, [...(by.get(p.key) ?? []), p]);
  const out: PriceSummary[] = [];
  for (const [key, list] of by) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const min = sorted.reduce((m, p) => (p.unitCents < m.unitCents ? p : m), first);
    const max = sorted.reduce((m, p) => (p.unitCents > m.unitCents ? p : m), first);
    out.push({
      key,
      item: last.item,
      last,
      min,
      max,
      count: sorted.length,
      cheapestStore: min.store,
      changePct: sorted.length > 1 && first.unitCents > 0 ? ((last.unitCents - first.unitCents) / first.unitCents) * 100 : null,
    });
  }
  return out.sort((a, b) => b.count - a.count || b.last.date.localeCompare(a.last.date));
}

export type PantrySuggestion = { item: PantryItem; reason: "acabou" | "acabando" | "tempo"; daysSince: number | null };

/** O que provavelmente precisa comprar: marcado como acabando/acabou, ou já passou o intervalo normal entre compras. */
export function pantrySuggestions(items: PantryItem[], today: string): PantrySuggestion[] {
  const out: PantrySuggestion[] = [];
  for (const i of items) {
    const since = i.lastBought ? Math.round((Date.parse(today) - Date.parse(i.lastBought)) / 86400000) : null;
    if (i.status === "acabou" || i.status === "acabando") out.push({ item: i, reason: i.status, daysSince: since });
    else if (i.avgIntervalDays && i.avgIntervalDays > 0 && since !== null && since >= Math.ceil(i.avgIntervalDays * 0.9)) out.push({ item: i, reason: "tempo", daysSince: since });
  }
  const rank = { acabou: 0, acabando: 1, tempo: 2 } as const;
  return out.sort((a, b) => rank[a.reason] - rank[b.reason] || (b.daysSince ?? 0) - (a.daysSince ?? 0));
}

/** Ingredientes do cardápio somados e ajustados ao número de pessoas de cada refeição. */
export function plannedIngredients(plan: MealPlanItem[], recipes: Recipe[]): Ingredient[] {
  const acc = new Map<string, Ingredient>();
  for (const m of plan) {
    const r = recipes.find((x) => x.id === m.recipeId);
    if (!r) continue;
    const factor = m.people / r.servings;
    for (const ing of r.ingredients) {
      const k = `${normKey(ing.name)}|${normKey(ing.unit ?? "")}`;
      const qty = ing.qty !== null ? Math.round(ing.qty * factor * 100) / 100 : null;
      const prev = acc.get(k);
      acc.set(k, prev ? { ...prev, qty: prev.qty !== null && qty !== null ? Math.round((prev.qty + qty) * 100) / 100 : (prev.qty ?? qty) } : { name: ing.name, qty, unit: ing.unit });
    }
  }
  return [...acc.values()];
}

/** O que falta comprar para o cardápio: não está na despensa (com "tem") nem já na lista. */
export function missingForPlan(ings: Ingredient[], pantry: PantryItem[], list: ShoppingItem[]): Ingredient[] {
  return ings.filter((g) => {
    const inPantry = pantry.some((p) => p.status === "tem" && nameMatches(g.name, p.key));
    const inList = list.some((s) => !s.checked && (nameMatches(g.name, normKey(s.name)) || nameMatches(s.name, normKey(g.name))));
    return !inPantry && !inList;
  });
}

/** Lê "2 kg arroz", "arroz 2kg", "3 cebolas", "leite" -> {name, qty, unit}. */
export function parseItemText(text: string): Ingredient {
  const t = text.trim().replace(/\s+/g, " ");
  const units = "kg|g|l|ml|un|und|unid|pct|pacote|cx|caixa|dz|duzia|lata|garrafa|maco|xicara|colher|xic|col";
  let m = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${units})?\\.?\\s+(?:de\\s+)?(.+)$`, "i").exec(t);
  if (m) return { name: m[3]!, qty: Number(m[1]!.replace(",", ".")), unit: m[2] ? m[2].toLowerCase() : null };
  m = new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${units})\\.?$`, "i").exec(t);
  if (m) return { name: m[1]!, qty: Number(m[2]!.replace(",", ".")), unit: m[3]!.toLowerCase() };
  return { name: t, qty: null, unit: null };
}
