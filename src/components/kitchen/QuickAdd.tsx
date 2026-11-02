import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Square } from "lucide-react";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../Sheet";
import { parseItemText, type Ingredient } from "../../lib/kitchen";
import { parseSpoken } from "../../lib/spokenList";
import { addShopping } from "../../services/kitchen";
import { deleteGeminiKey, geminiStatus, listen, NeedsKey, readListPhoto, saveGeminiKey, voiceAvailable, type GeminiStatus } from "../../services/listInput";
import { useUI } from "../../store/ui";
import type { Mode } from "../../types";

const toText = (i: Ingredient) => `${i.qty !== null ? `${String(i.qty).replace(".", ",")}${i.unit ? ` ${i.unit}` : ""} ` : ""}${i.name}`;

/** Botões de ditar e de fotografar a lista, com revisão antes de adicionar. */
export function QuickAdd({ mode }: { mode: Mode }) {
  const showToast = useUI((s) => s.showToast);
  const [listening, setListening] = useState<null | { stop: () => void }>(null);
  const [heard, setHeard] = useState("");
  const [review, setReview] = useState<null | { from: "voz" | "foto"; items: Ingredient[] }>(null);
  const [reading, setReading] = useState(false);
  const [keySheet, setKeySheet] = useState<null | { reason: string; retry?: File }>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function startVoice() {
    setError("");
    setHeard("");
    try {
      const s = listen(setHeard);
      setListening({ stop: s.stop });
      s.done
        .then((t) => {
          setListening(null);
          const items = parseSpoken(t);
          if (items.length === 0) return setError(t ? `Não entendi itens em "${t}". Tente falar os itens separados por "e".` : "Não ouvi nada. Toque no microfone e fale os itens.");
          setReview({ from: "voz", items });
        })
        .catch((e: Error) => {
          setListening(null);
          setError(e.message);
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui usar o microfone.");
    }
  }

  async function readPhoto(file: File) {
    setError("");
    setReading(true);
    try {
      const items = await readListPhoto(file);
      if (items.length === 0) setError("Não encontrei itens nessa foto. Tente com mais luz e a lista inteira enquadrada.");
      else setReview({ from: "foto", items });
    } catch (e) {
      if (e instanceof NeedsKey) setKeySheet({ reason: e.message, retry: file });
      else setError(e instanceof Error ? e.message : "Não consegui ler a foto.");
    } finally {
      setReading(false);
    }
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {voiceAvailable() && (
          listening ? (
            <button type="button" onClick={() => listening.stop()} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-danger px-3 text-sm font-medium text-white">
              <Square size={16} aria-hidden="true" /> Parar de ouvir
            </button>
          ) : (
            <SecondaryButton type="button" className="flex flex-1 items-center justify-center gap-2" onClick={startVoice}>
              <Mic size={18} aria-hidden="true" /> Ditar itens
            </SecondaryButton>
          )
        )}
        <SecondaryButton type="button" className="flex flex-1 items-center justify-center gap-2" disabled={reading} onClick={() => fileRef.current?.click()}>
          <Camera size={18} aria-hidden="true" /> {reading ? "Lendo a foto…" : "Foto de uma lista"}
        </SecondaryButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="Foto da lista de compras"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void readPhoto(f);
          }}
        />
      </div>
      {listening && (
        <p aria-live="polite" className="mt-2 rounded-lg bg-page p-3 text-sm">
          {heard || "Pode falar: \"dois quilos de arroz, leite e seis ovos\"."}
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}

      {review && (
        <ReviewSheet
          title={review.from === "voz" ? "Itens que eu ouvi" : "Itens que li na foto"}
          items={review.items}
          onClose={() => setReview(null)}
          onConfirm={(items) =>
            void addShopping(mode, items, "manual").then(() => {
              showToast(`${items.length} ${items.length === 1 ? "item" : "itens"} na lista`);
              setReview(null);
            })
          }
        />
      )}
      {keySheet && (
        <GeminiKeySheet
          reason={keySheet.reason}
          onClose={() => setKeySheet(null)}
          onSaved={() => {
            const f = keySheet.retry;
            setKeySheet(null);
            if (f) void readPhoto(f);
          }}
        />
      )}
    </>
  );
}

function ReviewSheet({ title, items, onClose, onConfirm }: { title: string; items: Ingredient[]; onClose: () => void; onConfirm: (items: Ingredient[]) => void }) {
  const [rows, setRows] = useState(items.map((i) => ({ on: true, text: toText(i) })));
  const chosen = rows.filter((r) => r.on && r.text.trim().length >= 2);
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-sm text-muted">Confira, corrija o que precisar e desmarque o que não quer.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-brand"
              aria-label={`Incluir ${r.text}`}
              checked={r.on}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
            />
            <input
              className={`${inputClass} min-w-0 flex-1 ${r.on ? "" : "text-muted line-through"}`}
              aria-label={`Item ${i + 1}`}
              value={r.text}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
            />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <PrimaryButton type="button" className="flex-1" disabled={chosen.length === 0} onClick={() => onConfirm(chosen.map((r) => parseItemText(r.text.trim())))}>
          Adicionar {chosen.length} {chosen.length === 1 ? "item" : "itens"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
      </div>
    </Sheet>
  );
}

export function GeminiKeySheet({ reason, onClose, onSaved }: { reason?: string; onClose: () => void; onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<GeminiStatus | null>(null);
  useEffect(() => {
    void geminiStatus().then(setSt);
  }, []);
  return (
    <Sheet title="Ler fotos de listas" onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        {reason && <p className="font-medium">{reason}</p>}
        <p className="text-muted">
          Quem lê a letra da foto é o Gemini, a inteligência artificial do Google. O uso para isso é gratuito, mas o Google pede uma chave pessoal. Leva 2 minutos:
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Abra <strong>aistudio.google.com/apikey</strong> e entre com sua conta Google.</li>
          <li>Toque em <strong>Create API key</strong> (criar chave) e confirme.</li>
          <li>Copie a chave (começa com AIza) e cole aqui embaixo.</li>
        </ol>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-medium text-brand underline">Abrir o Google AI Studio</a>
        {st?.mine && <p className="text-muted">Você já tem uma chave salva, terminando em {st.hint}. Colar outra substitui a atual.</p>}
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            void saveGeminiKey(key)
              .then(onSaved)
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false));
          }}
        >
          <Field label="Chave do Gemini" error={error}>
            <input className={inputClass} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder="AIza…" />
          </Field>
          <div className="flex gap-2">
            <PrimaryButton type="submit" className="flex-1" disabled={busy || key.trim().length < 30}>Salvar chave</PrimaryButton>
            <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
          </div>
        </form>
        <p className="text-xs text-muted">A chave fica guardada cifrada no servidor e não volta para o navegador. A outra pessoa da casa pode usar a mesma chave sem cadastrar outra.</p>
        {st?.mine && (
          <button type="button" className="min-h-11 self-start text-muted underline" onClick={() => void deleteGeminiKey().then(onClose)}>Apagar minha chave</button>
        )}
      </div>
    </Sheet>
  );
}
