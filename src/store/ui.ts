import { create } from "zustand";

export type TxType = "receita" | "despesa" | "reserva";
export type TxSheetState = { type?: TxType; goalId?: string } | null;

type UI = {
  txSheet: TxSheetState;
  detailId: string | null;
  toast: string | null;
  openTx: (s?: { type?: TxType; goalId?: string }) => void;
  closeTx: () => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  showToast: (msg: string) => void;
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUI = create<UI>()((set) => ({
  txSheet: null,
  detailId: null,
  toast: null,
  openTx: (s) => set({ txSheet: s ?? {} }),
  closeTx: () => set({ txSheet: null }),
  openDetail: (id) => set({ detailId: id }),
  closeDetail: () => set({ detailId: null }),
  showToast: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 2500);
  },
}));
