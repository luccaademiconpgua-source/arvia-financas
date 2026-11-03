import { describe, expect, it } from "vitest";
import { fuelFromNote } from "./fuel";

describe("nota de posto", () => {
  it("lê a nota real do Posto Mahle (etanol)", () => {
    expect(fuelFromNote([{ description: "COMB ETANOL Bico 14", quantity: 22.272, unit: "L", totalCents: 10000 }])).toEqual({
      fuel: "etanol", liters: 22.272, pumpCents: 10000, pricePerLiterCents: 449, label: "etanol",
    });
  });
  it("gasolina com item de loja junto", () => {
    const r = fuelFromNote([
      { description: "GASOLINA COMUM", quantity: 30, unit: "LT", totalCents: 18900 },
      { description: "AGUA MINERAL 500ML", quantity: 1, unit: "UN", totalCents: 400 },
    ]);
    expect(r).toMatchObject({ fuel: "gasolina", liters: 30, pumpCents: 18900, pricePerLiterCents: 630 });
  });
  it("mercado não é posto", () => {
    expect(fuelFromNote([{ description: "ARROZ TIO JOAO 5KG", quantity: 1, unit: "UN", totalCents: 2790 }])).toBeNull();
    expect(fuelFromNote([{ description: "ARLA 32", quantity: 20, unit: "L", totalCents: 6000 }])).toBeNull();
  });
});
