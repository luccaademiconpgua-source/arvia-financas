import { create } from "zustand";

/** Cada ação que muda dados chama bump(); os hooks de dados recarregam. */
export const useRefresh = create<{ version: number; bump: () => void }>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
