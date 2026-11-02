import { describe, expect, it } from "vitest";
import { balances, settleUp, type Member } from "./settle";

const m = (id: string, paid: number, pct = 50, sent = 0, received = 0): Member => ({ id, name: id, sharePct: pct, paidCents: paid, qty: 1, sentCents: sent, receivedCents: received });

describe("acerto da casa", () => {
  it("meio a meio: quem pagou menos passa a diferença", () => {
    const b = balances([m("lucca", 80000), m("nath", 10000)], 90000);
    expect(b.map((x) => x.netCents)).toEqual([35000, -35000]);
    expect(settleUp(b)).toEqual([{ from: "nath", to: "lucca", cents: 35000 }]);
  });
  it("divisão 60/40", () => {
    const b = balances([m("lucca", 80000, 60), m("nath", 10000, 40)], 90000);
    expect(settleUp(b)).toEqual([{ from: "nath", to: "lucca", cents: 26000 }]);
  });
  it("acerto registrado zera o mês", () => {
    const b = balances([m("lucca", 80000, 50, 0, 35000), m("nath", 10000, 50, 35000, 0)], 90000);
    expect(settleUp(b)).toEqual([]);
  });
});
