// Acerto da casa: cada um deveria pagar a sua parte do total; quem pagou mais recebe a diferença.

export type Member = { id: string; name: string; sharePct: number; paidCents: number; qty: number; sentCents: number; receivedCents: number };
export type Balance = Member & { fairCents: number; netCents: number };
export type Transfer = { from: string; to: string; cents: number };

/** net > 0: pagou além da parte (tem a receber). Acertos já feitos contam como pagamento. */
export function balances(members: readonly Member[], totalCents: number): Balance[] {
  return members.map((m) => {
    const fair = Math.round((totalCents * m.sharePct) / 100);
    return { ...m, fairCents: fair, netCents: m.paidCents + m.sentCents - m.receivedCents - fair };
  });
}

/** Menor número de transferências para zerar: quem deve paga para quem tem a receber. Ignora diferenças de até 1 real. */
export function settleUp(bal: readonly Balance[], toleranceCents = 100): Transfer[] {
  const debt = bal.filter((b) => b.netCents < -toleranceCents).map((b) => ({ id: b.id, left: -b.netCents })).sort((a, b) => b.left - a.left);
  const cred = bal.filter((b) => b.netCents > toleranceCents).map((b) => ({ id: b.id, left: b.netCents })).sort((a, b) => b.left - a.left);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debt.length && j < cred.length) {
    const d = debt[i]!;
    const c = cred[j]!;
    const cents = Math.min(d.left, c.left);
    if (cents > 0) out.push({ from: d.id, to: c.id, cents });
    d.left -= cents;
    c.left -= cents;
    if (d.left <= toleranceCents) i++;
    if (c.left <= toleranceCents) j++;
  }
  return out;
}
