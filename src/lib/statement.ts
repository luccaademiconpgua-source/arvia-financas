// Leitura de extratos bancários em OFX (SGML ou XML) e CSV.
// Valores com sinal: negativo = saída, positivo = entrada.

export type StatementRow = {
  key: string; // identificador estável dentro do arquivo (FITID ou hash)
  date: string; // AAAA-MM-DD
  description: string;
  amountCents: number;
};

export type Statement = {
  format: "ofx" | "csv";
  rows: StatementRow[];
  balanceCents?: number;
  balanceDate?: string;
  accountHint?: string;
};

export class StatementError extends Error {}

/** Bancos brasileiros costumam gerar OFX em Windows-1252. Tenta UTF-8 primeiro. */
export function decodeStatement(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export function parseStatement(text: string, fileName = ""): Statement {
  const head = text.slice(0, 2000);
  if (/\.(ofx|qfx)$/i.test(fileName) || /OFXHEADER|<OFX>/i.test(head)) return parseOfx(text);
  return parseCsv(text);
}

// ---------- utilitários ----------

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const clean = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return validDate(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) {
    let y = +m[3]!;
    if (y < 100) y += 2000;
    return validDate(y, +m[2]!, +m[1]!);
  }
  m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  if (m) return validDate(+m[1]!, +m[2]!, +m[3]!);
  return null;
}

/**
 * Converte "1.234,56", "-87,35", "R$ 12,00", "-87.35", "(12,00)" em centavos.
 * `dotIsDecimal`: no OFX o ponto é sempre decimal.
 */
export function parseAmount(raw: string, dotIsDecimal = false): number | null {
  let s = raw.replace(/R\$|\s| /gi, "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    neg = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-") || s.startsWith("−")) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0 && !dotIsDecimal && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, ""); // 1.234 = mil duzentos e trinta e quatro
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return neg ? -cents : cents;
}

/** Garante chaves únicas e estáveis: o mesmo arquivo importado de novo gera as mesmas chaves. */
function withKeys(rows: Array<Omit<StatementRow, "key"> & { key?: string }>): StatementRow[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    let key = r.key?.trim();
    if (!key) {
      const base = `${r.date}|${r.amountCents}|${r.description.toLowerCase()}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      key = "h" + fnv(`${base}|${n}`);
    }
    return { key, date: r.date, description: r.description, amountCents: r.amountCents };
  });
}

// ---------- OFX ----------

function ofxTag(block: string, name: string): string | undefined {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  const v = m?.[1]?.trim();
  return v ? clean(v) : undefined;
}

export function parseOfx(text: string): Statement {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const rows: Array<Omit<StatementRow, "key"> & { key?: string }> = [];
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0] ?? raw;
    const date = parseDate(ofxTag(block, "DTPOSTED") ?? "");
    const amount = parseAmount(ofxTag(block, "TRNAMT") ?? "", true);
    if (!date || amount === null || amount === 0) continue;
    const memo = ofxTag(block, "MEMO");
    const name = ofxTag(block, "NAME");
    const description = (memo && name && !memo.includes(name) ? `${name} ${memo}` : memo || name || "Lançamento").slice(0, 80);
    const fitid = ofxTag(block, "FITID");
    rows.push({ ...(fitid ? { key: "f" + fitid } : {}), date, description, amountCents: amount });
  }
  if (rows.length === 0) throw new StatementError("Não encontrei lançamentos neste OFX.");

  const ledger = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|$)/i.exec(text)?.[1] ?? "";
  const bal = parseAmount(ofxTag(ledger, "BALAMT") ?? "", true);
  const balDate = parseDate(ofxTag(ledger, "DTASOF") ?? "");
  const acct = ofxTag(text, "ACCTID");
  return {
    format: "ofx",
    rows: withKeys(rows),
    ...(bal !== null ? { balanceCents: bal } : {}),
    ...(balDate ? { balanceDate: balDate } : {}),
    ...(acct ? { accountHint: acct } : {}),
  };
}

// ---------- CSV ----------

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const COLS = {
  date: ["data", "date", "data lancamento", "data de lancamento", "data da transacao", "data movimento", "dt lancamento", "data mov"],
  desc: ["descricao", "historico", "lancamento", "title", "titulo", "estabelecimento", "memo", "detalhes", "description", "descricao do lancamento", "transacao"],
  amount: ["valor", "amount", "quantia", "valor r", "valor lancamento", "montante"],
  credit: ["entrada", "entradas", "credito", "creditos", "valor credito"],
  debit: ["saida", "saidas", "debito", "debitos", "valor debito"],
  id: ["identificador", "id", "fitid", "codigo"],
};

function findCol(headers: string[], names: string[]): number {
  for (const n of names) {
    const i = headers.indexOf(n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = headers.findIndex((h) => h.startsWith(n + " "));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseCsv(text: string): Statement {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new StatementError("O arquivo está vazio ou tem só uma linha.");

  let headerIdx = -1;
  let sep = ",";
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i]!;
    const cand = [";", ",", "\t"].sort((a, b) => line.split(b).length - line.split(a).length)[0]!;
    const hs = splitCsvLine(line, cand).map(norm);
    if (findCol(hs, COLS.date) >= 0 && (findCol(hs, COLS.amount) >= 0 || findCol(hs, COLS.credit) >= 0 || findCol(hs, COLS.debit) >= 0)) {
      headerIdx = i;
      sep = cand;
      headers = hs;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new StatementError("Não reconheci as colunas. O CSV precisa ter uma coluna de data e uma de valor.");
  }

  const iDate = findCol(headers, COLS.date);
  const iDesc = findCol(headers, COLS.desc);
  const iAmt = findCol(headers, COLS.amount);
  const iCred = findCol(headers, COLS.credit);
  const iDeb = findCol(headers, COLS.debit);
  const iId = findCol(headers, COLS.id);

  const rows: Array<Omit<StatementRow, "key"> & { key?: string }> = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cells = splitCsvLine(line, sep);
    const date = parseDate(cells[iDate] ?? "");
    if (!date) continue;
    let amount: number | null;
    if (iAmt >= 0) amount = parseAmount(cells[iAmt] ?? "");
    else {
      const c = iCred >= 0 ? parseAmount(cells[iCred] ?? "") : null;
      const d = iDeb >= 0 ? parseAmount(cells[iDeb] ?? "") : null;
      amount = c === null && d === null ? null : Math.abs(c ?? 0) - Math.abs(d ?? 0);
    }
    if (amount === null || amount === 0) continue;
    const description = clean(iDesc >= 0 ? (cells[iDesc] ?? "") : "") || "Lançamento";
    if (/^saldo\b/i.test(description)) continue;
    const id = iId >= 0 ? cells[iId]?.trim() : "";
    rows.push({ ...(id ? { key: "c" + id } : {}), date, description: description.slice(0, 80), amountCents: amount });
  }
  if (rows.length === 0) throw new StatementError("Não encontrei lançamentos com data e valor neste CSV.");
  return { format: "csv", rows: withKeys(rows) };
}

// ---------- categoria sugerida ----------

const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const EXPENSE_RULES: Array<[RegExp, string]> = [
  [/mercado ?pago|picpay|pagseguro|pagbank/, "Outras"],
  [/mercado ?livre|mercadolivre|shopee|amazon(?! prime)|magalu|magazine luiza|aliexpress|shein|americanas/, "Compras online"],
  [/netflix|spotify|amazon prime|prime video|disney|youtube|hbo|max\.com|globoplay|apple\.com|icloud|google one|deezer|paramount/, "Assinaturas"],
  [/supermerc|mercado|muffato|condor|atacad|assai|carrefour|hortifruti|sacolao|angeloni|festval|big\b/, "Mercado"],
  [/posto|combust|shell|ipiranga|petrobras|br mania|auto posto/, "Gasolina"],
  [/farmac|drogar|droga raia|raia|panvel|nissei|pague menos|drogasil|hospital|clinica|laborat|odonto/, "Saúde e bem-estar"],
  [/ifood|rappi|restaur|lanchon|burger|pizz|padaria|cafe|bar e|churrasc|sushi|mcdonald|bk |subway/, "Restaurante"],
  [/academia|smart ?fit|gympass|wellhub|crossfit|bluefit/, "Academia"],
  [/\bvivo\b|\bclaro\b|\btim\b|\boi\b|telefonica/, "Plano de telefone"],
  [/copel|sanepar|energia|celesc|cemig|\benel\b|\blight\b|agua|esgoto|internet|net virtua|gas natural/, "Contas"],
  [/aluguel|condominio|imobiliaria|iptu/, "Moradia"],
  [/escola|faculdade|universidade|curso|udemy|alura|hotmart|livraria/, "Educação"],
  [/renner|riachuelo|c&a|cea |zara|hering|centauro|netshoes|calcad/, "Vestuário"],
  [/cinema|ingresso|sympla|eventim|steam|playstation|xbox|viagem|hotel|airbnb/, "Lazer"],
  [/parcela|financiamento|consorcio|emprestimo/, "Parcelas"],
];

const INCOME_RULES: Array<[RegExp, string]> = [
  [/salario|folha|pagto salario|vencimento|proventos/, "Salário"],
];

/** Devolve o nome de categoria sugerido para a descrição do extrato. */
export function suggestStatementCategory(description: string, kind: "receita" | "despesa"): string {
  const s = strip(description);
  for (const [re, name] of kind === "despesa" ? EXPENSE_RULES : INCOME_RULES) if (re.test(s)) return name;
  return kind === "despesa" ? "Outras" : "Outras receitas";
}

// ---------- sinal invertido ----------

const OUT_WORDS = /\b(enviad[oa]|compra|cartao \d|pagamento|pagto|debito|saque|tarifa|boleto)\b/;
const IN_WORDS = /\b(recebid[oa]|deposito|salario|estorno|rendimento)\b/;

/**
 * O arquivo veio com sinais trocados (saída positiva)? Vota com duas pistas:
 * 1) lançamentos que já vieram pelo Open Finance com mesmo valor e data (±2 dias): o tipo deles é a verdade;
 * 2) palavras: "enviado", "compra", "cartão 1234" são saídas; "recebido", "salário" são entradas.
 */
export function looksInverted(rows: ReadonlyArray<{ date: string; description: string; amountCents: number }>, known: ReadonlyArray<{ date: string; amountCents: number; type: string }> = []): boolean {
  let same = 0;
  let flipped = 0;
  const day = (d: string) => Date.parse(d) / 86400000;
  for (const r of rows) {
    const abs = Math.abs(r.amountCents);
    const k = known.find((t) => t.amountCents === abs && Math.abs(day(t.date) - day(r.date)) <= 2 && (t.type === "receita" || t.type === "despesa"));
    if (k) {
      const isOut = r.amountCents < 0;
      if ((k.type === "despesa") === isOut) same++;
      else flipped++;
      continue;
    }
    const d = strip(r.description);
    if (OUT_WORDS.test(d)) r.amountCents < 0 ? same++ : flipped++;
    else if (IN_WORDS.test(d)) r.amountCents > 0 ? same++ : flipped++;
  }
  return flipped >= 3 && flipped > same * 2;
}

/** Tira o sufixo que alguns bancos põem na compra no débito ("LOJA X CIDADE BRA. Cartão 5456"). */
export const cleanMerchantName = (s: string) => s.replace(/\s+BRA\.?\s*Cart[aã]o\s*\d*\s*$/i, "").replace(/\s+BRA\.?\s*$/i, "").trim();
