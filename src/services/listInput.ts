import { supabase } from "../lib/supabase";
import type { Ingredient } from "../lib/kitchen";

// ---------- Voz (reconhecimento do próprio navegador, de graça) ----------
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
const RecCtor = (): (new () => Rec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const voiceAvailable = () => typeof window !== "undefined" && RecCtor() !== null;

/** Escuta até a pessoa parar de falar. onText recebe o texto parcial; resolve com o texto final. */
export function listen(onText: (t: string) => void): { done: Promise<string>; stop: () => void } {
  const C = RecCtor();
  if (!C) return { done: Promise.reject(new Error("Este navegador não reconhece voz. No Android use o Chrome; no iPhone, o Safari.")), stop: () => undefined };
  const r = new C();
  r.lang = "pt-BR";
  r.interimResults = true;
  r.continuous = true;
  let text = "";
  const done = new Promise<string>((resolve, reject) => {
    r.onresult = (e) => {
      text = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim();
      onText(text);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      reject(new Error(e.error === "not-allowed" ? "Sem permissão para o microfone. Libere nas configurações do navegador." : "Não consegui ouvir agora. Tente de novo."));
    };
    r.onend = () => resolve(text);
  });
  r.start();
  return { done, stop: () => r.stop() };
}

// ---------- Foto (lida pelo Gemini no servidor) ----------
/** Reduz a foto para no máximo 1600 px e JPEG, para subir rápido e caber no limite. */
async function shrink(file: File): Promise<{ data: string; mime: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { data: url.slice(url.indexOf(",") + 1), mime: "image/jpeg" };
}

export class NeedsKey extends Error {}

export async function readListPhoto(file: File): Promise<Ingredient[]> {
  const img = await shrink(file);
  const { data, error } = await supabase.functions.invoke("list-photo", { body: { image: img.data, mime: img.mime } });
  let msg = (data as { error?: string } | null)?.error;
  if (error) {
    try {
      msg = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error ?? msg;
    } catch {
      /* corpo sem JSON */
    }
  }
  if (msg === "sem_chave") throw new NeedsKey("Configure a chave do Gemini.");
  if (msg === "chave_invalida") throw new NeedsKey("A chave do Gemini foi recusada pelo Google. Cole uma chave nova.");
  if (msg || error) throw new Error(msg ?? "Não consegui ler a foto agora.");
  return ((data as { items?: Ingredient[] }).items ?? []).map((i) => ({ name: i.name, qty: i.qty ?? null, unit: i.unit ?? null }));
}

export type GeminiStatus = { mine: boolean; hint: string | null; shared: boolean };
export async function geminiStatus(): Promise<GeminiStatus> {
  const { data } = await supabase.rpc("gemini_status");
  return (data as GeminiStatus) ?? { mine: false, hint: null, shared: false };
}
export async function saveGeminiKey(key: string) {
  const { error } = await supabase.rpc("save_gemini_key", { p_key: key.trim() });
  if (error) throw new Error(error.message);
}
export async function deleteGeminiKey() {
  const { error } = await supabase.rpc("delete_gemini_key");
  if (error) throw new Error(error.message);
}
