import type { ReactNode } from "react";

/** Fundo em verde-petróleo com manchas de luz, onde os painéis de vidro ficam por cima. */
export function GlassStage({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  return (
    <section aria-label={label} className={`glass-stage p-3 sm:p-4 lg:p-5 ${className}`}>
      <span aria-hidden="true" className="blob blob-a" />
      <span aria-hidden="true" className="blob blob-b" />
      <span aria-hidden="true" className="blob blob-c" />
      {children}
    </section>
  );
}
