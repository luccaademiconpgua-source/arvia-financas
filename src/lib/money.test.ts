import { describe, expect, it } from "vitest";
import { formatBrl, parseBrlToCents } from "./money";

describe("parseBrlToCents", () => {
  it("lê 0,01", () => expect(parseBrlToCents("0,01")).toBe(1));
  it("lê 10", () => expect(parseBrlToCents("10")).toBe(1000));
  it("lê 1.234,56", () => expect(parseBrlToCents("1.234,56")).toBe(123456));
  it("lê R$ 42,71", () => expect(parseBrlToCents("R$ 42,71")).toBe(4271));
  it("lê o texto gerado pelo Intl, com espaço não separável", () => {
    expect(parseBrlToCents(formatBrl(1492966))).toBe(1492966);
  });
  it("completa uma casa decimal", () => expect(parseBrlToCents("5,5")).toBe(550));
  it("recusa texto inválido", () => {
    expect(parseBrlToCents("")).toBeNull();
    expect(parseBrlToCents("abc")).toBeNull();
    expect(parseBrlToCents("10.5")).toBeNull();
    expect(parseBrlToCents("1,234")).toBeNull();
  });
});

describe("formatBrl", () => {
  it("formata em reais", () => {
    expect(formatBrl(1492966).replace(/\s/g, " ")).toBe("R$ 14.929,66");
  });
});
