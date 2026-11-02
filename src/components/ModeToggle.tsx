import type { Mode } from "../types";
import { usePrefs } from "../store/prefs";

const options: Array<{ value: Mode; label: string }> = [
  { value: "pessoal", label: "Pessoal" },
  { value: "casa", label: "Casa" },
];

export function ModeToggle() {
  const mode = usePrefs((s) => s.mode);
  const setMode = usePrefs((s) => s.setMode);
  return (
    <div role="tablist" aria-label="Modo" className="inline-flex rounded-xl border border-line bg-card p-1">
      {options.map((o) => {
        const active = o.value === mode;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            id={`modo-${o.value}`}
            aria-selected={active}
            onClick={() => setMode(o.value)}
            className={`min-h-11 min-w-24 rounded-lg px-4 text-sm font-medium ${
              active ? "bg-brand text-white" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
