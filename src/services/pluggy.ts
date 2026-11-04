import { useRefresh } from "../store/refresh";
import { supabase } from "../lib/supabase";
import { afterDataChange } from "../store/actions";

export type PluggyItem = {
  item_id: string;
  connector_name: string | null;
  custom_name: string | null;
  scope: "pessoal" | "empresa";
  accounts_info: Array<{ name: string; type: "conta" | "cartao"; last4: string | null }> | null;
  status: "ok" | "erro" | "expirada";
  last_error: string | null;
  last_sync_at: string | null;
};

export type SyncResult = {
  item_id: string;
  connector?: string;
  status: "ok" | "erro" | "expirada";
  error?: string;
  accounts?: number;
  cards?: number;
  transactions?: number;
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("pluggy", { body });
  if (error) {
    let msg = "Não foi possível falar com o servidor.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = (await ctx.json()) as { error?: string };
        if (j?.error) msg = j.error;
      } catch {
        /* mantém a mensagem padrão */
      }
    }
    throw new Error(msg);
  }
  return data as T;
}

export async function getStatus(): Promise<{ configured: boolean; hint: string | null }> {
  const { data, error } = await supabase.rpc("pluggy_status");
  if (error) throw new Error(error.message);
  const d = data as { configured: boolean; client_id_hint: string | null };
  return { configured: d.configured, hint: d.client_id_hint };
}

export async function saveCredentials(clientId: string, clientSecret: string) {
  const { error } = await supabase.rpc("save_pluggy_credentials", { p_client_id: clientId, p_client_secret: clientSecret });
  if (error) throw new Error(error.message);
}

export async function removeCredentials() {
  const { error } = await supabase.rpc("delete_pluggy_credentials");
  if (error) throw new Error(error.message);
}

export async function listItems(): Promise<PluggyItem[]> {
  const { data, error } = await supabase.from("pluggy_items").select("item_id, connector_name, custom_name, scope, accounts_info, status, last_error, last_sync_at").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as PluggyItem[];
}

export async function renameItem(itemId: string, name: string) {
  const { error } = await supabase.rpc("rename_pluggy_item", { p_item_id: itemId, p_name: name });
  if (error) throw new Error(error.message);
  useRefresh.getState().bump();
}

export async function moveItemScope(itemId: string, scope: "pessoal" | "empresa") {
  const { data, error } = await supabase.rpc("move_pluggy_item_scope", { p_item_id: itemId, p_scope: scope });
  if (error) throw new Error(error.message);
  useRefresh.getState().bump();
  return Number(data ?? 0);
}

export const connectToken = (itemId?: string) => call<{ accessToken: string; connectorIds?: number[] }>({ action: "connect_token", item_id: itemId });

export async function saveItem(itemId: string) {
  const r = await call<SyncResult>({ action: "save_item", item_id: itemId });
  await afterDataChange().catch(() => undefined);
  return r;
}

export async function syncAll() {
  const r = await call<{ results: SyncResult[] }>({ action: "sync" });
  await afterDataChange().catch(() => undefined);
  return r.results;
}

export async function disconnect(itemId: string) {
  await call<{ ok: true }>({ action: "disconnect", item_id: itemId });
}

export async function openWidget(itemId: string | undefined, onItem: (itemId: string) => void, onError: (m: string) => void) {
  const { accessToken, connectorIds } = await connectToken(itemId);
  // 200 é o id público do conector MeuPluggy; usado se a busca no servidor não achar
  const ids = connectorIds && connectorIds.length ? connectorIds : [200];
  const { PluggyConnect } = await import("pluggy-connect-sdk");
  const widget = new PluggyConnect({
    connectToken: accessToken,
    includeSandbox: false,
    ...(itemId ? { updateItem: itemId } : { connectorIds: ids, selectedConnectorId: ids[0] }),
    onSuccess: (d: { item: { id: string } }) => onItem(d.item.id),
    onError: (e: { message: string }) => onError(friendlyError(e.message)),
  });
  await widget.init();
}

export function friendlyError(msg: string): string {
  if (/TRIAL_CLIENT_ITEM_CREATE_NOT_ALLOWED/i.test(msg)) {
    return "Sua conta da Pluggy é de teste e só pode conectar pelo MeuPluggy. Conecte seus bancos em meu.pluggy.ai e, na janela da Arvia, escolha MeuPluggy (não o banco direto).";
  }
  return msg;
}
