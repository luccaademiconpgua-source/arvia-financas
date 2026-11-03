import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { casaRoutes } from "./nav";
import { BottomNav } from "./BottomNav";
import { HeaderTools } from "./HeaderTools";
import { ModeToggle } from "./ModeToggle";
import { Sidebar } from "./Sidebar";
import { Toast } from "./Toast";
import { TransactionDetailSheet } from "./TransactionDetailSheet";
import { TransactionSheet } from "./TransactionSheet";
import { QuickCapture } from "./ai/QuickCapture";
import { useAuth } from "../store/auth";
import { usePrefs } from "../store/prefs";
import { useNetWorthSnapshot } from "../hooks/useNetWorthSnapshot";

export function Shell() {
  const name = useAuth((s) => s.profile?.name ?? "");
  const hidden = usePrefs((s) => s.hidden);
  useNetWorthSnapshot();
  useCasaRoutes();
  return (
    <div className={`min-h-dvh bg-page text-ink lg:pl-[260px] ${hidden ? "hide-values" : ""}`}>
      <Sidebar />
      <div className="mx-auto max-w-[1200px] px-4 lg:px-8">
        <header
          className="sticky top-0 z-20 flex flex-col gap-3 bg-page/95 pb-3 backdrop-blur lg:flex-row lg:items-center lg:justify-between lg:pt-6"
          style={{ paddingTop: "calc(12px + env(safe-area-inset-top))" }}
        >
          <ModeToggle />
          <div className="flex items-center justify-between gap-3 lg:gap-6">
            <p className="font-display text-xl font-semibold">Olá, {name}</p>
            <HeaderTools />
          </div>
        </header>
        <main className="flex flex-col gap-4 pb-32 lg:pb-8">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <TransactionSheet />
      <QuickCapture />
      <TransactionDetailSheet />
      <Toast />
    </div>
  );
}

/** Compras, Veículos e Acerto são da Casa: abrir uma delas troca para Casa; trocar para Pessoal sai delas. */
function useCasaRoutes() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mode = usePrefs((s) => s.mode);
  const setMode = usePrefs((s) => s.setMode);
  const hasHouse = useAuth((s) => !!s.household);
  const prev = useRef({ pathname, mode });
  useEffect(() => {
    const p = prev.current;
    prev.current = { pathname, mode };
    if (!hasHouse || !casaRoutes.some((r) => pathname.startsWith(r))) return;
    if (mode === "casa") return;
    if (p.pathname !== pathname || p.mode === mode) setMode("casa");
    else navigate("/", { replace: true });
  }, [pathname, mode, hasHouse, setMode, navigate]);
}
