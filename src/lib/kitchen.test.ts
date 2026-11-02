import { describe, expect, it } from "vitest";
import { estimateList, lastPrice, missingForPlan, nameMatches, normKey, pantrySuggestions, parseItemText, plannedIngredients, priceSummaries, type PantryItem, type PricePoint, type ShoppingItem } from "./kitchen";

const pp = (item: string, store: string, date: string, unitCents: number, quantity = 1, unit = "UN"): PricePoint => ({
  scanId: date, store, date, item, key: normKey(item), quantity, unit, unitCents, totalCents: Math.round(unitCents * quantity),
});
const points = [
  pp("ARROZ TIO JOAO 5KG", "CONDOR", "2026-10-01", 2790),
  pp("ARROZ TIO JOAO 5KG", "MUFFATO", "2026-10-15", 2590),
  pp("BANANA PRATA", "CONDOR", "2026-10-01", 568, 1.25, "KG"),
  pp("LEITE UHT INTEGRAL ITALAC 1L", "CONDOR", "2026-10-01", 499, 12),
];
const item = (name: string, quantity: number | null = null, unit: string | null = null, checked = false): ShoppingItem => ({ id: name, name, quantity, unit, checked, source: "manual", createdAt: "" });

describe("lista de compras e preços", () => {
  it("casa o nome digitado com o item da nota", () => {
    expect(nameMatches("arroz", normKey("ARROZ TIO JOAO 5KG"))).toBe(true);
    expect(nameMatches("leite integral", normKey("LEITE UHT INTEGRAL ITALAC 1L"))).toBe(true);
    expect(nameMatches("leite desnatado", normKey("LEITE UHT INTEGRAL ITALAC 1L"))).toBe(false);
    expect(nameMatches("pão", normKey("PAO FRANCES"))).toBe(true);
  });
  it("último preço e total estimado", () => {
    expect(lastPrice("arroz", points)).toMatchObject({ store: "MUFFATO", unitCents: 2590 });
    const e = estimateList([item("arroz", 2), item("banana", 2, "kg"), item("leite"), item("café"), item("sabão", 1, null, true)], points);
    expect(e).toEqual({ totalCents: 2590 * 2 + 568 * 2 + 499, priced: 3, missing: 1 });
  });
  it("resumo de preço por produto", () => {
    const s = priceSummaries(points).find((x) => x.key.startsWith("arroz"))!;
    expect(s.count).toBe(2);
    expect(s.cheapestStore).toBe("MUFFATO");
    expect(s.changePct).toBeCloseTo(-7.17, 1);
  });
  it("entende quantidade e unidade digitadas", () => {
    expect(parseItemText("2 kg de arroz")).toEqual({ name: "arroz", qty: 2, unit: "kg" });
    expect(parseItemText("arroz 5kg")).toEqual({ name: "arroz", qty: 5, unit: "kg" });
    expect(parseItemText("3 cebolas")).toEqual({ name: "cebolas", qty: 3, unit: null });
    expect(parseItemText("leite")).toEqual({ name: "leite", qty: null, unit: null });
  });
});

describe("despensa e cardápio", () => {
  const pantry: PantryItem[] = [
    { id: "1", name: "ARROZ", key: "arroz tio joao 5kg", status: "tem", lastBought: "2026-10-15", buyCount: 3, avgIntervalDays: 14 },
    { id: "2", name: "CAFE", key: "cafe pilao 500g", status: "acabando", lastBought: "2026-10-28", buyCount: 2, avgIntervalDays: 20 },
    { id: "3", name: "OLEO", key: "oleo soja", status: "tem", lastBought: "2026-10-30", buyCount: 2, avgIntervalDays: 30 },
    { id: "4", name: "SAL", key: "sal refinado", status: "acabou", lastBought: null, buyCount: 1, avgIntervalDays: null },
  ];
  it("sugere o que comprar", () => {
    const s = pantrySuggestions(pantry, "2026-11-02");
    expect(s.map((x) => [x.item.name, x.reason])).toEqual([["SAL", "acabou"], ["CAFE", "acabando"], ["ARROZ", "tempo"]]);
  });
  it("ajusta a receita ao número de pessoas e vê o que falta", () => {
    const recipes = [{ id: "r", title: "Arroz e feijão", servings: 2, notes: null, ingredients: [{ name: "arroz", qty: 200, unit: "g" }, { name: "feijão", qty: 150, unit: "g" }, { name: "sal", qty: null, unit: null }] }];
    const ings = plannedIngredients([
      { id: "a", date: "2026-11-03", meal: "almoco", recipeId: "r", title: "x", people: 4 },
      { id: "b", date: "2026-11-04", meal: "almoco", recipeId: "r", title: "x", people: 2 },
    ], recipes);
    expect(ings).toEqual([{ name: "arroz", qty: 600, unit: "g" }, { name: "feijão", qty: 450, unit: "g" }, { name: "sal", qty: null, unit: null }]);
    expect(missingForPlan(ings, pantry, [item("feijao carioca")]).map((x) => x.name)).toEqual(["sal"]);
  });
});
