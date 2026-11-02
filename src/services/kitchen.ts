import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRefresh } from "../store/refresh";
import { normKey, type Ingredient, type MealPlanItem, type MealSlot, type PantryItem, type PricePoint, type Recipe, type ShoppingItem } from "../lib/kitchen";
import type { Mode } from "../types";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export type KitchenData = { shopping: ShoppingItem[]; pantry: PantryItem[]; prices: PricePoint[]; recipes: Recipe[]; plan: MealPlanItem[] };

async function fetchKitchen(mode: Mode, from: string, to: string): Promise<KitchenData> {
  const [s, p, pr, r, m] = await Promise.all([
    supabase.from("shopping_items").select("*").eq("scope", mode).order("checked").order("created_at"),
    supabase.from("pantry_items").select("*").eq("scope", mode).order("name"),
    supabase.from("price_points").select("*").eq("scope", mode).order("date", { ascending: false }).limit(3000),
    supabase.from("recipes").select("*").eq("scope", mode).order("title"),
    supabase.from("meal_plan").select("*").eq("scope", mode).gte("date", from).lte("date", to).order("date"),
  ]);
  const err = s.error ?? p.error ?? pr.error ?? r.error ?? m.error;
  if (err) throw new Error(err.message);
  return {
    shopping: (s.data ?? []).map((x: Row) => ({
      id: String(x["id"]), name: String(x["name"]), quantity: num(x["quantity"]), unit: (x["unit"] as string | null) ?? null,
      checked: Boolean(x["checked"]), source: x["source"] as ShoppingItem["source"], createdAt: String(x["created_at"]),
    })),
    pantry: (p.data ?? []).map((x: Row) => ({
      id: String(x["id"]), name: String(x["name"]), key: String(x["key"]), status: x["status"] as PantryItem["status"],
      lastBought: (x["last_bought"] as string | null) ?? null, buyCount: Number(x["buy_count"] ?? 0), avgIntervalDays: num(x["avg_interval_days"]),
    })),
    prices: (pr.data ?? []).map((x: Row) => ({
      scanId: String(x["scan_id"]), store: String(x["store_name"]), date: String(x["date"]), item: String(x["item"]), key: String(x["key"]),
      quantity: Number(x["quantity"]), unit: String(x["unit"]), unitCents: Number(x["unit_cents"]), totalCents: Number(x["total_cents"]),
    })),
    recipes: (r.data ?? []).map((x: Row) => ({
      id: String(x["id"]), title: String(x["title"]), servings: Number(x["servings"]), ingredients: (x["ingredients"] as Ingredient[]) ?? [], notes: (x["notes"] as string | null) ?? null,
    })),
    plan: (m.data ?? []).map((x: Row) => ({
      id: String(x["id"]), date: String(x["date"]), meal: x["meal"] as MealSlot, recipeId: (x["recipe_id"] as string | null) ?? null, title: String(x["title"]), people: Number(x["people"]),
    })),
  };
}

/** Carrega tudo da cozinha e escuta mudanças na lista de compras (a outra pessoa marcando itens). */
export function useKitchen(mode: Mode, from: string, to: string) {
  const version = useRefresh((s) => s.version);
  const [state, setState] = useState<{ data: KitchenData | null; key: string; error: string }>({ data: null, key: "", error: "" });
  const key = `${mode}|${from}|${to}`;
  useEffect(() => {
    let alive = true;
    fetchKitchen(mode, from, to).then(
      (data) => alive && setState({ data, key, error: "" }),
      (e: unknown) => alive && setState((s) => ({ ...s, key, error: e instanceof Error ? e.message : "Erro ao carregar." })),
    );
    return () => {
      alive = false;
    };
  }, [mode, from, to, version, key]);

  useEffect(() => {
    const ch = supabase
      .channel(`shopping-${mode}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_items" }, () => useRefresh.getState().bump())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [mode]);

  const empty: KitchenData = { shopping: [], pantry: [], prices: [], recipes: [], plan: [] };
  return { ready: state.data !== null && state.key === key, error: state.error, ...(state.data ?? empty) };
}

const bump = () => useRefresh.getState().bump();
const check = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
};

export async function addShopping(mode: Mode, items: Array<{ name: string; qty: number | null; unit: string | null }>, source: ShoppingItem["source"] = "manual") {
  if (items.length === 0) return;
  check(await supabase.from("shopping_items").insert(items.map((i) => ({ scope: mode, name: i.name.slice(0, 80), quantity: i.qty, unit: i.unit?.slice(0, 10) ?? null, source }))));
  bump();
}
export async function toggleShopping(id: string, checked: boolean) {
  check(await supabase.from("shopping_items").update({ checked, checked_at: checked ? new Date().toISOString() : null }).eq("id", id));
  bump();
}
export async function removeShopping(id: string) {
  check(await supabase.from("shopping_items").delete().eq("id", id));
  bump();
}
export async function clearChecked(mode: Mode) {
  check(await supabase.from("shopping_items").delete().eq("scope", mode).eq("checked", true));
  bump();
}

export async function setPantryStatus(id: string, status: PantryItem["status"]) {
  check(await supabase.from("pantry_items").update({ status, updated_at: new Date().toISOString() }).eq("id", id));
  bump();
}
export async function addPantry(mode: Mode, name: string) {
  check(await supabase.from("pantry_items").insert({ scope: mode, name: name.slice(0, 80), key: normKey(name), status: "tem" }));
  bump();
}
export async function removePantry(id: string) {
  check(await supabase.from("pantry_items").delete().eq("id", id));
  bump();
}

export async function saveRecipe(mode: Mode, r: Omit<Recipe, "id">, id?: string) {
  const row = { title: r.title, servings: r.servings, ingredients: r.ingredients, notes: r.notes };
  check(id ? await supabase.from("recipes").update(row).eq("id", id) : await supabase.from("recipes").insert({ scope: mode, ...row }));
  bump();
}
export async function deleteRecipe(id: string) {
  check(await supabase.from("recipes").delete().eq("id", id));
  bump();
}

export async function addMeal(mode: Mode, m: Omit<MealPlanItem, "id">) {
  check(await supabase.from("meal_plan").insert({ scope: mode, date: m.date, meal: m.meal, recipe_id: m.recipeId, title: m.title, people: m.people }));
  bump();
}
export async function removeMeal(id: string) {
  check(await supabase.from("meal_plan").delete().eq("id", id));
  bump();
}
