import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { groupsFor } from "./nav";
import { usePrefs } from "../store/prefs";

export function MoreSheet({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const mode = usePrefs((s) => s.mode);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button type="button" aria-label="Fechar" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mais opções"
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-card bg-card p-4 shadow-card"
        style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="card-title">Mais</p>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar" className="flex size-11 items-center justify-center rounded-lg text-muted hover:text-ink">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav className="-mx-1 flex flex-col gap-3 overflow-y-auto overscroll-contain px-1">
          {groupsFor(mode, ["/", "/transacoes", "/escanear", "/assistente"]).map((g) => (
            <section key={g.title}>
              <p className="mb-1 px-2 text-xs font-medium text-muted">{g.title === "Menu" ? "Seu dinheiro" : g.title}</p>
              <div className="grid grid-cols-2 gap-1">
                {g.items.map((item) => (
                  <Link key={item.to} to={item.to} onClick={onClose} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-page">
                    <item.icon size={18} aria-hidden="true" className="shrink-0 text-brand" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </section>
          ))}
          {mode === "pessoal" && <p className="px-2 text-xs text-muted">Compras, veículos e o acerto da casa ficam no modo Casa, no topo da tela.</p>}
        </nav>
      </div>
    </div>
  );
}
