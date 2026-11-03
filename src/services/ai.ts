import { supabase } from "../lib/supabase";
import type { Ingredient } from "../lib/kitchen";

export type Provider = "groq" | "gemini";
export type KeyStatus = { mine: boolean; hint: string | null; shared: boolean };
export type AiStatus = Record<Provider, KeyStatus>;

export class AiNeedsKey extends Error {}

export async function aiStatus(): Promise<AiStatus> {
  const { data } = await supabase.rpc("ai_status");
  const empty = { mine: false, hint: null, shared: false };
  const d = (data ?? {}) as Partial<AiStatus>;
  return { groq: d.groq ?? empty, gemini: d.gemini ?? empty };
}
export const hasAi = (s: AiStatus | null) => !!s && (s.groq.mine || s.groq.shared || s.gemini.mine || s.gemini.shared);

export async function saveAiKey(p: Provider, key: string) {
  const { error } = await supabase.rpc("save_ai_key", { p_provider: p, p_key: key.trim() });
  if (error) throw new Error(error.message);
}
export async function deleteAiKey(p: Provider) {
  const { error } = await supabase.rpc("delete_ai_key", { p_provider: p });
  if (error) throw new Error(error.message);
}

const MESSAGES: Record<string, string> = {
  sem_chave: "Configure a chave do Groq ou do Gemini para usar a IA.",
  sem_gemini: "Ler fotos precisa da chave do Gemini.",
  chave_groq: "A chave do Groq foi recusada pelo Groq. Cole uma chave nova.",
  chave_gemini: "A chave do Gemini foi recusada pelo Google. Cole uma chave nova.",
};

/** Chama a função `ai`. Erros de chave viram AiNeedsKey (a tela abre a configuração). */
export async function ai<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ai", { body: { action, ...body } });
  let err: { error?: string; message?: string } | null = (data as { error?: string } | null)?.error ? (data as { error?: string; message?: string }) : null;
  if (error) {
    try {
      err = ((await (error as { context?: Response }).context?.json()) as { error?: string; message?: string }) ?? err;
    } catch {
      /* sem corpo */
    }
    err = err ?? { error: "falhou" };
  }
  if (err?.error) {
    const code = err.error;
    if (code in MESSAGES) throw new AiNeedsKey(MESSAGES[code]!);
    if (code === "falhou") {
      const m = err.message ?? "";
      throw new Error(/429/.test(m) ? "A cota gratuita da IA acabou por agora. Tente de novo em alguns minutos." : "A IA não respondeu agora. Tente de novo.");
    }
    throw new Error(code);
  }
  return data as T;
}

// ---------- Áudio ----------
const toB64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(",") + 1));
    r.onerror = () => reject(new Error("Não consegui ler o áudio."));
    r.readAsDataURL(blob);
  });

export const canRecord = () => typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;

/** Grava até chamar stop() (ou 3 minutos). Resolve com o áudio em base64. */
export async function startRecording(): Promise<{ stop: () => void; done: Promise<{ audio: string; mime: string }> }> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new Error("Sem permissão para o microfone. Libere nas configurações do navegador.");
  }
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<{ audio: string; mime: string }>((resolve, reject) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
      if (blob.size < 1500) return reject(new Error("Não ouvi nada. Segure o botão e fale."));
      void toB64(blob).then((audio) => resolve({ audio, mime: blob.type }), reject);
    };
  });
  rec.start();
  const timer = setTimeout(() => rec.state !== "inactive" && rec.stop(), 180000);
  return {
    stop: () => {
      clearTimeout(timer);
      if (rec.state !== "inactive") rec.stop();
    },
    done,
  };
}

export async function transcribe(a: { audio: string; mime: string }): Promise<string> {
  const r = await ai<{ text: string }>("transcribe", a);
  return r.text;
}

export async function itemsFromText(text: string): Promise<Ingredient[]> {
  const r = await ai<{ items: Ingredient[] }>("items", { text });
  return r.items;
}

/** Reduz a foto para no máximo 1600 px em JPEG. */
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

export async function itemsFromPhoto(file: File): Promise<Ingredient[]> {
  const img = await shrink(file);
  const r = await ai<{ items: Ingredient[] }>("photo_list", { image: img.data, mime: img.mime });
  return r.items;
}

// ---------- Assistente ----------
export type TxAction = {
  kind: "transaction";
  type: "despesa" | "receita";
  amount_cents: number;
  description: string;
  category: string | null;
  payment: "pix" | "dinheiro" | "debito" | "credito";
  account: string | null;
  card: string | null;
  installments: number | null;
  scope: "pessoal" | "casa" | "empresa";
  date: string;
};
export type TaskAction = { kind: "task"; title: string; date: string | null; time: string | null; priority: "baixa" | "normal" | "alta" };
export type ShopAction = { kind: "shopping"; items: Ingredient[] };
export type AiAction = TxAction | TaskAction | ShopAction;
export type ChatReply = { reply: string; actions: AiAction[]; provider: Provider };

export function chat(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  return ai<ChatReply>("chat", { messages });
}

export async function taskFromText(text: string): Promise<TaskAction | null> {
  const r = await ai<{ task: TaskAction | null }>("task", { text });
  return r.task;
}

// ---------- Lançamento rápido por voz ----------
export type CaptureResult = { text: string; actions: Array<TxAction | TaskAction>; missing: string[]; provider: Provider };

/** Áudio (ou texto) -> lançamentos e tarefas já separados pela IA. */
export function capture(input: { audio: string; mime: string } | { text: string }) {
  return ai<CaptureResult>("capture", input);
}
