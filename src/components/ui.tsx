import type { ReactNode } from "react";

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border border-line bg-card p-4 shadow-card ${className}`}>
      {title && <h2 className="card-title mb-3">{title}</h2>}
      {children}
    </section>
  );
}

export function Pill({ tone, children }: { tone: "ok" | "warn" | "danger" | "neutral"; children: ReactNode }) {
  const styles = {
    ok: "bg-income-bg text-income",
    warn: "bg-warn-bg text-warn",
    danger: "bg-expense-bg text-danger",
    neutral: "bg-page text-muted",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${styles}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-sm text-muted">{children}</p>;
}
