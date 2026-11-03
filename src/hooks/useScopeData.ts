import { useEffect } from "react";
import { useData } from "../store/data";
import { useRefresh } from "../store/refresh";
import type { ModeData } from "../services/data";
import type { Mode } from "../types";

const empty: ModeData = { accounts: [], cards: [], categories: [], transactions: [], goals: [], debts: [] };

/** Dados de um escopo específico (Pessoal ou Casa), independente do modo escolhido no topo. */
export function useScopeData(mode: Mode, enabled = true) {
  const version = useRefresh((s) => s.version);
  const entry = useData((s) => s.entries[mode]);
  const ensure = useData((s) => s.ensure);
  useEffect(() => {
    if (enabled) ensure(mode, version);
  }, [ensure, mode, version, enabled]);
  return { ready: entry.data !== null, ...(entry.data ?? empty) };
}
