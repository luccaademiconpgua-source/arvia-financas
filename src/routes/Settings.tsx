import { useEffect, useState } from "react";
import { Card } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton } from "../components/Sheet";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";
import { usePrefs } from "../store/prefs";
import { useUI } from "../store/ui";
import { useRefresh } from "../store/refresh";
import { useData } from "../store/data";
import { detectTransfers } from "../store/actions";
import type { Mode } from "../types";
import { AiKeysSheet } from "../components/ai/AiKeysSheet";
import { aiStatus, type AiStatus } from "../services/ai";
import { disablePush, enablePush, pushState, testPush, type PushState } from "../services/push";

const TABLES = ["accounts", "cards", "card_invoices", "categories", "goals", "debts", "transactions", "nfce_scans", "vehicles", "vehicle_logs", "vehicle_reminders"] as const;

export function Settings() {
  const { profile, household, members, session, reload, signOut } = useAuth();
  const { startMode, setStartMode } = usePrefs();
  const showToast = useUI((s) => s.showToast);
  const [draft, setDraft] = useState(profile?.name ?? "");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim().slice(0, 24);
    if (!name) return setError("Informe um nome.");
    const { error: err } = await supabase.from("profiles").update({ name }).eq("id", session?.user.id ?? "");
    if (err) return setError(err.message);
    setError("");
    await reload();
    showToast("Nome salvo");
  }

  async function exportJson() {
    const out: Record<string, unknown> = { app: "arvia", version: 2, exportedAt: new Date().toISOString() };
    for (const t of TABLES) {
      const rows: unknown[] = [];
      for (let from = 0; from < 50000; from += 1000) {
        const { data, error: err } = await supabase.from(t).select("*").range(from, from + 999);
        if (err) return setError(err.message);
        rows.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      out[t] = rows;
    }
    const href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = href;
    a.download = "arvia-backup.json";
    a.click();
    URL.revokeObjectURL(href);
    showToast("Backup exportado");
  }

  async function copyCode() {
    if (!household) return;
    try {
      await navigator.clipboard.writeText(household.inviteCode);
      setCopied(true);
    } catch {
      setError("Não consegui copiar. Selecione o código e copie à mão.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Perfil">
        <form className="flex flex-col gap-3" onSubmit={(e) => void saveName(e)}>
          <Field label="Nome" error={error}>
            <input className={inputClass} maxLength={24} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </Field>
          <Field label="Modo ao abrir">
            <select className={inputClass} value={startMode} onChange={(e) => setStartMode(e.target.value as Mode)}>
              <option value="pessoal">Pessoal</option>
              <option value="casa">Casa</option>
            </select>
          </Field>
          <PrimaryButton type="submit" className="self-start">Salvar</PrimaryButton>
        </form>
        <p className="mt-3 text-sm text-muted">Conta: {session?.user.email}</p>
      </Card>
      <Card title="Casa">
        {household ? (
          <>
            <p className="font-medium">{household.name}</p>
            <p className="text-sm text-muted">Moradores: {members.map((m) => m.name).join(" e ")}</p>
            {members.length < 2 && (
              <div className="mt-3">
                <p className="text-sm text-muted">Mande este código para a outra pessoa entrar na casa:</p>
                <p className="num mt-1 text-lg font-semibold select-all">{household.inviteCode}</p>
                <SecondaryButton type="button" onClick={() => void copyCode()} className="mt-2">{copied ? "Código copiado" : "Copiar código"}</SecondaryButton>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">Você ainda não faz parte de uma casa. Saia e entre de novo para criar ou aceitar um convite.</p>
        )}
      </Card>
      <Card title="Dados">
        <SecondaryButton type="button" onClick={() => void exportJson()}>Exportar arvia-backup.json</SecondaryButton>
        <p className="mt-2 text-sm text-muted">O backup inclui tudo o que você enxerga: seus dados pessoais e os da casa.</p>
      </Card>
      <PushCard />
      <GeminiCard />
      <TransferNamesCard />
      <CategoryRulesCard />
      <ResetCard />
      <Card title="Sessão">
        <SecondaryButton type="button" onClick={() => void signOut()}>Sair da conta</SecondaryButton>
      </Card>
      <Card title="Sobre">
        <p className="text-sm text-muted">
          A consulta de notas baixa a página pública da SEFAZ. A Arvia não emite nota fiscal. Os dados ficam no seu banco do Supabase, e cada pessoa só vê o que é seu e o que é da casa.
        </p>
      </Card>
    </div>
  );
}

function PushCard() {
  const showToast = useUI((s) => s.showToast);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      showToast(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não deu certo agora.");
    }
    setState(await pushState());
    setBusy(false);
  }
  return (
    <Card title="Notificações no celular">
      <p className="text-sm text-muted">
        Todo dia de manhã a Arvia avisa o que precisa de atenção: conta fixa ou fatura vencendo, orçamento passando de 80%, itens que acabaram na despensa e revisão do carro chegando. Cada aviso chega uma vez só.
      </p>
      {state === null && <p className="mt-3 text-sm text-muted">Verificando…</p>}
      {state === "precisa-instalar" && (
        <p className="mt-3 rounded-lg bg-page p-3 text-sm">
          No iPhone, as notificações só funcionam com a Arvia instalada: no Safari, toque em Compartilhar e depois em <strong>Adicionar à Tela de Início</strong>. Abra a Arvia pelo ícone e volte aqui.
        </p>
      )}
      {state === "indisponivel" && <p className="mt-3 text-sm text-muted">Este navegador não aceita notificações. No Android, use o Chrome; no iPhone, instale a Arvia na tela de início.</p>}
      {state === "bloqueado" && <p className="mt-3 text-sm text-danger">As notificações estão bloqueadas para este site. Libere nas configurações do navegador (Permissões do site, Notificações) e volte aqui.</p>}
      {state === "desligado" && (
        <PrimaryButton type="button" className="mt-3" disabled={busy} onClick={() => void run(enablePush, "Notificações ligadas neste aparelho")}>Ligar notificações neste aparelho</PrimaryButton>
      )}
      {state === "ligado" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <PrimaryButton type="button" disabled={busy} onClick={() => void run(async () => { const n = await testPush(); if (n === 0) throw new Error("O teste não chegou. Desligue e ligue de novo."); }, "Notificação de teste enviada")}>Mandar notificação de teste</PrimaryButton>
          <SecondaryButton type="button" disabled={busy} onClick={() => void run(disablePush, "Notificações desligadas neste aparelho")}>Desligar neste aparelho</SecondaryButton>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}

function GeminiCard() {
  const [st, setSt] = useState<AiStatus | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void aiStatus().then(setSt);
  }, [open]);
  const line = (n: string, k?: AiStatus["groq"]) => (k?.mine ? `${n}: chave salva, terminando em ${k.hint}` : k?.shared ? `${n}: usando a chave de outra pessoa da casa` : `${n}: sem chave`);
  return (
    <Card title="Inteligência artificial">
      <p className="text-sm text-muted">O assistente, o lançamento por áudio, o ditado da lista e a leitura de fotos usam o Groq e o Gemini, que são gratuitos. Cole aqui as chaves de cada um.</p>
      {st && (
        <ul className="mt-2 space-y-1 text-sm">
          <li>{line("Groq", st.groq)}</li>
          <li>{line("Gemini", st.gemini)}</li>
        </ul>
      )}
      <PrimaryButton type="button" className="mt-3" onClick={() => setOpen(true)}>Colar ou trocar as chaves</PrimaryButton>
      {open && <AiKeysSheet onClose={() => setOpen(false)} />}
    </Card>
  );
}

function ResetCard() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const showToast = useUI((s) => s.showToast);
  const prefs = usePrefs();

  async function reset() {
    setBusy(true);
    setError("");
    const { error: err } = await supabase.rpc("reset_my_account", { p_confirm: typed.trim().toUpperCase() });
    setBusy(false);
    if (err) return setError(err.message);
    prefs.setStartMode("pessoal");
    prefs.setMode("pessoal");
    prefs.setHidden(false);
    useData.getState().clear();
    useRefresh.getState().bump();
    setOpen(false);
    setTyped("");
    showToast("Conta redefinida");
  }

  return (
    <Card title="Redefinir a conta">
      <p className="text-sm text-muted">
        Apaga todos os seus dados do modo Pessoal (contas, cartões, lançamentos, metas, dívidas, veículos e conexões de banco) e volta as categorias e preferências ao padrão. Os dados da Casa não são tocados.
      </p>
      {!open ? (
        <SecondaryButton type="button" className="mt-3" onClick={() => setOpen(true)}>Redefinir minha conta</SecondaryButton>
      ) : (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-danger/40 bg-expense-bg p-3">
          <p className="text-sm">Isso não pode ser desfeito. Se quiser guardar uma cópia, use Exportar acima antes. Para confirmar, digite REDEFINIR.</p>
          <Field label="Confirmação" error={error}>
            <input className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || typed.trim().toUpperCase() !== "REDEFINIR"} onClick={() => void reset()} className="min-h-11 rounded-lg bg-danger px-4 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "Apagando…" : "Apagar meus dados pessoais"}
            </button>
            <SecondaryButton type="button" onClick={() => { setOpen(false); setTyped(""); setError(""); }}>Cancelar</SecondaryButton>
          </div>
        </div>
      )}
    </Card>
  );
}

function TransferNamesCard() {
  const { profile, members, session, reload } = useAuth();
  const showToast = useUI((s) => s.showToast);
  const saved = profile?.transferNames ?? [];
  const names = saved.length ? saved : profile?.name ? [profile.name] : [];
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const partner = members.find((m) => m.id !== profile?.id);

  async function save(next: string[]) {
    setBusy(true);
    setMsg("");
    const { error } = await supabase.from("profiles").update({ transfer_names: next }).eq("id", session?.user.id ?? "");
    setBusy(false);
    if (error) return setMsg(error.message);
    await reload();
  }

  async function run() {
    setBusy(true);
    setMsg("");
    try {
      const r = await detectTransfers();
      const total = r.by_name + r.pairs * 2;
      setMsg(total === 0 ? "Nenhuma transferência nova encontrada." : `${total} lançamentos marcados como transferência.`);
      showToast("Busca concluída");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falhou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Transferências entre suas contas">
      <p className="text-sm text-muted">
        Dinheiro que só muda de uma conta sua para outra não é gasto nem ganho. A Arvia marca como transferência quando o Pix vem ou vai para um dos nomes abaixo, ou quando sai de uma conta e entra o mesmo valor em outra conta sua em até 3 dias. Você pode corrigir qualquer lançamento abrindo ele.
      </p>
      <p className="mt-3 text-sm font-medium">Nomes que são você (como aparecem no extrato)</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {names.map((n) => (
          <li key={n} className="flex items-center gap-1 rounded-full border border-line py-1 pr-1 pl-3 text-sm">
            {n}
            <button type="button" aria-label={`Remover ${n}`} disabled={busy} onClick={() => void save(names.filter((x) => x !== n))} className="flex size-8 items-center justify-center rounded-full text-muted hover:text-danger">×</button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim().replace(/\s+/g, " ");
          if (v.split(" ").filter((w) => w.length >= 3).length < 2) return setMsg("Use nome e sobrenome, como aparece no extrato.");
          setDraft("");
          void save([...new Set([...names, v])]);
        }}
      >
        <input className={`${inputClass} min-w-0 flex-1`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nome completo, como no Pix" />
        <SecondaryButton type="submit" disabled={busy}>Adicionar</SecondaryButton>
      </form>
      {partner && (
        <p className="mt-2 text-xs text-muted">
          Se o dinheiro entre você e {partner.name} deve contar como transferência (e não como gasto ou ganho), adicione o nome completo dela aqui.
        </p>
      )}
      <PrimaryButton type="button" className="mt-3" disabled={busy} onClick={() => void run()}>
        {busy ? "Procurando…" : "Procurar transferências agora"}
      </PrimaryButton>
      {msg && <p className="mt-2 text-sm" role="status">{msg}</p>}
    </Card>
  );
}

function CategoryRulesCard() {
  const showToast = useUI((s) => s.showToast);
  const version = useRefresh((s) => s.version);
  const [rules, setRules] = useState<Array<{ id: string; pattern: string; type: string; categories: { name: string } | null }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from("category_rules")
      .select("id, pattern, type, categories(name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRules((data ?? []) as unknown as typeof rules));
  }, [version]);

  async function runNow() {
    setBusy(true);
    const { data, error } = await supabase.rpc("auto_categorize");
    setBusy(false);
    if (error) return showToast(error.message);
    useRefresh.getState().bump();
    showToast(Number(data) > 0 ? `${data} lançamentos categorizados` : "Nada novo para categorizar");
  }

  return (
    <Card title="Categorias automáticas">
      <p className="text-sm text-muted">
        Lançamentos do banco e de extratos entram já com categoria: pelo que você ensinou, por palavras como mercado, posto e farmácia, ou pela categoria que o banco informa. Para ensinar, abra um lançamento, escolha a categoria e marque "aplicar a todos e lembrar para os próximos".
      </p>
      {rules.length > 0 && (
        <>
          <p className="mt-3 text-sm font-medium">O que a Arvia aprendeu</p>
          <ul className="mt-1 divide-y divide-line text-sm">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate uppercase">{r.pattern}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted">{r.categories?.name ?? "-"}</span>
                  <button
                    type="button"
                    aria-label={`Esquecer regra ${r.pattern}`}
                    className="flex size-9 items-center justify-center rounded-lg text-muted hover:text-danger"
                    onClick={() => void supabase.from("category_rules").delete().eq("id", r.id).then(() => useRefresh.getState().bump())}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <SecondaryButton type="button" className="mt-3" disabled={busy} onClick={() => void runNow()}>
        {busy ? "Categorizando…" : "Categorizar agora os lançamentos sem categoria"}
      </SecondaryButton>
    </Card>
  );
}
