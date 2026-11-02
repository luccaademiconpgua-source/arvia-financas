import type { Mode } from "../types";

const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const rules: Array<[RegExp, string]> = [
  [/muffato|mercado/, "Mercado"],
  [/posto/, "Gasolina"],
  [/farmacia/, "Saúde e bem-estar"],
  [/restaurante/, "Restaurante"],
  [/academia/, "Academia"],
];

export function suggestCategoryName(storeName: string, mode: Mode): string {
  const s = strip(storeName);
  for (const [re, name] of rules) if (re.test(s)) return name;
  return mode === "pessoal" ? "Compras online" : "Outras";
}
