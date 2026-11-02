import { create } from "zustand";
import { fetchModeData, type ModeData } from "../services/data";
import type { Mode } from "../types";

type Entry = { data: ModeData | null; error: string; loadedVersion: number };

type DataState = {
  entries: Record<Mode, Entry>;
  /** Carrega o escopo se ainda não tem dados desta versão. Chamadas simultâneas dividem a mesma busca. */
  ensure: (mode: Mode, version: number) => void;
  clear: () => void;
};

const blank = (): Record<Mode, Entry> => ({
  pessoal: { data: null, error: "", loadedVersion: -1 },
  casa: { data: null, error: "", loadedVersion: -1 },
});

const inflight = new Map<string, Promise<void>>();

export const useData = create<DataState>((set, get) => ({
  entries: blank(),
  ensure: (mode, version) => {
    if (get().entries[mode].loadedVersion >= version) return;
    const key = `${mode}:${version}`;
    if (inflight.has(key)) return;
    const p = fetchModeData(mode)
      .then(
        (data) => set((s) => ({ entries: { ...s.entries, [mode]: { data, error: "", loadedVersion: version } } })),
        (e: unknown) =>
          set((s) => ({
            entries: { ...s.entries, [mode]: { data: s.entries[mode].data, error: e instanceof Error ? e.message : "Erro ao carregar.", loadedVersion: version } },
          })),
      )
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  },
  clear: () => set({ entries: blank() }),
}));
