// Nota de posto: acha o combustível nos itens da NFC-e (litros, tipo e preço por litro).
import type { NfceItem } from "../types";
import type { Fuel } from "./vehicle";

export type FuelFromNote = { fuel: Fuel | null; liters: number; pumpCents: number; pricePerLiterCents: number; label: string };

const FUEL_RE = /\b(comb(ust[ií]vel)?|gasolina|etanol|[aá]lcool|alcool|diesel|s-?10|s-?500|gnv)\b/i;

function fuelType(desc: string): Fuel | null {
  const d = desc.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/etanol|alcool/.test(d)) return "etanol";
  if (/diesel|s-?10\b|s-?500/.test(d)) return "diesel";
  if (/gnv/.test(d)) return "gnv";
  if (/gasolina|gas\.? ?c|gc\b/.test(d)) return "gasolina";
  return null;
}

/** Soma os itens de combustível (vendidos em litros). Arla, óleo e loja de conveniência ficam de fora. */
export function fuelFromNote(items: readonly NfceItem[]): FuelFromNote | null {
  const fuelItems = items.filter((i) => FUEL_RE.test(i.description) && !/arla|oleo|óleo|lubrif|aditivo/i.test(i.description) && /^l(t|itros?)?$/i.test(i.unit.trim()) && i.quantity > 0);
  if (fuelItems.length === 0) return null;
  const liters = Math.round(fuelItems.reduce((s, i) => s + i.quantity, 0) * 1000) / 1000;
  const pump = fuelItems.reduce((s, i) => s + i.totalCents, 0);
  const types = [...new Set(fuelItems.map((i) => fuelType(i.description)))];
  const fuel = types.length === 1 ? types[0]! : null;
  const label = fuel === "etanol" ? "etanol" : fuel === "diesel" ? "diesel" : fuel === "gnv" ? "GNV" : fuel === "gasolina" ? "gasolina" : "combustível";
  return { fuel, liters, pumpCents: pump, pricePerLiterCents: Math.round(pump / liters), label };
}
