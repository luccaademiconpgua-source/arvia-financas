const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata centavos em BRL. A divisão por 100 só acontece na exibição. */
export function formatBrl(cents: number): string {
  return brl.format(cents / 100);
}

/**
 * Converte texto em reais para centavos, sem float.
 * "1.234,56" -> 123456, "R$ 42,71" -> 4271, "10" -> 1000. Inválido -> null.
 */
export function parseBrlToCents(input: string): number | null {
  const cleaned = input.replace(/R\$/gi, "").replace(/\s/g, "");
  const m = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const intPart = Number((m[2] ?? "").replace(/\./g, ""));
  const frac = Number((m[3] ?? "").padEnd(2, "0"));
  const cents = intPart * 100 + frac;
  if (!Number.isSafeInteger(cents)) return null;
  return sign * cents;
}
