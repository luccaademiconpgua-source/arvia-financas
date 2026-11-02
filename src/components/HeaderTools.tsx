import { useState } from "react";
import { useNavigate } from "react-router";
import { Bell, Eye, EyeOff, Search } from "lucide-react";
import { usePrefs } from "../store/prefs";
import { useAlerts } from "../services/push";

export function HeaderTools() {
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [bell, setBell] = useState(false);
  const navigate = useNavigate();
  const hidden = usePrefs((s) => s.hidden);
  const setHidden = usePrefs((s) => s.setHidden);
  const alerts = useAlerts();
  const urgent = alerts.some((a) => a.severity >= 2);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    navigate(`/transacoes?q=${encodeURIComponent(q.trim())}`);
    setSearching(false);
  }
  return (
    <div className="relative flex items-center gap-1">
      {searching ? (
        <form onSubmit={submit} role="search" className="flex items-center gap-1">
          <input autoFocus type="search" aria-label="Buscar lançamentos" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setSearching(false)} placeholder="Buscar" className="min-h-11 w-40 rounded-lg border border-line bg-card px-3 text-base" />
        </form>
      ) : (
        <button type="button" aria-label="Buscar" onClick={() => setSearching(true)} className="flex size-11 items-center justify-center rounded-lg text-muted hover:text-ink">
          <Search size={20} aria-hidden="true" />
        </button>
      )}
      <button type="button" aria-label={hidden ? "Mostrar valores" : "Ocultar valores"} aria-pressed={hidden} onClick={() => setHidden(!hidden)} className="flex size-11 items-center justify-center rounded-lg text-muted hover:text-ink">
        {hidden ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
      <button type="button" aria-label={alerts.length ? `Avisos (${alerts.length})` : "Avisos"} aria-expanded={bell} onClick={() => setBell((v) => !v)} className="relative flex size-11 items-center justify-center rounded-lg text-muted hover:text-ink">
        <Bell size={20} aria-hidden="true" />
        {alerts.length > 0 && <span className={`absolute top-2.5 right-2.5 size-2 rounded-full ${urgent ? "bg-danger" : "bg-amber"}`} aria-hidden="true" />}
      </button>
      {bell && (
        <div role="region" aria-label="Avisos" className="absolute top-12 right-0 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-card p-2 text-sm shadow-card">
          {alerts.length === 0 ? (
            <p className="p-2 text-muted">Nada pedindo atenção agora.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.key}>
                  <button type="button" onClick={() => { setBell(false); navigate(a.url); }} className="flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-page">
                    <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${a.severity >= 3 ? "bg-danger" : a.severity === 2 ? "bg-amber" : "bg-muted"}`} />
                    <span className="min-w-0">
                      <span className={`block font-medium ${a.severity >= 3 ? "text-danger" : ""}`}>{a.title}</span>
                      {a.body && <span className="block text-xs text-muted">{a.body}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => { setBell(false); navigate("/ajustes"); }} className="mt-1 min-h-9 w-full rounded-lg text-xs text-brand hover:bg-page">Receber estes avisos no celular</button>
        </div>
      )}
    </div>
  );
}
