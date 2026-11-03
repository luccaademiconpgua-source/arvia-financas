import { useState } from "react";
import { NavLink } from "react-router";
import { ArrowLeftRight, LayoutDashboard, Menu, ScanLine, Sparkles } from "lucide-react";
import { MoreSheet } from "./MoreSheet";

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 flex-col items-center justify-center gap-1 text-xs ${isActive ? "font-medium text-brand" : "text-muted"}`;

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-2 pt-2 pb-2">
          <NavLink to="/" end className={itemClass}>
            <LayoutDashboard size={20} aria-hidden="true" />
            Início
          </NavLink>
          <NavLink to="/transacoes" className={itemClass}>
            <ArrowLeftRight size={20} aria-hidden="true" />
            Transações
          </NavLink>
          <NavLink to="/escanear" aria-label="Escanear nota" className="flex flex-col items-center justify-center">
            <span className="-mt-3 flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-card hover:bg-brand-hover">
              <ScanLine size={24} aria-hidden="true" />
            </span>
          </NavLink>
          <NavLink to="/assistente" className={itemClass}>
            <Sparkles size={20} aria-hidden="true" />
            Assistente
          </NavLink>
          <button type="button" onClick={() => setMoreOpen(true)} className={itemClass({ isActive: false })}>
            <Menu size={20} aria-hidden="true" />
            Mais
          </button>
        </div>
      </nav>
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
    </>
  );
}
