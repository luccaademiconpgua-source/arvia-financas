// Edge Function: ponte entre o Arvia e a API da Pluggy (Meu Pluggy).
// Ações: connect_token | save_item | sync | disconnect
// Rotina de hora em hora (header x-cron-secret): sincroniza as conexões de todo mundo.
// O Client Secret nunca sai do servidor: é lido do Vault com service_role.
import { createClient } from "npm:@supabase/supabase-js@2";

const PLUGGY = "https://api.pluggy.ai";
const DAYS_BACK = 180;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function pluggy(path: string, apiKey: string | null, init: RequestInit = {}) {
  const res = await fetch(PLUGGY + path, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(apiKey ? { "X-API-KEY": apiKey } : {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.message ?? data?.error ?? `HTTP ${res.status}`;
    throw new HttpError(res.status, String(msg).slice(0, 200));
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) return await syncAllFromCron(cronSecret);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Entre na sua conta." }, 401);

    // identifica o usuário pelo token dele
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: u, error: uerr } = await userClient.auth.getUser();
    if (uerr || !u.user) return json({ error: "Sessão inválida. Entre de novo." }, 401);
    const uid = u.user.id;

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const action = String(body.action ?? "");

    if (action === "disconnect") {
      const itemId = String(body.item_id ?? "");
      const { data: row } = await admin.from("pluggy_items").select("item_id").eq("owner_id", uid).eq("item_id", itemId).maybeSingle();
      if (!row) return json({ error: "Conexão não encontrada." }, 404);
      const creds = await getCreds(admin, uid);
      if (creds) {
        try {
          const key = await auth(creds);
          await pluggy(`/items/${encodeURIComponent(itemId)}`, key, { method: "DELETE" });
        } catch {
          // se a Pluggy já removeu, seguimos
        }
      }
      await admin.from("pluggy_items").delete().eq("owner_id", uid).eq("item_id", itemId);
      return json({ ok: true });
    }

    const creds = await getCreds(admin, uid);
    if (!creds) return json({ error: "Cadastre seu Client ID e Client Secret primeiro." }, 400);
    const apiKey = await auth(creds);

    if (action === "connect_token") {
      const itemId = body.item_id ? String(body.item_id) : undefined;
      const data = await pluggy("/connect_token", apiKey, {
        method: "POST",
        body: JSON.stringify({ ...(itemId ? { itemId } : {}), options: { clientUserId: uid } }),
      });
      if (!data?.accessToken) throw new HttpError(502, "A Pluggy não devolveu o token de conexão.");
      // Conta gratuita/trial só pode criar conexões pelo conector MeuPluggy: procuramos o id dele
      let connectorIds: number[] = [];
      try {
        const list = await pluggy(`/connectors?name=${encodeURIComponent("meupluggy")}`, apiKey);
        const found = (list?.results ?? []).filter((c: any) => String(c?.name ?? "").toLowerCase().replace(/\s/g, "").includes("meupluggy"));
        connectorIds = found.map((c: any) => Number(c.id)).filter((n: number) => Number.isFinite(n));
      } catch {
        connectorIds = [];
      }
      return json({ accessToken: data.accessToken, connectorIds });
    }

    if (action === "save_item") {
      const itemId = String(body.item_id ?? "");
      if (!/^[0-9a-f-]{8,64}$/i.test(itemId)) return json({ error: "Identificador de conexão inválido." }, 400);
      const item = await pluggy(`/items/${encodeURIComponent(itemId)}`, apiKey);
      await admin.from("pluggy_items").upsert(
        { owner_id: uid, item_id: itemId, connector_name: item?.connector?.name ?? null, status: "ok", last_error: null },
        { onConflict: "owner_id,item_id" },
      );
      const result = await syncOne(admin, apiKey, uid, itemId);
      return json(result);
    }

    if (action === "sync") {
      const q = admin.from("pluggy_items").select("item_id").eq("owner_id", uid);
      const { data: items } = body.item_id ? await q.eq("item_id", String(body.item_id)) : await q;
      if (!items?.length) return json({ error: "Nenhuma conexão para sincronizar." }, 404);
      const results = [];
      for (const it of items) results.push(await syncOne(admin, apiKey, uid, it.item_id));
      return json({ results });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    if (e instanceof HttpError) {
      const msg = e.status === 401 || e.status === 403
        ? "A Pluggy recusou as credenciais. Confira o Client ID e o Client Secret."
        : `Pluggy: ${e.message}`;
      return json({ error: msg }, e.status === 401 || e.status === 403 ? 400 : 502);
    }
    console.error("pluggy fn", e instanceof Error ? e.message : e);
    return json({ error: "Erro inesperado ao falar com a Pluggy." }, 500);
  }
});

async function getCreds(admin: any, uid: string) {
  const { data, error } = await admin.rpc("get_pluggy_credentials", { p_owner: uid });
  if (error) throw new Error("credenciais: " + error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row?.client_id && row?.client_secret ? { clientId: row.client_id as string, clientSecret: row.client_secret as string } : null;
}

async function auth(c: { clientId: string; clientSecret: string }) {
  const data = await pluggy("/auth", null, { method: "POST", body: JSON.stringify({ clientId: c.clientId, clientSecret: c.clientSecret }) });
  if (!data?.apiKey) throw new HttpError(502, "A Pluggy não devolveu a chave de acesso.");
  return data.apiKey as string;
}

async function fetchAllTransactions(apiKey: string, accountId: string, from: string) {
  // /v2/transactions com paginação por cursor: "next" já vem pronto como query string
  const out: any[] = [];
  let path: string | null = `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${from}`;
  let pages = 0;
  while (path && pages < 40) {
    const d: any = await pluggy(path, apiKey);
    out.push(...(d?.results ?? []));
    const next = typeof d?.next === "string" && d.next ? d.next : null;
    path = next ? `/v2/transactions${next.startsWith("?") ? next : `?${next}`}` : null;
    pages++;
  }
  return out;
}

async function syncOne(admin: any, apiKey: string, uid: string, itemId: string) {
  const mark = (patch: Record<string, unknown>) =>
    admin.from("pluggy_items").update(patch).eq("owner_id", uid).eq("item_id", itemId);
  try {
    const item = await pluggy(`/items/${encodeURIComponent(itemId)}`, apiKey);
    const connector = item?.connector?.name ?? "Banco";
    if (item?.status === "LOGIN_ERROR" || item?.status === "OUTDATED") {
      await mark({ status: "expirada", last_error: "Reconecte o banco no Meu Pluggy.", connector_name: connector });
      await admin.from("accounts").update({ of_status: "expirada" }).eq("owner_id", uid).like("institution", connector);
      return { item_id: itemId, connector, status: "expirada" };
    }
    const accs = (await pluggy(`/accounts?itemId=${encodeURIComponent(itemId)}`, apiKey))?.results ?? [];
    const from = new Date(Date.now() - DAYS_BACK * 86400000).toISOString().slice(0, 10);
    const full = await Promise.all(
      accs.map(async (a: any) => ({
        id: a.id,
        type: a.type,
        subtype: a.subtype,
        name: a.marketingName || a.name,
        number: a.number,
        balance: a.balance,
        creditData: a.creditData ?? null,
        transactions: (await fetchAllTransactions(apiKey, a.id, from)).map((t) => ({
          id: t.id,
          description: t.description,
          amount: t.amount,
          date: t.date,
          type: t.type,
          category: t.category ?? null,
          merchant: t.merchant?.name ?? t.merchant?.businessName ?? null,
        })),
      })),
    );
    // pelo MeuPluggy o conector é o agregador; o nome do banco já vem no nome da conta
    const label = /meu\s*pluggy/i.test(connector) ? "" : connector;
    const { data, error } = await admin.rpc("apply_pluggy_sync", { p_owner: uid, p_connector: label, p_accounts: full });
    if (error) throw new Error(error.message);
    await mark({ status: "ok", last_error: null, last_sync_at: new Date().toISOString(), connector_name: connector });
    return { item_id: itemId, connector, status: "ok", ...data };
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : `Falha ao gravar: ${e instanceof Error ? e.message.slice(0, 160) : "erro desconhecido"}`;
    await mark({ status: "erro", last_error: msg });
    return { item_id: itemId, status: "erro", error: msg };
  }
}

function sameSecret(a: string, b: string) {
  if (a.length !== b.length || !b) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Chamada pela rotina do banco (pg_cron) de hora em hora: puxa as novidades de todas as conexões ativas. */
async function syncAllFromCron(secret: string) {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await admin.rpc("push_config");
  if (!sameSecret(secret, String(cfg?.push_cron_secret ?? ""))) return json({ error: "Não autorizado." }, 401);

  const { data: items } = await admin.from("pluggy_items").select("owner_id,item_id,status").neq("status", "expirada");
  const byOwner = new Map<string, string[]>();
  for (const it of items ?? []) byOwner.set(it.owner_id, [...(byOwner.get(it.owner_id) ?? []), it.item_id]);

  const report: Record<string, unknown>[] = [];
  for (const [owner, ids] of byOwner) {
    try {
      const creds = await getCreds(admin, owner);
      if (!creds) continue;
      const apiKey = await auth(creds);
      for (const id of ids) report.push(await syncOne(admin, apiKey, owner, id));
      // as mesmas regras de quando o app sincroniza: transferências, categorias, conciliação e contas fixas
      await admin.rpc("watch_after", { p_owner: owner });
    } catch (e) {
      report.push({ owner, status: "erro", error: e instanceof Error ? e.message.slice(0, 160) : "erro" });
    }
  }
  return json({ owners: byOwner.size, results: report.map((r) => ({ status: r.status, inserted: r.inserted, updated: r.updated })) });
}
