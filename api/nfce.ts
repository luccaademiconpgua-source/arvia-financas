import { resolveNfce } from "../server/nfce.js";

type Req = { method?: string; body?: unknown };
type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (k: string, v: string) => void };

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "URL inválida." });
    }
  }
  const url = typeof body === "object" && body !== null && "url" in body && typeof body.url === "string" ? body.url : "";
  if (url.length > 2048) return res.status(400).json({ error: "URL inválida." });
  const r = await resolveNfce(url);
  res.status(r.status).json(r.body);
}
