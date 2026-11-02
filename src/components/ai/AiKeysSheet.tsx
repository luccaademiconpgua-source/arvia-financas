import { useEffect, useState } from "react";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../Sheet";
import { aiStatus, deleteAiKey, saveAiKey, type AiStatus, type Provider } from "../../services/ai";
import { useUI } from "../../store/ui";

const INFO: Record<Provider, { name: string; url: string; steps: string[]; placeholder: string; use: string }> = {
  groq: {
    name: "Groq",
    url: "https://console.groq.com/keys",
    steps: ["Abra console.groq.com/keys e entre com sua conta Google.", "Toque em Create API Key, dê um nome (ex.: Arvia) e confirme.", "Copie a chave (começa com gsk_) e cole aqui."],
    placeholder: "gsk_…",
    use: "Responde rápido no assistente e entende seus áudios.",
  },
  gemini: {
    name: "Gemini (Google)",
    url: "https://aistudio.google.com/apikey",
    steps: ["Abra aistudio.google.com/apikey e entre com sua conta Google.", "Toque em Create API key (criar chave) e confirme.", "Copie a chave (começa com AIza) e cole aqui."],
    placeholder: "AIza…",
    use: "Lê fotos de listas escritas à mão e assume o assistente quando o Groq estiver ocupado.",
  },
};

/** Onde colar as chaves gratuitas do Groq e do Gemini. */
export function AiKeysSheet({ reason, onClose, onSaved }: { reason?: string; onClose: () => void; onSaved?: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const [st, setSt] = useState<AiStatus | null>(null);
  const [tab, setTab] = useState<Provider>("groq");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => void aiStatus().then(setSt);
  useEffect(load, []);
  const info = INFO[tab];
  const s = st?.[tab];

  return (
    <Sheet title="Inteligência artificial" onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        {reason && <p className="font-medium">{reason}</p>}
        <p className="text-muted">
          O assistente usa duas IAs gratuitas: o Groq e o Gemini. Com as duas, uma assume quando a outra está ocupada ou chega no limite do dia. Uma só já funciona. Cada uma pede uma chave pessoal, que leva 2 minutos para criar.
        </p>
        <div role="tablist" aria-label="Provedor" className="grid grid-cols-2 rounded-xl border border-line p-1">
          {(["groq", "gemini"] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={tab === p} onClick={() => { setTab(p); setKey(""); setError(""); }} className={`min-h-11 rounded-lg text-sm font-medium ${tab === p ? "bg-brand text-white" : "text-muted"}`}>
              {INFO[p].name} {st?.[p].mine || st?.[p].shared ? "✓" : ""}
            </button>
          ))}
        </div>
        <p>{info.use}</p>
        {s?.mine && <p className="rounded-lg bg-income-bg p-2">Chave salva, terminando em {s.hint}. Colar outra substitui.</p>}
        {!s?.mine && s?.shared && <p className="rounded-lg bg-income-bg p-2">Já está usando a chave de outra pessoa da casa. Não precisa cadastrar outra.</p>}
        <ol className="list-decimal space-y-1 pl-5">
          {info.steps.map((x) => <li key={x}>{x}</li>)}
        </ol>
        <a href={info.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-medium text-brand underline">Abrir o site do {info.name}</a>
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            void saveAiKey(tab, key)
              .then(() => {
                showToast(`Chave do ${info.name} salva`);
                setKey("");
                load();
                onSaved?.();
              })
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false));
          }}
        >
          <Field label={`Chave do ${info.name}`} error={error}>
            <input className={inputClass} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder={info.placeholder} />
          </Field>
          <div className="flex gap-2">
            <PrimaryButton type="submit" className="flex-1" disabled={busy || key.trim().length < 20}>Salvar chave</PrimaryButton>
            <SecondaryButton type="button" onClick={onClose}>Fechar</SecondaryButton>
          </div>
        </form>
        <p className="text-xs text-muted">As chaves ficam guardadas cifradas no servidor e não voltam para o navegador. A outra pessoa da casa usa as mesmas chaves sem cadastrar de novo.</p>
        {s?.mine && (
          <button type="button" className="min-h-11 self-start text-muted underline" onClick={() => void deleteAiKey(tab).then(load)}>Apagar minha chave do {info.name}</button>
        )}
      </div>
    </Sheet>
  );
}
