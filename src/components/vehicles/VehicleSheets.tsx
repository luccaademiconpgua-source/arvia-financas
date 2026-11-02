import { useMemo, useState } from "react";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../Sheet";
import { todayIso } from "../../lib/clock";
import { formatBrl, parseBrlToCents } from "../../lib/money";
import { EXPENSE_TYPES, FUEL_LABEL, SERVICE_TYPES, fillMath, type Fuel, type Reminder, type Vehicle, type VehicleFuel } from "../../lib/vehicle";
import { addLog, createVehicle, deleteVehicle, markReminderDone, saveReminder, updateVehicle, type Payment } from "../../services/vehicles";
import { useUI } from "../../store/ui";
import type { Account, Card, Category, Mode, Transaction } from "../../types";

/** "40,5" -> 40.5 ; "5,899" -> 5.899 ; vazio ou inválido -> null */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const parseKm = (s: string) => {
  const t = s.replace(/\D/g, "");
  return t ? Number(t) : null;
};
const kmFmt = new Intl.NumberFormat("pt-BR");

function Actions({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }) {
  return (
    <div className="mt-2 flex gap-2">
      <PrimaryButton type="submit" disabled={busy} className="flex-1">{busy ? "Salvando…" : label}</PrimaryButton>
      <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
    </div>
  );
}

// ---------- Novo veículo ----------

export function NewVehicleSheet({ mode, vehicle, onClose, onDeleted }: { mode: Mode; vehicle?: Vehicle; onClose: () => void; onDeleted?: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const [name, setName] = useState(vehicle?.name ?? "");
  const [plate, setPlate] = useState(vehicle?.plate ?? "");
  const [fuel, setFuel] = useState<VehicleFuel>(vehicle?.fuel ?? "flex");
  const [odo, setOdo] = useState(vehicle ? kmFmt.format(vehicle.initialOdometer) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  return (
    <Sheet title={vehicle ? `Configurar ${vehicle.name}` : "Novo veículo"} onClose={onClose}>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return setError("Informe um nome, como Onix prata.");
          setBusy(true);
          const data = { name: name.trim().slice(0, 40), plate: plate.trim().toUpperCase().slice(0, 10) || null, fuel, initialOdometer: parseKm(odo) ?? 0 };
          (vehicle ? updateVehicle(vehicle.id, data) : createVehicle(mode, data))
            .then(() => {
              showToast(vehicle ? "Veículo atualizado" : "Veículo criado");
              onClose();
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        <Field label="Nome"><input className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Onix prata" /></Field>
        <Field label="Placa (opcional)"><input className={inputClass} value={plate} maxLength={8} onChange={(e) => setPlate(e.target.value)} placeholder="ABC1D23" autoCapitalize="characters" /></Field>
        <Field label="Combustível">
          <select className={inputClass} value={fuel} onChange={(e) => setFuel(e.target.value as VehicleFuel)}>
            {(Object.keys(FUEL_LABEL) as VehicleFuel[]).map((f) => <option key={f} value={f}>{FUEL_LABEL[f]}</option>)}
          </select>
        </Field>
        <Field label={vehicle ? "Hodômetro inicial (quando começou a registrar)" : "Quilometragem atual (hodômetro)"} error={error}>
          <input className={inputClass} inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} placeholder="48.230" />
        </Field>
        {vehicle && <p className="text-xs text-muted">O hodômetro atual é calculado pelos registros. Este valor é o ponto de partida para os km rodados e o custo por km.</p>}
        <Actions busy={busy} onClose={onClose} label={vehicle ? "Salvar alterações" : "Criar veículo"} />
        {vehicle && (
          <div className="border-t border-line pt-3 text-sm">
            {!askDelete ? (
              <button type="button" className="min-h-11 text-muted underline underline-offset-4" onClick={() => setAskDelete(true)}>Excluir este veículo</button>
            ) : (
              <div className="flex flex-col gap-2">
                <p>Excluir {vehicle.name} com todo o histórico? As despesas já lançadas nas contas continuam lá.</p>
                <div className="flex gap-2">
                  <button type="button" className="min-h-11 rounded-lg bg-danger px-3 font-medium text-white" onClick={() => void deleteVehicle(vehicle.id).then(() => { showToast("Veículo excluído"); onDeleted?.(); onClose(); })}>Excluir</button>
                  <SecondaryButton type="button" onClick={() => setAskDelete(false)}>Cancelar</SecondaryButton>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </Sheet>
  );
}

// ---------- Pagamento (lançar nas despesas) ----------

function PaymentFields({
  accounts,
  cards,
  value,
  onChange,
}: {
  accounts: Account[];
  cards: Card[];
  value: { on: boolean; source: string; payment: Transaction["payment"] };
  onChange: (v: { on: boolean; source: string; payment: Transaction["payment"] }) => void;
}) {
  const none = accounts.length === 0 && cards.length === 0;
  if (none) return <p className="text-xs text-muted">Crie uma conta ou um cartão para também lançar este gasto nas despesas.</p>;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={value.on} onChange={(e) => onChange({ ...value, on: e.target.checked })} />
        Lançar também nas despesas
      </label>
      {value.on && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pago com">
            <select className={inputClass} value={value.source} onChange={(e) => onChange({ ...value, source: e.target.value })}>
              {accounts.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
              {cards.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.label} final {c.last4}</option>)}
            </select>
          </Field>
          {value.source.startsWith("a:") && (
            <Field label="Forma">
              <select className={inputClass} value={value.payment} onChange={(e) => onChange({ ...value, payment: e.target.value as Transaction["payment"] })}>
                <option value="pix">Pix</option>
                <option value="debito">Débito</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function toPayment(v: { on: boolean; source: string; payment: Transaction["payment"] }, categoryId?: string): Payment | null {
  if (!v.on || !v.source) return null;
  const id = v.source.slice(2);
  return v.source.startsWith("c:")
    ? { cardId: id, payment: "credito", ...(categoryId ? { categoryId } : {}) }
    : { accountId: id, payment: v.payment, ...(categoryId ? { categoryId } : {}) };
}

// ---------- Abastecimento, serviço, despesa ----------

type LogKind = "abastecimento" | "servico" | "despesa";
const TITLES: Record<LogKind, string> = { abastecimento: "Abastecimento", servico: "Serviço ou manutenção", despesa: "Despesa do veículo" };

export function LogSheet({
  kind,
  mode,
  vehicle,
  currentOdo,
  lastDate,
  reminders,
  accounts,
  cards,
  categories,
  onClose,
}: {
  kind: LogKind;
  mode: Mode;
  vehicle: Vehicle;
  currentOdo: number;
  lastDate: string | null;
  reminders: Reminder[];
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  onClose: () => void;
}) {
  const showToast = useUI((s) => s.showToast);
  const [date, setDate] = useState(todayIso());
  const [odo, setOdo] = useState("");
  const defaultFuel: Fuel = vehicle.fuel === "flex" ? "gasolina" : vehicle.fuel;
  const [fuel, setFuel] = useState<Fuel>(defaultFuel);
  const [liters, setLiters] = useState("");
  const [price, setPrice] = useState("");
  const [total, setTotal] = useState("");
  const [full, setFull] = useState(true);
  const [subtype, setSubtype] = useState<string>(kind === "servico" ? SERVICE_TYPES[0] : EXPENSE_TYPES[0]);
  const [desc, setDesc] = useState("");
  const [place, setPlace] = useState("");
  const [pay, setPay] = useState({ on: true, source: accounts[0] ? `a:${accounts[0].id}` : cards[0] ? `c:${cards[0].id}` : "", payment: "pix" as Transaction["payment"] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const matching = kind === "servico" ? reminders.find((r) => r.title.toLowerCase() === subtype.toLowerCase()) : undefined;
  const [updateReminder, setUpdateReminder] = useState(true);

  const computed = useMemo(() => {
    if (kind !== "abastecimento") return null;
    const l = parseDecimal(liters);
    const p = parseDecimal(price);
    const t = total.trim() ? parseBrlToCents(total) : null;
    return fillMath({ liters: l, priceCents: p ? Math.round(p * 100) : null, totalCents: t });
  }, [kind, liters, price, total]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const km = parseKm(odo);
    let amount: number | null;
    let l: number | null = null;
    let ppl: number | null = null;

    if (kind === "abastecimento") {
      if (km === null) return setError("Informe a quilometragem do painel no momento do abastecimento.");
      if (!computed?.liters || !computed.totalCents) return setError("Preencha dois destes três: litros, preço por litro e valor total.");
      l = computed.liters;
      ppl = computed.priceCents ?? Math.round(computed.totalCents / computed.liters);
      amount = computed.totalCents;
    } else {
      amount = parseBrlToCents(total);
      if (amount === null) return setError("Informe o valor, como 350,00.");
    }
    if (km !== null && km < currentOdo && (!lastDate || date >= lastDate)) {
      return setError(`A quilometragem está menor que a última registrada (${kmFmt.format(currentOdo)} km). Confira o número.`);
    }

    const catName = kind === "abastecimento" ? "Gasolina" : "Veículo";
    const category = categories.find((c) => c.kind === "despesa" && c.name === catName) ?? categories.find((c) => c.kind === "despesa" && c.name === "Outras");

    setBusy(true);
    try {
      await addLog(
        mode,
        {
          vehicleId: vehicle.id,
          kind,
          date,
          odometer: km,
          liters: l,
          pricePerLiterCents: ppl,
          fuel: kind === "abastecimento" ? fuel : null,
          fullTank: kind === "abastecimento" ? full : true,
          subtype: kind === "abastecimento" ? null : subtype,
          description: desc.trim() || null,
          place: place.trim() || null,
          amountCents: amount,
        },
        toPayment(pay, category?.id),
        vehicle.name,
      );
      if (kind === "servico" && updateReminder) {
        await markReminderDone(vehicle.id, subtype, km, date);
      }
      showToast(kind === "abastecimento" ? "Abastecimento salvo" : kind === "servico" ? "Serviço salvo" : "Despesa salva");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`${TITLES[kind]}: ${vehicle.name}`} onClose={onClose}>
      <form noValidate className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data"><input type="date" className={inputClass} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={kind === "abastecimento" ? "Hodômetro (km)" : "Hodômetro (opcional)"}>
            <input className={inputClass} inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} placeholder={currentOdo ? kmFmt.format(currentOdo) : "48.230"} />
          </Field>
        </div>

        {kind === "abastecimento" ? (
          <>
            {vehicle.fuel !== "eletrico" && (
              <div role="radiogroup" aria-label="Combustível" className="flex flex-wrap gap-2">
                {(vehicle.fuel === "flex" ? (["gasolina", "etanol"] as Fuel[]) : [defaultFuel]).map((f) => (
                  <button key={f} type="button" role="radio" aria-checked={fuel === f} onClick={() => setFuel(f)} className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${fuel === f ? "border-brand bg-brand text-white" : "border-line"}`}>
                    {FUEL_LABEL[f]}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Field label="Litros"><input className={inputClass} inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} placeholder="40,5" /></Field>
              <Field label="R$ por litro"><input className={inputClass} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5,89" /></Field>
              <Field label="Total R$"><input className={inputClass} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="238,50" /></Field>
            </div>
            {computed?.liters && computed.totalCents ? (
              <p className="text-sm text-muted">
                {computed.liters.toString().replace(".", ",")} L a {formatBrl(computed.priceCents ?? 0)} por litro, total <span className="num font-medium text-ink">{formatBrl(computed.totalCents)}</span>
              </p>
            ) : (
              <p className="text-xs text-muted">Preencha dois dos três campos que o terceiro é calculado.</p>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 size-4" checked={full} onChange={(e) => setFull(e.target.checked)} />
              <span>Completei o tanque <span className="block text-xs text-muted">O consumo (km/L) é calculado entre dois tanques cheios.</span></span>
            </label>
            <Field label="Posto (opcional)"><input className={inputClass} value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} placeholder="Posto Mahle Centro" /></Field>
          </>
        ) : (
          <>
            <Field label="Tipo">
              <select className={inputClass} value={subtype} onChange={(e) => setSubtype(e.target.value)}>
                {(kind === "servico" ? SERVICE_TYPES : EXPENSE_TYPES).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Valor"><input className={inputClass} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="350,00" /></Field>
            <Field label="Descrição (opcional)"><input className={inputClass} value={desc} maxLength={120} onChange={(e) => setDesc(e.target.value)} placeholder={kind === "servico" ? "Óleo 5W30 e filtro de óleo" : "Parcela 1 de 3"} /></Field>
            {kind === "servico" && <Field label="Oficina (opcional)"><input className={inputClass} value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} /></Field>}
            {kind === "servico" && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 size-4" checked={updateReminder} onChange={(e) => setUpdateReminder(e.target.checked)} />
                <span>
                  {matching ? `Marcar o lembrete "${matching.title}" como feito nesta data` : `Se houver um lembrete "${subtype}", marcar como feito nesta data`}
                </span>
              </label>
            )}
          </>
        )}

        <PaymentFields accounts={accounts} cards={cards} value={pay} onChange={setPay} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Actions busy={busy} onClose={onClose} label="Salvar" />
      </form>
    </Sheet>
  );
}

// ---------- Lembrete ----------

const PRESETS: Array<{ title: string; km: number | null; months: number | null }> = [
  { title: "Troca de óleo", km: 10000, months: 12 },
  { title: "Revisão", km: 10000, months: 12 },
  { title: "Alinhamento e balanceamento", km: 10000, months: null },
  { title: "Pneus", km: 40000, months: 60 },
  { title: "Freios", km: 30000, months: null },
  { title: "Licenciamento", km: null, months: 12 },
  { title: "Seguro", km: null, months: 12 },
  { title: "IPVA", km: null, months: 12 },
];

export function ReminderSheet({ vehicle, currentOdo, reminder, onClose }: { vehicle: Vehicle; currentOdo: number; reminder?: Reminder; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [everyKm, setEveryKm] = useState(reminder?.everyKm ? String(reminder.everyKm) : "");
  const [everyMonths, setEveryMonths] = useState(reminder?.everyMonths ? String(reminder.everyMonths) : "");
  const [lastKm, setLastKm] = useState(reminder?.lastKm != null ? String(reminder.lastKm) : currentOdo ? String(currentOdo) : "");
  const [lastDate, setLastDate] = useState(reminder?.lastDate ?? todayIso());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Sheet title={reminder ? "Editar lembrete" : "Novo lembrete"} onClose={onClose}>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const km = parseKm(everyKm);
          const mo = parseKm(everyMonths);
          if (title.trim().length < 2) return setError("Dê um nome ao lembrete, como Troca de óleo.");
          if (!km && !mo) return setError("Informe a cada quantos km ou a cada quantos meses.");
          if (mo !== null && mo > 120) return setError("Use no máximo 120 meses.");
          setBusy(true);
          saveReminder({ ...(reminder ? { id: reminder.id } : {}), vehicleId: vehicle.id, title: title.trim().slice(0, 40), everyKm: km, everyMonths: mo, lastKm: parseKm(lastKm), lastDate: lastDate || null })
            .then(() => {
              showToast("Lembrete salvo");
              onClose();
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        {!reminder && (
          <div className="flex flex-wrap gap-2" aria-label="Sugestões">
            {PRESETS.map((p) => (
              <button
                key={p.title}
                type="button"
                onClick={() => {
                  setTitle(p.title);
                  setEveryKm(p.km ? String(p.km) : "");
                  setEveryMonths(p.months ? String(p.months) : "");
                }}
                className={`min-h-9 rounded-full border px-3 text-sm ${title === p.title ? "border-brand bg-brand text-white" : "border-line"}`}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}
        <Field label="Nome"><input className={inputClass} value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder="Troca de óleo" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="A cada (km)"><input className={inputClass} inputMode="numeric" value={everyKm} onChange={(e) => setEveryKm(e.target.value)} placeholder="10.000" /></Field>
          <Field label="Ou a cada (meses)"><input className={inputClass} inputMode="numeric" value={everyMonths} onChange={(e) => setEveryMonths(e.target.value)} placeholder="12" /></Field>
        </div>
        <p className="text-xs text-muted">Avisamos pelo que chegar primeiro.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Última vez (km)"><input className={inputClass} inputMode="numeric" value={lastKm} onChange={(e) => setLastKm(e.target.value)} /></Field>
          <Field label="Última vez (data)"><input type="date" className={inputClass} value={lastDate} max={todayIso()} onChange={(e) => setLastDate(e.target.value)} /></Field>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Actions busy={busy} onClose={onClose} label="Salvar lembrete" />
      </form>
    </Sheet>
  );
}
