import { describe, expect, it } from "vitest";
import { reconcileView } from "./data";

const row = (o: Record<string, unknown>) => ({ type: "despesa", payment: "debito", affects_balance: false, date: "2026-10-27", amount_cents: 3380, ...o });

describe("conciliação na lista", () => {
  it("esconde o lançamento do banco e põe o selo no da nota", () => {
    const rows = [
      row({ id: "b", description: "DÉBITO DE CARTÃO", source: "open_finance", match_id: "n", account_id: "c6" }),
      row({ id: "n", description: "Karamellar", source: "nfce", date: "2026-10-26", account_id: "c6" }),
      row({ id: "x", description: "Mercado", source: "manual" }),
    ];
    const txs = reconcileView(rows, "pessoal");
    expect(txs.map((t) => t.id)).toEqual(["n", "x"]);
    expect(txs[0]!.bankMatch).toMatchObject({ id: "b", description: "DÉBITO DE CARTÃO", source: "open_finance", accountId: "c6" });
  });
  it("mantém o do banco se o par não está visível", () => {
    const txs = reconcileView([row({ id: "b", description: "X", source: "open_finance", match_id: "outro" })], "pessoal");
    expect(txs.map((t) => t.id)).toEqual(["b"]);
  });
});
