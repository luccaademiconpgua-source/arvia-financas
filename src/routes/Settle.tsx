import { useEffect, useState } from "react";
import { Link } from "react-router";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Handshake, Trash2 } from "lucide-react";
import { Card, Empty } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton } from "../components/Sheet";
import { shiftMonth, todayIso } from "../lib/clock";
import { formatBrl } from "../lib/money";
import { balances, settleUp, type Member } from "../lib/settle";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";
import { useRefresh } from "../store/refresh";
import { useUI } from "../store/ui";

type Summary = { me: string; totalCents: number; members: Member[]; settlements: Array<{ id: string; from: string; to: string; cents: number; at: string }> };
const monthName = (ym: string) => format(parseISO(`${ym}-01`), "MMMM 'de' yyyy", { locale: ptBR });

function useSummary(month: string) {
  const version = useRefresh((s) => s.version);
  const [st, setSt] = useState<{ key: string; data: Summary | null; error: string }>({ key: "", data: null, error: "" });
  useEffect(() => {
    let alive = true;
    void supabase.rpc("couple_summary", { p_month: month }).then(({ data, error }) => {
      if (!alive) return;
      if (error) return setSt({ key: month, data: null, error: error.message });
      const d = data as null | { me: string; total: number; members: Array<Record<string, unknown>>; settlements: Array<Record<string, unknown>> };
      setSt({
        key: month,
        error: "",
        data: d && {
          me: d.me,
          totalCents: Number(d.total),
          members: d.members.map((m) => ({ id: String(m["id"]), name: String(m["name"]), sharePct: Number(m["share_pct"]), paidCents: Number(m["paid"]), qty: Number(m["qty"]), sentCents: Number(m["sent"]), receivedCents: Number(m["received"]) })),
          settlements: d.settlements.map((x) => ({ id: String(x["id"]), from: String(x["from"]), to: String(x["to"]), cents: Number(x["amount"]), at: String(x["at"]) })),
        },
      });
    });
    return () => {
      alive = false;
    };
  }, [month, version]);
  return { ready: st.key === month, ...st };
}

export function Settle() {
  const household = useAuth((s) => s.household);
  const showToast = useUI((s) => s.showToast);
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const { ready, data, error } = useSummary(month);

  if (!household) {
    return (
      <Card title="Acerto da casa">
        <p className="text-sm text-muted">O acerto compara quanto cada pessoa pagou das despesas da casa. Para usar, junte-se à outra pessoa em uma casa.</p>
        <Link to="/ajustes" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand underline">Criar ou entrar em uma casa nos Ajustes</Link>
      </Card>
    );
  }
  if (!ready) return <Empty>{error || "Carregando…"}</Empty>;
  if (!data) return <Empty>{error || "Não consegui carregar o acerto."}</Empty>;

  const bal = balances(data.members, data.totalCents);
  const transfers = settleUp(bal);
  const name = (id: string) => (id === data.me ? "Você" : data.members.find((m) => m.id === id)?.name ?? "Alguém");
  const alone = data.members.length < 2;

  async function register(from: string, to: string, cents: number) {
    const { error: e } = await supabase.rpc("register_settlement", { p_month: month, p_from: from, p_to: to, p_cents: cents });
    if (e) return showToast(e.message);
    useRefresh.getState().bump();
    showToast("Acerto registrado");
  }
  async function undo(id: string) {
    const { error: e } = await supabase.from("couple_settlements").delete().eq("id", id);
    if (e) return showToast(e.message);
    useRefresh.getState().bump();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))} className="flex size-11 items-center justify-center rounded-lg border border-line"><ChevronLeft size={20} aria-hidden="true" /></button>
          <h2 className="font-display text-base font-semibold first-letter:uppercase">{monthName(month)}</h2>
          <button type="button" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(month, 1))} className="flex size-11 items-center justify-center rounded-lg border border-line"><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        <div className="mt-4 text-center">
          {alone ? (
            <p className="text-sm text-muted">Só você está na casa {household.name}. Envie o código de convite <strong>{household.inviteCode}</strong> para a outra pessoa entrar.</p>
          ) : data.totalCents === 0 ? (
            <p className="text-sm text-muted">Nenhuma despesa da casa neste mês. As despesas lançadas no modo Casa entram aqui.</p>
          ) : transfers.length === 0 ? (
            <p className="font-display text-xl font-semibold">Tudo certo neste mês</p>
          ) : (
            transfers.map((t) => (
              <div key={`${t.from}${t.to}`} className="flex flex-col items-center gap-3">
                <Handshake size={28} aria-hidden="true" className="text-brand" />
                <p className="font-display text-xl font-semibold">
                  {name(t.from)} passa <span className="num">{formatBrl(t.cents)}</span> para {t.to === data.me ? "você" : name(t.to)}
                </p>
                <PrimaryButton type="button" onClick={() => void register(t.from, t.to, t.cents)}>Registrar que o acerto foi feito</PrimaryButton>
              </div>
            ))
          )}
        </div>
      </Card>

      {!alone && (
        <Card title={`Despesas da casa: ${formatBrl(data.totalCents)}`}>
          <ul className="divide-y divide-line">
            {bal.map((b) => (
              <li key={b.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-3 text-sm">
                <span className="font-medium">{b.id === data.me ? `${b.name} (você)` : b.name}</span>
                <span className="num text-right font-semibold">{formatBrl(b.paidCents)}</span>
                <span className="text-xs text-muted">{b.qty} {b.qty === 1 ? "despesa paga" : "despesas pagas"}, parte de {b.sharePct.toLocaleString("pt-BR")}% = <span className="num">{formatBrl(b.fairCents)}</span></span>
                <span className={`num text-right text-xs ${b.netCents > 100 ? "text-income" : b.netCents < -100 ? "text-expense" : "text-muted"}`}>
                  {b.netCents > 100 ? `a receber ${formatBrl(b.netCents)}` : b.netCents < -100 ? `a pagar ${formatBrl(-b.netCents)}` : "em dia"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Quem pagou é o dono da conta ou do cartão usado. Transferências entre vocês não contam como despesa.</p>
        </Card>
      )}

      {data.settlements.length > 0 && (
        <Card title="Acertos feitos neste mês">
          <ul className="divide-y divide-line">
            {data.settlements.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{name(s.from)} passou <span className="num font-medium">{formatBrl(s.cents)}</span> para {s.to === data.me ? "você" : name(s.to)} em {format(parseISO(s.at), "dd/MM")}</span>
                <button type="button" aria-label="Desfazer acerto" onClick={() => void undo(s.id)} className="flex size-9 items-center justify-center text-muted hover:text-danger"><Trash2 size={16} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.members.length === 2 && <SplitCard me={bal.find((b) => b.id === data.me)!.sharePct} other={data.members.find((m) => m.id !== data.me)!.name} />}
    </div>
  );
}

function SplitCard({ me, other }: { me: number; other: string }) {
  const showToast = useUI((s) => s.showToast);
  const [pct, setPct] = useState(String(Math.round(me)));
  const n = Number(pct);
  const valid = Number.isInteger(n) && n >= 0 && n <= 100;
  return (
    <Card title="Como vocês dividem a casa">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          void supabase.rpc("set_household_split", { p_my_pct: n }).then(({ error }) => {
            if (error) return showToast(error.message);
            useRefresh.getState().bump();
            showToast("Divisão salva");
          });
        }}
      >
        <div className="w-32">
          <Field label="Sua parte (%)">
            <input className={inputClass} inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/\D/g, "").slice(0, 3))} />
          </Field>
        </div>
        <p className="min-h-11 flex-1 py-3 text-sm text-muted">{valid ? `${other} fica com ${100 - n}%.` : "Use de 0 a 100."}</p>
        <SecondaryButton type="submit" disabled={!valid}>Salvar divisão</SecondaryButton>
      </form>
      <p className="mt-2 text-xs text-muted">Meio a meio é o padrão. Se um ganha mais, dá para dividir proporcional à renda, por exemplo 60% e 40%.</p>
    </Card>
  );
}
