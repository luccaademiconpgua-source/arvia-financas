// Edge Function: notificações no celular (Web Push).
// - action "daily": chamada pela rotina diária (header x-cron-secret). Manda a cada pessoa os avisos novos.
// - action "test": chamada pelo app com o token do usuário. Manda uma notificação de teste para os aparelhos dele.
// As chaves VAPID ficam no Vault e são lidas com service_role.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

type Sub = { id: string; owner_id: string; endpoint: string; p256dh: string; auth: string };
type Alert = { owner_id: string; key: string; severity: number; title: string; body: string; url: string };

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function sendTo(admin: ReturnType<typeof createClient>, subs: Sub[], payload: Record<string, unknown>) {
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: "normal" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // aparelho desinstalou ou revogou a permissão
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg, error: cfgErr } = await admin.rpc("push_config");
  if (cfgErr || !cfg?.push_vapid_private) return json({ error: "Notificações não configuradas no servidor." }, 500);
  webpush.setVapidDetails("mailto:avisos@arvia-financas.vercel.app", cfg.push_vapid_public, cfg.push_vapid_private);

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.action === "daily") {
    const given = req.headers.get("x-cron-secret") ?? "";
    if (!timingSafeEqual(given, String(cfg.push_cron_secret ?? ""))) return json({ error: "Não autorizado." }, 401);

    const { data: alerts, error } = await admin.rpc("pending_push_alerts");
    if (error) return json({ error: error.message }, 500);
    const byOwner = new Map<string, Alert[]>();
    for (const a of (alerts ?? []) as Alert[]) byOwner.set(a.owner_id, [...(byOwner.get(a.owner_id) ?? []), a]);

    let people = 0;
    let devices = 0;
    for (const [owner, list] of byOwner) {
      const { data: subs } = await admin.from("push_subscriptions").select("id,owner_id,endpoint,p256dh,auth").eq("owner_id", owner);
      if (!subs?.length) continue;
      const top = list[0]!;
      const payload =
        list.length === 1
          ? { title: top.title, body: top.body, url: top.url, tag: "arvia-avisos" }
          : { title: `Arvia: ${list.length} avisos`, body: list.slice(0, 3).map((a) => a.title).join("\n"), url: "/", tag: "arvia-avisos" };
      const n = await sendTo(admin, subs as Sub[], payload);
      if (n > 0) {
        await admin.rpc("mark_alerts_sent", { p_owner: owner, p_keys: list.map((a) => a.key) });
        people++;
        devices += n;
      }
    }
    return json({ people, devices });
  }

  if (body.action === "test") {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: u, error: uerr } = await userClient.auth.getUser();
    if (uerr || !u.user) return json({ error: "Entre na sua conta." }, 401);
    const { data: subs } = await admin.from("push_subscriptions").select("id,owner_id,endpoint,p256dh,auth").eq("owner_id", u.user.id);
    if (!subs?.length) return json({ error: "Nenhum aparelho com notificações ligadas." }, 400);
    const n = await sendTo(admin, subs as Sub[], { title: "Notificações ligadas", body: "A Arvia vai avisar sobre contas vencendo, orçamento e revisões.", url: "/", tag: "arvia-teste" });
    return json({ devices: n });
  }

  return json({ error: "Ação inválida." }, 400);
});
