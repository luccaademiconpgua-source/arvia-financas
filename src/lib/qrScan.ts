// Leitura de QR Code da NFC-e.
// QR de nota fiscal é denso (URL longa) e vem pequeno em papel térmico, então:
//  - pedimos a câmera em alta resolução e com foco contínuo;
//  - usamos o BarcodeDetector nativo (Chrome/Android, Safari recente) quando existe;
//  - caímos no ZXing (com TRY_HARDER) quando não existe.
import { BrowserQRCodeReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

type Detector = { detect: (src: CanvasImageSource | ImageBitmap) => Promise<Array<{ rawValue: string }>> };
type DetectorCtor = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

let wasmReady = false;

/** Detector nativo do navegador ou, se não houver, o ZXing-C++ em WebAssembly (bem mais forte que o ZXing em JS). */
async function nativeDetector(): Promise<Detector | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (Ctor) {
    try {
      const formats = (await Ctor.getSupportedFormats?.()) ?? ["qr_code"];
      if (formats.includes("qr_code")) return new Ctor({ formats: ["qr_code"] });
    } catch {
      /* segue para o WebAssembly */
    }
  }
  try {
    const mod = await import("barcode-detector/ponyfill");
    if (!wasmReady) {
      const { default: wasmUrl } = await import("zxing-wasm/reader/zxing_reader.wasm?url");
      mod.prepareZXingModule({
        overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
      });
      wasmReady = true;
    }
    return new mod.BarcodeDetector({ formats: ["qr_code"] }) as unknown as Detector;
  } catch {
    return null;
  }
}

function zxingReader() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserQRCodeReader(hints);
}

export type ScanSession = { stop: () => void; torch: ((on: boolean) => Promise<boolean>) | null };

/** Abre a câmera traseira no <video> e chama onText uma vez quando achar um QR. */
export async function startCameraScan(video: HTMLVideoElement, onText: (text: string) => void): Promise<ScanSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
  const track = stream.getVideoTracks()[0];
  // foco contínuo quando o aparelho permite
  try {
    const caps = (track?.getCapabilities?.() ?? {}) as { focusMode?: string[] };
    if (caps.focusMode?.includes("continuous")) {
      await track!.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
    }
  } catch {
    /* sem controle de foco */
  }
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play().catch(() => undefined);

  let stopped = false;
  let found = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
  const finish = (text: string) => {
    if (found || stopped) return;
    found = true;
    stop();
    // fora do laço de leitura: um erro na consulta não pode ser engolido aqui
    setTimeout(() => onText(text), 0);
  };

  const det = await nativeDetector();
  const reader = det ? null : zxingReader();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let frame = 0;

  // lê quadro a quadro; alterna entre o quadro inteiro e o centro ampliado
  const loop = async () => {
    if (stopped || found) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      try {
        if (det) {
          const codes = await det.detect(video);
          const v = codes.find((c) => c.rawValue)?.rawValue;
          if (v) return finish(v);
        } else if (reader && ctx) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const crop = frame % 2 === 0 ? 0.65 : 1;
          const side = Math.min(vw, vh) * crop;
          const sx = (vw - side) / 2;
          const sy = (vh - side) / 2;
          const out = Math.min(1100, Math.round(side));
          canvas.width = out;
          canvas.height = out;
          ctx.drawImage(video, sx, sy, side, side, 0, 0, out, out);
          try {
            return finish(reader.decodeFromCanvas(canvas).getText());
          } catch {
            /* sem QR neste quadro */
          }
        }
      } catch {
        /* quadro ruim, tenta de novo */
      }
    }
    frame++;
    timer = setTimeout(() => void loop(), det ? 120 : 180);
  };
  void loop();

  const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
  const session: ScanSession = {
    stop,
    torch: caps.torch
      ? async (on: boolean) => {
          try {
            await track!.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
            return true;
          } catch {
            return false;
          }
        }
      : null,
  };
  return session;
}

/** Lê o QR de uma foto. Reduz fotos grandes (12 MP) antes, e tenta também recortes do centro. */
export async function scanImageFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const det = await nativeDetector();
  if (det) {
    try {
      const codes = await det.detect(bitmap);
      const v = codes.find((c) => c.rawValue)?.rawValue;
      if (v) return v;
    } catch {
      /* segue para o ZXing */
    }
  }
  const reader = zxingReader();
  const attempts: Array<{ scale: number; crop: number }> = [
    { scale: 1600, crop: 1 },
    { scale: 2400, crop: 1 },
    { scale: 1600, crop: 0.6 },
  ];
  for (const a of attempts) {
    const sw = bitmap.width * a.crop;
    const sh = bitmap.height * a.crop;
    const sx = (bitmap.width - sw) / 2;
    const sy = (bitmap.height - sh) / 2;
    const k = Math.min(1, a.scale / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * k);
    canvas.height = Math.round(sh * k);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    try {
      return reader.decodeFromCanvas(canvas).getText();
    } catch {
      /* tenta a próxima */
    }
  }
  return null;
}
