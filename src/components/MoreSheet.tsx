import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { moreItems } from "./nav";

export function MoreSheet({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

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
        className="absolute inset-x-0 bottom-0 rounded-t-card bg-card p-4 shadow-card"
        style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="card-title">Mais</p>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar" className="flex size-11 items-center justify-center rounded-lg text-muted hover:text-ink">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav className="flex flex-col">
          {moreItems.map((item) => (
            <Link key={item.to} to={item.to} onClick={onClose} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-base hover:bg-page">
              <item.icon size={20} aria-hidden="true" className="text-brand" />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
