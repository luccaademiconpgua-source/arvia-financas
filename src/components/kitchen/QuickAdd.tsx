import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Sparkles, Square } from "lucide-react";
import { inputClass, PrimaryButton, SecondaryButton, Sheet } from "../Sheet";
import { AiKeysSheet } from "../ai/AiKeysSheet";
import { parseItemText, type Ingredient } from "../../lib/kitchen";
import { parseSpoken } from "../../lib/spokenList";
import { addShopping } from "../../services/kitchen";
import { AiNeedsKey, aiStatus, canRecord, hasAi, itemsFromPhoto, itemsFromText, startRecording, transcribe, type AiStatus } from "../../services/ai";
import { listen, voiceAvailable } from "../../services/listInput";
import { useUI } from "../../store/ui";
import type { Mode } from "../../types";

const toText = (i: Ingredient) => `${i.qty !== null ? `${String(i.qty).replace(".", ",")}${i.unit ? ` ${i.unit}` : ""} ` : ""}${i.name}`;

/** Falar ou fotografar a lista. Com IA: grava o áudio e a IA separa os itens. Sem IA: reconhecimento do celular. */
export function QuickAdd({ mode }: { mode: Mode }) {
  const showToast = useUI((s) => s.showToast);
  const [st, setSt] = useState<AiStatus | null>(null);
  const [rec, setRec] = useState<null | { stop: () => void }>(null);
  const [heard, setHeard] = useState("");
  const [busy, setBusy] = useState<"" | "ouvindo" | "lendo">("");
  const [review, setReview] = useState<null | { title: string; items: Ingredient[] }>(null);
  const [keys, setKeys] = useState<null | { reason?: string; retry?: () => void }>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const ai = hasAi(st);

  useEffect(() => {
    void aiStatus().then(setSt);
  }, [keys]);

  function needKey(e: unknown, retry?: () => void) {
    if (e instanceof AiNeedsKey) setKeys({ reason: e.message, ...(retry ? { retry } : {}) });
    else setError(e instanceof Error ? e.message : "Não deu certo agora.");
  }

  async function startAiVoice() {
    setError("");
    try {
      const r = await startRecording();
      setRec({ stop: r.stop });
      const audio = await r.done;
      setRec(null);
      setBusy("ouvindo");
      const text = await transcribe(audio);
      if (!text) return setError("Não ouvi nada. Tente de novo.");
      const items = await itemsFromText(text);
      if (!items.length) return setError(`Não achei itens em "${text}".`);
      setReview({ title: "Itens que eu ouvi", items });
    } catch (e) {
      setRec(null);
      needKey(e);
    } finally {
      setBusy("");
    }
  }

  function startPhoneVoice() {
    setError("");
    setHeard("");
    const s = listen(setHeard);
    setRec({ stop: s.stop });
    s.done
      .then((t) => {
        setRec(null);
        const items = parseSpoken(t);
        if (!items.length) return setError(t ? `Não entendi itens em "${t}".` : "Não ouvi nada. Toque no microfone e fale os itens.");
        setReview({ title: "Itens que eu ouvi", items });
      })
      .catch((e: Error) => {
        setRec(null);
        setError(e.message);
      });
  }

  async function readPhoto(file: File) {
    setError("");
    setBusy("lendo");
    try {
      const items = await itemsFromPhoto(file);
      if (!items.length) setError("Não encontrei itens nessa foto. Tente com mais luz e a lista inteira enquadrada.");
      else setReview({ title: "Itens que li na foto", items });
    } catch (e) {
      needKey(e, () => void readPhoto(file));
    } finally {
      setBusy("");
    }
  }

  const useAiVoice = ai && canRecord();
  const voiceOk = useAiVoice || voiceAvailable();

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {voiceOk &&
          (rec ? (
            <button type="button" onClick={() => rec.stop()} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-danger px-3 text-sm font-medium text-white">
              <Square size={16} aria-hidden="true" /> Parar e enviar
            </button>
          ) : (
            <SecondaryButton type="button" className="flex flex-1 items-center justify-center gap-2" disabled={!!busy} onClick={() => (useAiVoice ? void startAiVoice() : startPhoneVoice())}>
              <Mic size={18} aria-hidden="true" /> {busy === "ouvindo" ? "Entendendo…" : "Falar a lista"}
            </SecondaryButton>
          ))}
        <SecondaryButton type="button" className="flex flex-1 items-center justify-center gap-2" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          <Camera size={18} aria-hidden="true" /> {busy === "lendo" ? "Lendo a foto…" : "Foto de uma lista"}
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
      {rec && (
        <p aria-live="polite" className="mt-2 rounded-lg bg-page p-3 text-sm">
          {useAiVoice ? "Gravando… fale os itens do jeito que vier, por exemplo \"arroz, feijão, dois litros de leite\". Toque em Parar quando terminar." : heard || "Pode falar os itens."}
        </p>
      )}
      {st && !ai && (
        <button type="button" onClick={() => setKeys({})} className="mt-2 flex min-h-11 items-center gap-2 text-sm font-medium text-brand">
          <Sparkles size={16} aria-hidden="true" /> Ligar a IA para entender melhor o que você fala e ler fotos
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}

      {review && (
        <ReviewSheet
          title={review.title}
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
      {keys && (
        <AiKeysSheet
          {...(keys.reason ? { reason: keys.reason } : {})}
          onClose={() => setKeys(null)}
          onSaved={() => {
            const r = keys.retry;
            if (r) {
              setKeys(null);
              r();
            }
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
            <input type="checkbox" className="size-5 shrink-0 accent-brand" aria-label={`Incluir ${r.text}`} checked={r.on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
            <input className={`${inputClass} min-w-0 flex-1 ${r.on ? "" : "text-muted line-through"}`} aria-label={`Item ${i + 1}`} value={r.text} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          </li>
        ))}
      </ul>
      <button type="button" className="mt-2 min-h-11 text-sm text-brand" onClick={() => setRows([...rows, { on: true, text: "" }])}>Adicionar outro item</button>
      <div className="mt-3 flex gap-2">
        <PrimaryButton type="button" className="flex-1" disabled={chosen.length === 0} onClick={() => onConfirm(chosen.map((r) => parseItemText(r.text.trim())))}>
          Adicionar {chosen.length} {chosen.length === 1 ? "item" : "itens"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
      </div>
    </Sheet>
  );
}
