// Edge Function: lê a foto de uma lista de compras (escrita à mão ou impressa) com o Gemini
// e devolve os itens como [{name, qty, unit}]. Usa a chave do Gemini do usuário (ou de alguém da casa), lida do Vault.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

// do mais capaz ao mais leve; se um não existir ou estiver sem cota, tenta o próximo
const MODELS = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];
const PROMPT = `Esta é a foto de uma lista de compras de supermercado, provavelmente escrita à mão, em português do Brasil.
Transcreva cada item da lista. Corrija a grafia óbvia (ex.: "arros" -> "arroz"), mas não invente itens.
Se o item tiver quantidade ou unidade (ex.: "2 kg arroz", "6 ovos", "1 cx leite"), separe em qty (número) e unit (kg, g, l, ml, un, cx, pct, dz, lata ou null).
Ignore riscos, itens riscados, datas e títulos como "Lista" ou "Mercado".
Responda só com JSON no formato {"items":[{"name":"arroz","qty":2,"unit":"kg"}]}. Se não houver lista na foto, responda {"items":[]}.`;

type Item = { name: string; qty: number | null; unit: string | null };

function clean(raw: unknown): Item[] {
  const list = (raw as { items?: unknown })?.items;
  if (!Array.isArray(list)) return [];
  const out: Item[] = [];
  for (const x of list.slice(0, 80)) {
    const name = String((x as Item)?.name ?? "").trim().slice(0, 80);
    if (name.length < 2) continue;
    const q = Number((x as Item)?.qty);
    const u = (x as Item)?.unit ? String((x as Item).unit).toLowerCase().slice(0, 10) : null;
    out.push({ name, qty: Number.isFinite(q) && q > 0 && q < 10000 ? q : null, unit: u && u !== "null" ? u : null });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: u, error: uerr } = await userClient.auth.getUser();
  if (uerr || !u.user) return json({ error: "Entre na sua conta." }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: key } = await admin.rpc("get_gemini_key", { p_owner: u.user.id });
  if (!key) return json({ error: "sem_chave" }, 400);

  let body: { image?: string; mime?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Envie a foto." }, 400);
  }
  const image = String(body.image ?? "");
  const mime = ["image/jpeg", "image/png", "image/webp"].includes(String(body.mime)) ? String(body.mime) : "image/jpeg";
  if (image.length < 100 || image.length > 7_000_000) return json({ error: "Foto inválida ou grande demais." }, 400);

  let lastErr = "";
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": String(key) },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: image } }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(45000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as Response);
    const text = await res.text();
    if (res.ok) {
      try {
        const data = JSON.parse(text);
        const out = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        const parsed = JSON.parse(out.replace(/^```(?:json)?|```$/g, "").trim());
        return json({ items: clean(parsed), model });
      } catch {
        lastErr = "A leitura veio num formato inesperado. Tente outra foto.";
        continue;
      }
    }
    if (res.status === 400 && /API key/i.test(text)) return json({ error: "chave_invalida" }, 400);
    if (res.status === 403) return json({ error: "chave_invalida" }, 400);
    lastErr = res.status === 429 ? "A cota gratuita do Gemini acabou por hoje. Tente amanhã." : `Gemini respondeu ${res.status}.`;
    // 404 = modelo não existe para esta chave; 429 = sem cota neste modelo: tenta o próximo
  }
  return json({ error: lastErr || "Não consegui ler a foto agora." }, 502);
});
