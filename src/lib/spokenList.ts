// Ditado da lista de compras: "dois quilos de arroz, leite e seis ovos" -> itens.
import { parseItemText, type Ingredient } from "./kitchen";

const NUM: Record<string, string> = {
  um: "1", uma: "1", dois: "2", duas: "2", tres: "3", quatro: "4", cinco: "5", seis: "6", sete: "7", oito: "8", nove: "9", dez: "10",
  onze: "11", doze: "12", quinze: "15", vinte: "20", trinta: "30", meio: "0,5", meia: "0,5",
};
const UNIT: Array<[RegExp, string]> = [
  [/\bquilos?\b|\bkilos?\b/g, "kg"],
  [/\bgramas?\b/g, "g"],
  [/\bmililitros?\b/g, "ml"],
  [/\blitros?\b/g, "l"],
  [/\bcaixas?\b|\bcaixinhas?\b/g, "cx"],
  [/\bpacotes?\b/g, "pct"],
  [/\bd[uú]zias?\b/g, "dz"],
  [/\blatas?\b/g, "lata"],
  [/\bunidades?\b/g, "un"],
];


/** Separa o que foi falado em itens. Aceita vírgula, "e", "mais" e "também" como separador. */
export function parseSpoken(text: string): Ingredient[] {
  const base = text.toLowerCase().replace(/[.;!?]/g, ",");
  return base
    .split(/,|\s+e\s+|\s+mais\s+|\s+também\s+|\s+tambem\s+|\s+depois\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
    .map((p) => {
      let s = p.replace(/^(comprar|preciso de|precisa de|pegar|anota|anotar|coloca|colocar|bota|botar)\s+/, "");
      s = s.replace(/[a-zà-ú]+/g, (w) => NUM[w.normalize("NFD").replace(/\p{M}/gu, "")] ?? w);
      for (const [re, u] of UNIT) s = s.replace(re, u);
      return parseItemText(s.replace(/\s+/g, " ").trim());
    })
    .filter((i) => i.name.length >= 2 && !/^(e|de|a|o)$/.test(i.name));
}
