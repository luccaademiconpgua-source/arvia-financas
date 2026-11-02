import { useUI } from "../store/ui";

export function Toast() {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-card"
      style={{ bottom: "calc(96px + env(safe-area-inset-bottom))" }}
    >
      {toast}
    </div>
  );
}
