import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Copy, Trash2, Watch } from "lucide-react";
import { Card } from "./ui";
import { inputClass, PrimaryButton, SecondaryButton } from "./Sheet";
import { supabase } from "../lib/supabase";
import { useUI } from "../store/ui";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai`;
type Key = { id: string; hint: string; label: string; created_at: string; last_used_at: string | null };

async function copy(text: string, ok: () => void) {
  try {
    await navigator.clipboard.writeText(text);
    ok();
  } catch {
    window.prompt("Copie:", text);
  }
}

/** Apple Watch e Siri: chave pessoal + passo a passo do app Atalhos. */
export function WatchCard() {
  const showToast = useUI((s) => s.showToast);
  const [keys, setKeys] = useState<Key[]>([]);
  const [fresh, setFresh] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [steps, setSteps] = useState(false);
  const [test, setTest] = useState("quanto gastei este mês?");
  const [answer, setAnswer] = useState("");
  const personal = fresh ? `${ENDPOINT}?chave=${fresh}` : "";

  async function load() {
    const { data } = await supabase.from("watch_keys").select("id,hint,label,created_at,last_used_at").order("created_at", { ascending: false });
    setKeys((data ?? []) as Key[]);
  }
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.rpc("create_watch_key", { p_label: "Apple Watch" });
    setBusy(false);
    if (err) return setError(err.message);
    setFresh(String(data));
    setSteps(true);
    void load();
  }

  async function remove(id: string) {
    await supabase.from("watch_keys").delete().eq("id", id);
    void load();
  }

  async function runTest() {
    if (!fresh) return;
    setAnswer("Pensando…");
    try {
      const fd = new FormData();
      fd.append("texto", test);
      const r = await fetch(personal, { method: "POST", body: fd });
      setAnswer(await r.text());
    } catch {
      setAnswer("Não consegui falar com a Arvia agora.");
    }
  }

  return (
    <Card title="Apple Watch e Siri">
      <p className="text-sm text-muted">
        Fale com o relógio ("E aí Siri, Arvia") para lançar gastos e recebimentos, marcar compromissos ou perguntar coisas como "quanto gastei este mês?". Funciona pelo app Atalhos da Apple.
      </p>

      {fresh ? (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-brand p-3 text-sm">
          <p className="font-medium">Seu endereço do relógio (aparece só agora, já com a sua chave):</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-page px-2 py-1.5 text-xs">{personal}</code>
            <button type="button" aria-label="Copiar endereço" onClick={() => void copy(personal, () => showToast("Endereço copiado"))} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line"><Copy size={16} aria-hidden="true" /></button>
          </div>
          <p className="text-xs text-muted">Quem tiver esse endereço consegue lançar e consultar no seu nome. Não compartilhe. Se perder o relógio, apague a chave aqui embaixo.</p>
        </div>
      ) : (
        <PrimaryButton type="button" className="mt-3 flex items-center gap-2" disabled={busy} onClick={() => void create()}>
          <Watch size={18} aria-hidden="true" /> {keys.length ? "Gerar endereço novo do relógio" : "Gerar endereço do relógio"}
        </PrimaryButton>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}

      <button type="button" className="mt-3 min-h-11 text-sm font-medium text-brand underline underline-offset-4" aria-expanded={steps} onClick={() => setSteps((v) => !v)}>
        {steps ? "Esconder o passo a passo" : "Ver como montar o atalho"}
      </button>
      {steps && (
        <ol className="mt-1 list-decimal space-y-2 pl-5 text-sm">
          <li>No iPhone, abra o app <strong>Atalhos</strong> e toque em <strong>+</strong> (canto de cima). Toque no nome lá em cima, escolha <strong>Renomear</strong> e escreva <strong>Arvia</strong>.</li>
          <li>Toque em <strong>Adicionar Ação</strong>, digite <strong>ditar</strong> na busca e escolha <strong>Ditar Texto</strong>.</li>
          <li>Na busca de baixo, digite <strong>conteúdo</strong> e escolha <strong>Obter Conteúdo da URL</strong>. Toque na palavra azul <strong>URL</strong> e cole o seu endereço do relógio (o de cima, já com a chave).</li>
          <li>Nessa mesma ação, toque na setinha <strong>&gt;</strong> para abrir as opções. Em <strong>Método</strong>, escolha <strong>POST</strong>. Em <strong>Corpo da Solicitação</strong>, deixe <strong>JSON</strong>, toque em <strong>Adicionar novo campo</strong> e escolha <strong>Texto</strong>. No nome do campo escreva <strong>texto</strong>; no valor, toque e escolha <strong>Texto Ditado</strong> (aparece logo acima do teclado).</li>
          <li>Digite <strong>falar</strong> na busca e escolha <strong>Falar Texto</strong>. Ele já usa o <strong>Conteúdo da URL</strong> sozinho.</li>
          <li>Toque no <strong>▶</strong> embaixo para testar no iPhone: fale "quanto gastei este mês?". Se ele responder, está certo.</li>
          <li>Para o relógio: toque no nome do atalho lá em cima, depois em <strong>Detalhes</strong> (em alguns iPhones é o <strong>i</strong>) e ligue <strong>Mostrar no Apple Watch</strong>. No relógio, abra o app Atalhos ou diga <strong>"E aí Siri, Arvia"</strong>.</li>
        </ol>
      )}
      {steps && (
        <p className="mt-2 text-xs text-muted">Os nomes podem mudar um pouco conforme a versão do iPhone; buscar pela palavra (ditar, conteúdo, falar) sempre acha. Para desfazer o que o relógio lançou, abra o atalho e diga "desfazer" (vale por 30 minutos).</p>
      )}

      {fresh && (
        <div className="mt-4 flex flex-col gap-2 text-sm">
          <p className="font-medium">Testar daqui mesmo</p>
          <p className="text-xs text-muted">Funciona de verdade: se você escrever um gasto, ele é lançado.</p>
          <div className="flex gap-2">
            <input className={`${inputClass} min-w-0 flex-1`} aria-label="Frase de teste" value={test} onChange={(e) => setTest(e.target.value)} />
            <SecondaryButton type="button" onClick={() => void runTest()}>Testar</SecondaryButton>
          </div>
          {answer && <p className="rounded-lg bg-page p-3" aria-live="polite">{answer}</p>}
        </div>
      )}

      {keys.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                {k.label} terminando em <span className="num">{k.hint}</span>
                <span className="block text-xs text-muted">{k.last_used_at ? `usada em ${format(parseISO(k.last_used_at), "dd/MM 'às' HH:mm")}` : "ainda não usada"}</span>
              </span>
              <button type="button" aria-label={`Apagar a chave terminando em ${k.hint}`} onClick={() => void remove(k.id)} className="flex size-11 items-center justify-center text-muted hover:text-danger"><Trash2 size={16} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
