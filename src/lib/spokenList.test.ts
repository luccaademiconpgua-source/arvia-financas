import { describe, expect, it } from "vitest";
import { parseSpoken } from "./spokenList";

describe("lista ditada", () => {
  it("separa itens e entende números e unidades falados", () => {
    expect(parseSpoken("Dois quilos de arroz, leite e seis ovos")).toEqual([
      { name: "arroz", qty: 2, unit: "kg" },
      { name: "leite", qty: null, unit: null },
      { name: "ovos", qty: 6, unit: null },
    ]);
  });
  it("aceita 'mais' e frases como 'preciso de'", () => {
    expect(parseSpoken("Preciso de uma caixa de leite mais meio quilo de café e três dúzias de ovos")).toEqual([
      { name: "leite", qty: 1, unit: "cx" },
      { name: "café", qty: 0.5, unit: "kg" },
      { name: "ovos", qty: 3, unit: "dz" },
    ]);
  });
});
