import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { extractAccessKey, isNfceUrl } from "../src/lib/nfceUrl.js";
import { parseBrlToCents } from "../src/lib/money.js";

export type ParsedNfce = {
  accessKey?: string;
  storeName: string;
  cnpj?: string;
  issuedAt: string;
  totalCents: number;
  payment: "pix" | "dinheiro" | "debito" | "credito" | "desconhecido";
  items: Array<{ description: string; quantity: number; unit: string; totalCents: number }>;
  state?: string;
};

const clean = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

const num = (s: string): number => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function toIsoDate(text: string): string {
  const m = /(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):?(\d{2})?)?/.exec(text);
  if (!m) return new Date().toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}`;
}

function detectPayment(text: string): ParsedNfce["payment"] {
  const t = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/pix/.test(t)) return "pix";
  if (/cartao de credito|credito/.test(t)) return "credito";
  if (/cartao de debito|debito/.test(t)) return "debito";
  if (/dinheiro/.test(t)) return "dinheiro";
  return "desconhecido";
}

function findTotal(text: string): number {
  const m = /Valor\s+(?:a\s+pagar|pago)[^\d]{0,40}(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i.exec(text);
  return m?.[1] ? (parseBrlToCents(m[1]) ?? 0) : 0;
}

function findCnpj(text: string): string | undefined {
  const m = /CNPJ[^\d]{0,10}(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i.exec(text);
  return m?.[1]?.replace(/\D/g, "");
}

/**
 * Parser da página pública da NFC-e do Paraná (fazenda.pr.gov.br).
 * Estrutura esperada: linhas `<tr id="Item + n">` com `txtTit` (descrição) e `Rqtd`, `RUN`, `valor`.
 */
export function parsePrHtml(html: string, accessKey?: string): ParsedNfce | null {
  const rows = [...html.matchAll(/<tr[^>]*id="Item[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)];
  const items: ParsedNfce["items"] = [];
  for (const r of rows) {
    const body = r[1] ?? "";
    const desc = /class="txtTit2?"[^>]*>([\s\S]*?)<\/span>/i.exec(body)?.[1];
    const qtd = /class="Rqtd"[^>]*>([\s\S]*?)<\/span>/i.exec(body)?.[1];
    const un = /class="RUN"[^>]*>([\s\S]*?)<\/span>/i.exec(body)?.[1];
    const val = /class="valor"[^>]*>([\s\S]*?)<\/span>/i.exec(body)?.[1];
    if (!desc || !val) continue;
    const total = parseBrlToCents(clean(val)) ?? 0;
    items.push({
      description: clean(desc),
      quantity: num(clean(qtd ?? "1").replace(/[^\d.,]/g, "")) || 1,
      unit: clean(un ?? "UN").replace(/^UN:\s*/i, "") || "UN",
      totalCents: total,
    });
  }
  const text = clean(html);
  const totalCents = findTotal(text) || items.reduce((s, i) => s + i.totalCents, 0);
  if (items.length === 0 || totalCents <= 0) return null;
  const store = /class="txtTopo"[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
  const key = accessKey ?? extractAccessKey(text.replace(/\s/g, ""));
  return {
    ...(key ? { accessKey: key } : {}),
    storeName: clean(store ?? "Estabelecimento"),
    ...(findCnpj(text) ? { cnpj: findCnpj(text) } : {}),
    issuedAt: toIsoDate(/Emiss[ãa]o:?\s*([\d/:\s]+)/i.exec(text)?.[1] ?? text),
    totalCents,
    payment: detectPayment(text),
    items,
    state: "PR",
  };
}

/** Extrator genérico: procura linhas de tabela com descrição e valor `1.234,56`. */
export function parseGenericHtml(html: string, accessKey?: string): ParsedNfce | null {
  const items: ParsedNfce["items"] = [];
  for (const r of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...(r[1] ?? "").matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => clean(c[1] ?? ""));
    if (cells.length < 2) continue;
    const last = cells[cells.length - 1] ?? "";
    if (!/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(last)) continue;
    const desc = cells[0] ?? "";
    if (desc.length < 2 || /total|valor|troco|desconto|tributos/i.test(desc)) continue;
    items.push({ description: desc, quantity: 1, unit: "UN", totalCents: parseBrlToCents(last) ?? 0 });
  }
  const text = clean(html);
  const totalCents = findTotal(text);
  if (items.length === 0 || totalCents <= 0) return null;
  const key = accessKey ?? extractAccessKey(text.replace(/\s/g, ""));
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return {
    ...(key ? { accessKey: key } : {}),
    storeName: clean(title ?? "Estabelecimento") || "Estabelecimento",
    ...(findCnpj(text) ? { cnpj: findCnpj(text) } : {}),
    issuedAt: toIsoDate(text),
    totalCents,
    payment: detectPayment(text),
    items,
  };
}

const isPrivateHost = (host: string): boolean => {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (isIP(h) === 4) {
    const [a = 0, b = 0] = h.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return isIP(h) === 6 || h.startsWith("[");
};

type Result = { status: number; body: unknown };

export async function resolveNfce(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<Result> {
  if (!isNfceUrl(rawUrl)) return { status: 400, body: { error: "URL inválida." } };
  const url = new URL(rawUrl.trim());
  if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) return { status: 400, body: { error: "URL inválida." } };
  let html: string;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(12_000), redirect: "follow", headers: { "user-agent": "Mozilla/5.0 Arvia" } });
    if (!res.ok) return { status: 502, body: { error: "A SEFAZ não respondeu. Tente de novo." } };
    html = (await res.text()).slice(0, 2_000_000);
  } catch {
    return { status: 502, body: { error: "A SEFAZ não respondeu. Tente de novo." } };
  }
  const key = extractAccessKey(rawUrl) ?? undefined;
  const isPr = url.hostname.toLowerCase().endsWith("fazenda.pr.gov.br");
  const parsed = (isPr ? parsePrHtml(html, key) : null) ?? parseGenericHtml(html, key);
  if (!parsed || parsed.totalCents <= 0 || parsed.items.length === 0) {
    return { status: 422, body: { error: "Não consegui ler os itens desta nota. O estado pode não ser suportado." } };
  }
  return { status: 200, body: parsed };
}

export async function handleNfceRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const send = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST") return send(405, { error: "Método não permitido." });
  let raw = "";
  let tooBig = false;
  req.on("data", (c: Buffer) => {
    if (tooBig) return;
    raw += c.toString("utf8");
    if (raw.length > 8192) {
      tooBig = true;
      raw = "";
    }
  });
  await new Promise<void>((resolve) => {
    req.on("end", resolve);
    req.on("close", resolve);
  });
  if (tooBig) return send(400, { error: "URL inválida." });
  let url = "";
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data === "object" && data !== null && "url" in data && typeof data.url === "string") url = data.url;
  } catch {
    return send(400, { error: "URL inválida." });
  }
  const r = await resolveNfce(url);
  send(r.status, r.body);
}

type Connect = { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => void };
export function nfcePlugin() {
  const mount = (server: { middlewares: Connect }) => {
    server.middlewares.use("/api/nfce", (req, res) => void handleNfceRequest(req, res));
  };
  return { name: "arvia-nfce", configureServer: mount, configurePreviewServer: mount };
}
