import { useCallback, useEffect, useState } from "react";
import { Card, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton } from "../components/Sheet";
import { useUI } from "../store/ui";
import { ImportStatement } from "../components/ImportStatement";
import { disconnect, friendlyError, getStatus, listItems, openWidget, removeCredentials, saveCredentials, saveItem, syncAll, type PluggyItem } from "../services/pluggy";

function ago(iso: string | null) {
  if (!iso) return "ainda não sincronizou";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} d`;
}

export function Connections() {
  const showToast = useUI((s) => s.showToast);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [items, setItems] = useState<PluggyItem[]>([]);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const s = await getStatus();
      setConfigured(s.configured);
      setHint(s.hint);
      setItems(s.configured ? await listItems() : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado.");
    } finally {
      setBusy("");
    }
  }

  const onSaveCreds = (e: React.FormEvent) => {
    e.preventDefault();
    void run("creds", async () => {
      await saveCredentials(clientId, secret);
      setClientId("");
      setSecret("");
      showToast("Credenciais salvas");
      await load();
    });
  };

  const onConnect = (itemId?: string) =>
    void run("connect", async () => {
      await openWidget(
        itemId,
        (id) => {
          void run("save", async () => {
            const r = await saveItem(id);
            showToast(r.status === "ok" ? `${r.connector ?? "Banco"} sincronizado: ${r.transactions ?? 0} lançamentos novos` : (r.error ?? "Conectado, mas a leitura falhou"));
            await load();
          });
        },
        (m) => setError(friendlyError(m)),
      );
    });

  const onSync = () =>
    void run("sync", async () => {
      const res = await syncAll();
      const novos = res.reduce((n, r) => n + (r.transactions ?? 0), 0);
      showToast(`${novos} lançamentos novos`);
      await load();
    });

  const onRemoveItem = (id: string) =>
    void run("rm", async () => {
      await disconnect(id);
      await load();
      showToast("Banco desconectado");
    });

  const onRemoveCreds = () =>
    void run("rmc", async () => {
      await removeCredentials();
      await load();
      showToast("Credenciais removidas");
    });

  return (
    <div className="flex flex-col gap-4">
      {loading && <p className="text-sm text-muted">Carregando conexões…</p>}
      {error && <p role="alert" className="rounded-lg border border-line bg-card p-3 text-sm text-danger">{error}</p>}

      {loading ? null : configured ? (
        <Card title="Open Finance: bancos conectados pelo Meu Pluggy">
          {items.length === 0 ? (
            <p className="text-sm text-muted">Nenhum banco conectado ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {items.map((it) => (
                <li key={it.item_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.connector_name ?? "Banco"}</p>
                    <p className="text-xs text-muted">
                      {it.status === "ok" ? `Atualizado ${ago(it.last_sync_at)}` : (it.last_error ?? "Falha na leitura")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={it.status === "ok" ? "ok" : it.status === "expirada" ? "warn" : "danger"}>
                      {it.status === "ok" ? "Conectado" : it.status === "expirada" ? "Reconectar" : "Erro"}
                    </Pill>
                    {it.status === "expirada" && (
                      <SecondaryButton type="button" onClick={() => onConnect(it.item_id)}>Reconectar</SecondaryButton>
                    )}
                    <SecondaryButton type="button" disabled={!!busy} onClick={() => onRemoveItem(it.item_id)}>Remover</SecondaryButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton type="button" disabled={!!busy} onClick={() => onConnect()}>Conectar bancos</PrimaryButton>
            {items.length > 0 && (
              <SecondaryButton type="button" disabled={!!busy} onClick={onSync}>
                {busy === "sync" ? "Sincronizando…" : "Sincronizar agora"}
              </SecondaryButton>
            )}
          </div>
          <ItemIdForm busy={!!busy} onSave={(id) => void run("save", async () => {
            const r = await saveItem(id);
            showToast(r.status === "ok" ? `${r.connector ?? "Banco"} sincronizado: ${r.transactions ?? 0} lançamentos novos` : (r.error ?? "Conectado, mas a leitura falhou"));
            await load();
          })} />
          <p className="mt-3 text-xs text-muted">
            Credenciais ativas (Client ID terminado em {hint}). O Meu Pluggy atualiza os dados a cada 24 horas no plano gratuito.
          </p>
          <button type="button" className="mt-2 text-xs text-muted underline" onClick={onRemoveCreds} disabled={!!busy}>
            Remover minhas credenciais
          </button>
        </Card>
      ) : (
        <Card title="Open Finance: conectar seus bancos pelo Meu Pluggy">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Crie uma conta em <a className="underline" href="https://meu.pluggy.ai" target="_blank" rel="noreferrer">meu.pluggy.ai</a> e conecte seus bancos por lá.</li>
            <li>Entre em <a className="underline" href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer">dashboard.pluggy.ai</a> com a mesma conta e crie uma aplicação.</li>
            <li>Na aplicação, ative o conector <strong>MeuPluggy</strong> e copie o <strong>Client ID</strong> e o <strong>Client Secret</strong>.</li>
            <li>Cole os dois abaixo. O segredo fica guardado cifrado no servidor e não volta para o seu navegador.</li>
          </ol>
          <form onSubmit={onSaveCreds} className="mt-4 flex flex-col gap-3">
            <Field label="Client ID">
              <input className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" required />
            </Field>
            <Field label="Client Secret">
              <input className={inputClass} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" required />
            </Field>
            <PrimaryButton type="submit" disabled={busy === "creds"}>Salvar credenciais</PrimaryButton>
          </form>
        </Card>
      )}

      <ImportStatement />

      <Card title="Como funciona o Open Finance">
        <p className="text-sm text-muted">
          O Open Finance é o sistema do Banco Central para você autorizar a leitura de saldos e extratos. A Arvia não pede a senha do banco: a leitura passa pelo Meu Pluggy, e cada pessoa usa as próprias credenciais. As contas importadas ficam no escopo Pessoal; lançamentos de casa você marca como Casa dentro da Arvia.
        </p>
        <p className="mt-2 text-sm text-muted">
          O plano gratuito do Meu Pluggy é para uso pessoal, com contas do mesmo titular. Transferências entre as suas contas aparecem como despesa e receita.
        </p>
      </Card>
    </div>
  );
}

function ItemIdForm({ busy, onSave }: { busy: boolean; onSave: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const valid = /^[0-9a-f-]{8,64}$/i.test(id.trim());
  if (!open) {
    return (
      <button type="button" className="mt-3 block text-sm text-brand underline underline-offset-4" onClick={() => setOpen(true)}>
        Já tenho o Item ID da conexão
      </button>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-line p-3">
      <p className="text-sm text-muted">
        No dashboard.pluggy.ai, abra sua aplicação, clique em Ir para Demo, conecte pelo MeuPluggy e use o menu de três pontinhos para copiar o Item ID. Cole aqui:
      </p>
      <input className={inputClass} value={id} onChange={(e) => setId(e.target.value)} placeholder="ex.: 7f3c1e2a-..." autoComplete="off" />
      <div className="flex gap-2">
        <PrimaryButton type="button" disabled={busy || !valid} onClick={() => onSave(id.trim())}>Conectar com este Item ID</PrimaryButton>
        <SecondaryButton type="button" onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
      </div>
    </div>
  );
}
