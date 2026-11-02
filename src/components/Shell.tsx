import { Outlet } from "react-router";
import { BottomNav } from "./BottomNav";
import { HeaderTools } from "./HeaderTools";
import { ModeToggle } from "./ModeToggle";
import { Sidebar } from "./Sidebar";
import { Toast } from "./Toast";
import { TransactionDetailSheet } from "./TransactionDetailSheet";
import { TransactionSheet } from "./TransactionSheet";
import { useAuth } from "../store/auth";
import { usePrefs } from "../store/prefs";

export function Shell() {
  const name = useAuth((s) => s.profile?.name ?? "");
  const hidden = usePrefs((s) => s.hidden);
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
      <TransactionDetailSheet />
      <Toast />
    </div>
  );
}
