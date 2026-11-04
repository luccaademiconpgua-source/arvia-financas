import { useCallback, useEffect, useState } from "react";
import { Card, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton } from "../components/Sheet";
import { useUI } from "../store/ui";
import { ImportStatement } from "../components/ImportStatement";
import { disconnect, friendlyError, getStatus, listItems, moveItemScope, openWidget, removeCredentials, renameItem, saveCredentials, saveItem, syncAll, type PluggyItem } from "../services/pluggy";
import { useAuth } from "../store/auth";

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
  const hasEmpresa = useAuth((s) => !!s.profile?.empresaName);
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
          <p className="mb-3 rounded-lg bg-page p-3 text-sm">
            O Meu Pluggy libera <strong>um banco por vez</strong>. Para cada banco que você tem lá, toque em <strong>Conectar mais um banco</strong>, entre no Meu Pluggy e escolha um banco diferente. Cada conta vira uma carteira aqui, e os cartões de crédito aparecem em Cartões.
          </p>
          {items.length === 0 ? (
            <p className="text-sm text-muted">Nenhum banco conectado ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {items.map((it) => (
                <ConnectionRow
                  key={it.item_id}
                  item={it}
                  busy={!!busy}
                  hasEmpresa={hasEmpresa}
                  onReconnect={() => onConnect(it.item_id)}
                  onRemove={() => onRemoveItem(it.item_id)}
                  onChanged={() => void load()}
                />
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton type="button" disabled={!!busy} onClick={() => onConnect()}>{items.length ? "Conectar mais um banco" : "Conectar um banco"}</PrimaryButton>
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
            <li>Crie uma conta em <a className="underline" href="https://meu.pluggy.ai" target="_blank" rel="noreferrer">meu.pluggy.ai</a> e conecte seus bancos por lá. Depois, aqui na Arvia, você traz um banco de cada vez.</li>
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

function ConnectionRow({ item: it, busy, hasEmpresa, onReconnect, onRemove, onChanged }: {
  item: PluggyItem;
  busy: boolean;
  hasEmpresa: boolean;
  onReconnect: () => void;
  onRemove: () => void;
  onChanged: () => void;
}) {
  const showToast = useUI((s) => s.showToast);
  const auto = it.connector_name && !/meu\s*pluggy/i.test(it.connector_name) ? it.connector_name : "Banco";
  const name = it.custom_name ?? auto;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [err, setErr] = useState("");
  const [working, setWorking] = useState(false);
  const info = it.accounts_info ?? [];
  const contas = info.filter((a) => a.type === "conta");
  const cartoes = info.filter((a) => a.type === "cartao");
  const linked = it.accounts_info !== null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setErr("");
    try {
      await renameItem(it.item_id, draft);
      showToast("Nome salvo nas contas desta conexão");
      setEditing(false);
      onChanged();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Não consegui renomear.");
    } finally {
      setWorking(false);
    }
  }

  async function move(scope: "pessoal" | "empresa") {
    setWorking(true);
    setErr("");
    try {
      const n = await moveItemScope(it.item_id, scope);
      showToast(`${name} foi para ${scope === "empresa" ? "a Empresa" : "o Pessoal"}${n ? ` com ${n} lançamentos` : ""}`);
      onChanged();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Não consegui mover.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-xs text-muted">
            {it.status === "ok" ? `Atualizado ${ago(it.last_sync_at)}` : (it.last_error ?? "Falha na leitura")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={it.status === "ok" ? "ok" : it.status === "expirada" ? "warn" : "danger"}>
            {it.status === "ok" ? "Conectado" : it.status === "expirada" ? "Reconectar" : "Erro"}
          </Pill>
          {it.status === "expirada" && <SecondaryButton type="button" onClick={onReconnect}>Reconectar</SecondaryButton>}
          <SecondaryButton type="button" disabled={busy || working} onClick={() => { setDraft(name); setEditing((v) => !v); }}>Renomear</SecondaryButton>
          <SecondaryButton type="button" disabled={busy || working} onClick={onRemove}>Remover</SecondaryButton>
        </div>
      </div>

      {linked ? (
        <p className="text-xs text-muted">
          {info.length === 0
            ? (it.last_error ?? "Nenhuma conta veio por esta conexão.")
            : [
                contas.length ? `${contas.length === 1 ? "Conta" : "Contas"}: ${contas.map((c) => c.name + (c.last4 ? ` final ${c.last4}` : "")).join(", ")}` : "",
                cartoes.length ? `${cartoes.length === 1 ? "Cartão" : "Cartões"}: ${cartoes.map((c) => c.name + (c.last4 ? ` final ${c.last4}` : "")).join(", ")}` : "",
              ].filter(Boolean).join(". ")}
        </p>
      ) : (
        <p className="text-xs text-muted">Toque em Sincronizar agora para ver o que veio por esta conexão.</p>
      )}

      {hasEmpresa && (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={`De quem é ${name}`}>
          <span className="text-muted">É de:</span>
          {(["pessoal", "empresa"] as const).map((sc) => (
            <button
              key={sc}
              type="button"
              aria-pressed={it.scope === sc}
              disabled={working || busy || it.scope === sc || !linked}
              onClick={() => void move(sc)}
              className={`min-h-9 rounded-full border px-3 text-sm ${it.scope === sc ? "border-brand bg-brand text-white" : "border-line hover:bg-page"} disabled:cursor-default`}
            >
              {sc === "pessoal" ? "Pessoa física" : "Empresa"}
            </button>
          ))}
        </div>
      )}

      {editing && (
        <form onSubmit={save} className="flex flex-wrap items-end gap-2" noValidate>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="text-muted">Nome desta conexão (vale para as contas dela)</span>
            <input className={inputClass} maxLength={40} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Inter PJ" />
          </label>
          <PrimaryButton type="submit" disabled={working || !draft.trim()}>Salvar nome</PrimaryButton>
        </form>
      )}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </li>
  );
}
