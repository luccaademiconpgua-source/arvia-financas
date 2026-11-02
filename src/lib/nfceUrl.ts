const ONLY_KEY = /^\d{44}$/;

export function extractAccessKey(input: string): string | null {
  const compact = input.replace(/\s+/g, "");
  if (ONLY_KEY.test(compact)) return compact;
  const fromP = /[?&]p=(\d{44})/.exec(input);
  if (fromP?.[1]) return fromP[1];
  const loose = /(?<!\d)(\d{44})(?!\d)/.exec(input.replace(/[\s.]/g, ""));
  return loose?.[1] ?? null;
}

/** Chave de 44 dígitos sozinha: não dá para consultar, falta a URL. */
export function isAccessKeyOnly(input: string): boolean {
  return ONLY_KEY.test(input.replace(/\s+/g, ""));
}

export function isNfceUrl(input: string): boolean {
  const s = input.trim();
  if (!/^https?:\/\//i.test(s)) return false;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return false;
  }
  const hay = `${url.hostname}${url.pathname}`.toLowerCase();
  if (/nfce|fazenda\.|sefaz|nfe/.test(hay)) return true;
  return /[?&]p=\d{44}/.test(s);
}
