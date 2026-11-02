import { useEffect, useMemo } from "react";
import { useModeData } from "./useModeData";
import { accountBalanceCents } from "../lib/calc";
import { todayIso } from "../lib/clock";
import { netWorth } from "../lib/networth";
import { saveSnapshot, useNetWorthData } from "../services/networth";

/** Guarda a foto do patrimônio do mês sempre que o app abre ou os dados mudam (para o gráfico e o resumo do mês). */
export function useNetWorthSnapshot() {
  const { ready, mode, accounts, cards, debts, transactions } = useModeData();
  const nw = useNetWorthData(mode);
  const month = todayIso().slice(0, 7);
  const result = useMemo(
    () => netWorth({ accounts, balanceOf: (a) => accountBalanceCents(a, transactions), cards, debts, assets: nw.assets }),
    [accounts, transactions, cards, debts, nw.assets],
  );
  const saved = nw.snapshots.find((s) => s.month === month);
  const hasData = accounts.length + cards.length + debts.length + nw.assets.length > 0;
  useEffect(() => {
    if (!ready || !nw.ready || !hasData) return;
    if (saved && saved.assetsCents === result.assetsCents && saved.liabilitiesCents === result.liabilitiesCents) return;
    void saveSnapshot(mode, month, result.assetsCents, result.liabilitiesCents);
  }, [ready, nw.ready, hasData, saved, result.assetsCents, result.liabilitiesCents, mode, month]);
}
