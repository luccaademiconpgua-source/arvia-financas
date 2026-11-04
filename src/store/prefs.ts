import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Mode } from "../types";

export type Theme = "escuro" | "claro" | "sistema";

type Prefs = {
  /** aparência do app */
  theme: Theme;
  setTheme: (theme: Theme) => void;
  mode: Mode;
  /** modo em que o app abre */
  startMode: Mode;
  /** esconde os valores na tela */
  hidden: boolean;
  setMode: (mode: Mode) => void;
  setStartMode: (mode: Mode) => void;
  setHidden: (on: boolean) => void;
};

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      mode: "pessoal",
      startMode: "pessoal",
      hidden: false,
      theme: "escuro",
      setTheme: (theme) => set({ theme }),
      setMode: (mode) => set({ mode }),
      setStartMode: (startMode) => set({ startMode }),
      setHidden: (hidden) => set({ hidden }),
    }),
    { name: "arvia-prefs" },
  ),
);
