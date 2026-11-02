import { useState } from "react";
import { useNavigate } from "react-router";
import { Bell, Search } from "lucide-react";
import { useModeData } from "../hooks/useModeData";
import { worstInvoiceStatus } from "../lib/calc";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function HeaderTools() {
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [bell, setBell] = useState(false);
  const navigate = useNavigate();
  const { cards } = useModeData();
  const overdue = cards.flatMap((c) => (worstInvoiceStatus(c) === "vencida" ? c.invoices.filter((i) => i.status === "vencida") : []));

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
      <button type="button" aria-label="Notificações" aria-expanded={bell} onClick={() => setBell((v) => !v)} className="relative flex size-11 items-center justify-center rounded-lg text-muted hover:text-ink">
        <Bell size={20} aria-hidden="true" />
        {overdue.length > 0 && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-danger" aria-hidden="true" />}
      </button>
      {bell && (
        <div role="region" aria-label="Notificações" className="absolute top-12 right-0 z-30 w-72 rounded-card border border-line bg-card p-3 text-sm shadow-card">
          {overdue.length === 0 ? (
            <p className="text-muted">Nenhuma notificação.</p>
          ) : (
            <ul className="space-y-2">
              {overdue.map((i) => (
                <li key={i.id} className="font-medium text-danger">
                  Fatura de {format(parseISO(`${i.month}-01`), "MMMM", { locale: ptBR })} vencida
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
