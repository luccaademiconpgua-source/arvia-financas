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


const isNum = (w: string) => /^\d+([.,]\d+)?$/.test(w) || w.normalize("NFD").replace(/\p{M}/gu, "") in NUM;
const CONNECT = new Set(["de", "da", "do", "das", "dos", "com", "sem", "pra", "para"]);

/**
 * O reconhecimento de voz costuma devolver tudo sem vírgula ("arroz dois litros de leite feijão").
 * Quebra antes de cada número e, se sobrar uma sequência de palavras soltas sem "de"/"com", uma por item.
 */
function splitRun(part: string): string[] {
  const words = part.split(/\s+/);
  const chunks: string[][] = [[]];
  for (const w of words) {
    const cur = chunks[chunks.length - 1]!;
    if (isNum(w) && cur.length > 0 && !CONNECT.has(cur[cur.length - 1]!)) chunks.push([w]);
    else cur.push(w);
  }
  return chunks.flatMap((c) => {
    const hasConnector = c.some((w) => CONNECT.has(w));
    const lead = isNum(c[0] ?? "") ? 1 : 0;
    // "2 kg arroz feijão": o número fica com o primeiro, o resto vira itens soltos
    if (!hasConnector && c.length - lead >= (lead ? 3 : 2)) {
      const unitIdx = lead && c[1] && /^(quilos?|kilos?|gramas?|litros?|caixas?|pacotes?|d[uú]zias?|latas?|kg|g|l|ml)$/.test(c[1]) ? 2 : lead;
      return [c.slice(0, unitIdx + 1).join(" "), ...c.slice(unitIdx + 1)];
    }
    return [c.join(" ")];
  }).filter((x) => x.length >= 2);
}

/** Separa o que foi falado em itens. Aceita vírgula, "e", "mais" e "também" como separador. */
export function parseSpoken(text: string): Ingredient[] {
  const base = text.toLowerCase().replace(/[.;!?]/g, ",");
  return base
    .split(/,|\s+e\s+|\s+mais\s+|\s+também\s+|\s+tambem\s+|\s+depois\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
    .flatMap(splitRun)
    .map((p) => {
      let s = p.replace(/^(comprar|preciso de|precisa de|pegar|anota|anotar|coloca|colocar|bota|botar)\s+/, "");
      s = s.replace(/[a-zà-ú]+/g, (w) => NUM[w.normalize("NFD").replace(/\p{M}/gu, "")] ?? w);
      for (const [re, u] of UNIT) s = s.replace(re, u);
      return parseItemText(s.replace(/\s+/g, " ").trim());
    })
    .filter((i) => i.name.length >= 2 && !/^(e|de|a|o)$/.test(i.name));
}
