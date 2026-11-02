import { useEffect } from "react";
import { useData } from "../store/data";
import { usePrefs } from "../store/prefs";
import { useRefresh } from "../store/refresh";
import type { ModeData } from "../services/data";

const empty: ModeData = { accounts: [], cards: [], categories: [], transactions: [], goals: [], debts: [] };

/** Dados do escopo ativo (Pessoal ou Casa), guardados num cache único. Recarrega após qualquer ação e ao voltar para a aba. */
export function useModeData() {
  const mode = usePrefs((s) => s.mode);
  const version = useRefresh((s) => s.version);
  const bump = useRefresh((s) => s.bump);
  const entry = useData((s) => s.entries[mode]);
  const ensure = useData((s) => s.ensure);

  useEffect(() => {
    ensure(mode, version);
  }, [ensure, mode, version]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [bump]);

  const data = entry.data ?? empty;
  return { mode, ready: entry.data !== null, error: entry.error, ...data };
}
