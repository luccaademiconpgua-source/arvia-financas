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

