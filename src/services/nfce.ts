import { z } from "zod";

const schema = z.object({
  accessKey: z.string().optional(),
  storeName: z.string(),
  cnpj: z.string().optional(),
  issuedAt: z.string(),
  totalCents: z.number().int().positive(),
  payment: z.enum(["pix", "dinheiro", "debito", "credito", "desconhecido"]),
  items: z.array(z.object({ description: z.string(), quantity: z.number(), unit: z.string(), totalCents: z.number().int() })).min(1),
  state: z.string().optional(),
});
export type NfceResult = z.infer<typeof schema>;

export class NfceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function fetchNfce(url: string): Promise<NfceResult> {
  let res: Response;
  try {
    res = await fetch("/api/nfce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new NfceError("A SEFAZ não respondeu. Tente de novo.", 502);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Não consegui ler esta nota.";
    throw new NfceError(msg, res.status);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new NfceError("Não consegui ler os itens desta nota. O estado pode não ser suportado.", 422);
  return parsed.data;
}
