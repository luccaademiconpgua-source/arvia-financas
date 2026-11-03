import { useEffect, useState } from "react";
import { Fuel as FuelIcon } from "lucide-react";
import { Card } from "../ui";
import { inputClass, PrimaryButton } from "../Sheet";
import type { FuelFromNote } from "../../lib/fuel";
import { fuelFromNote } from "../../lib/fuel";
import { formatBrl } from "../../lib/money";
import type { Vehicle } from "../../lib/vehicle";
import { addFuelFromNote, markFuelThirdParty, pendingFuelNotes, type PendingFuelNote } from "../../services/vehicles";
import { useRefresh } from "../../store/refresh";
import { useUI } from "../../store/ui";

export type FuelChoice = { target: string | null; km: string; fullTank: boolean };
export const TERCEIRO = "terceiro";

const lt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/**
 * Para quem é o combustível da nota.
 * Um veículo cadastrado: pergunta se é o seu ou de terceiro. Mais de um: escolhe qual (ou terceiro).
 */
export function FuelVehiclePicker({ info, vehicles, value, onChange, idPrefix }: { info: FuelFromNote; vehicles: Vehicle[]; value: FuelChoice; onChange: (c: FuelChoice) => void; idPrefix: string }) {
  const own = value.target !== null && value.target !== TERCEIRO;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="flex items-start gap-2">
        <FuelIcon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
        <span>
          Nota de posto: <strong>{lt(info.liters)} L de {info.label}</strong> a <span className="num">{formatBrl(info.pricePerLiterCents)}</span> o litro.
        </span>
      </p>
      {vehicles.length === 0 ? (
        <p className="text-muted">Cadastre seu veículo em Veículos para os abastecimentos entrarem nele sozinhos.</p>
      ) : vehicles.length === 1 ? (
        <fieldset>
          <legend className="mb-1 font-medium">É para o seu veículo?</legend>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={value.target === vehicles[0]!.id} onClick={() => onChange({ ...value, target: vehicles[0]!.id })} className={`min-h-11 rounded-lg border px-2 text-sm font-medium ${value.target === vehicles[0]!.id ? "border-brand bg-brand text-white" : "border-line"}`}>
              Sim, no {vehicles[0]!.name}
            </button>
            <button type="button" aria-pressed={value.target === TERCEIRO} onClick={() => onChange({ ...value, target: TERCEIRO })} className={`min-h-11 rounded-lg border px-2 text-sm font-medium ${value.target === TERCEIRO ? "border-brand bg-brand text-white" : "border-line"}`}>
              Não, de terceiro
            </button>
          </div>
        </fieldset>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="font-medium">Em qual veículo?</span>
          <select className={inputClass} value={value.target ?? ""} onChange={(e) => onChange({ ...value, target: e.target.value || null })}>
            <option value="">Escolha</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.plate ? ` (${v.plate})` : ""}</option>)}
            <option value={TERCEIRO}>Veículo de terceiro</option>
          </select>
        </label>
      )}
      {own && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-36 flex-1 flex-col gap-1">
            <span className="font-medium">Km no painel (opcional)</span>
            <input id={`${idPrefix}-km`} className={inputClass} inputMode="numeric" value={value.km} onChange={(e) => onChange({ ...value, km: e.target.value.replace(/\D/g, "").slice(0, 7) })} placeholder="ex.: 190120" />
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5 accent-brand" checked={value.fullTank} onChange={(e) => onChange({ ...value, fullTank: e.target.checked })} />
            Completei o tanque
          </label>
        </div>
      )}
      {own && <p className="-mt-1 text-xs text-muted">Com o km, a Arvia calcula o consumo (km/l) e avisa das revisões.</p>}
      {value.target === TERCEIRO && <p className="text-xs text-muted">Fica só a despesa, sem registrar abastecimento em nenhum veículo seu.</p>}
    </div>
  );
}

/** Grava a escolha: abastecimento no veículo (ligado à despesa da nota) ou marca como de terceiro. */
export async function applyFuelChoice(c: FuelChoice, info: FuelFromNote, note: { nfceId: string; transactionId: string | null; date: string; paidCents: number; store: string }) {
  if (!c.target) return;
  if (c.target === TERCEIRO) return markFuelThirdParty(note.nfceId, note.transactionId);
  await addFuelFromNote({
    vehicleId: c.target, nfceId: note.nfceId, transactionId: note.transactionId, date: note.date, liters: info.liters,
    pricePerLiterCents: info.pricePerLiterCents, fuel: info.fuel, amountCents: note.paidCents, odometer: c.km ? Number(c.km) : null, fullTank: c.fullTank, place: note.store,
  });
}

/** Na tela de Veículos: notas de posto já lançadas que ainda não foram para nenhum veículo. */
export function PendingFuelNotes({ vehicles }: { vehicles: Vehicle[] }) {
  const version = useRefresh((s) => s.version);
  const [notes, setNotes] = useState<Array<PendingFuelNote & { info: FuelFromNote }>>([]);
  useEffect(() => {
    let alive = true;
    void pendingFuelNotes().then((list) => {
      if (!alive) return;
      setNotes(list.flatMap((n) => {
        const info = fuelFromNote(n.items);
        return info ? [{ ...n, info }] : [];
      }));
    });
    return () => {
      alive = false;
    };
  }, [version]);
  if (notes.length === 0 || vehicles.length === 0) return null;
  return (
    <Card title={notes.length === 1 ? "Nota de posto esperando o veículo" : `${notes.length} notas de posto esperando o veículo`}>
      <ul className="divide-y divide-line">
        {notes.map((n) => <PendingRow key={n.id} n={n} vehicles={vehicles} />)}
      </ul>
    </Card>
  );
}

function PendingRow({ n, vehicles }: { n: PendingFuelNote & { info: FuelFromNote }; vehicles: Vehicle[] }) {
  const showToast = useUI((s) => s.showToast);
  const [c, setC] = useState<FuelChoice>({ target: vehicles.length === 1 ? null : null, km: "", fullTank: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <li className="py-3">
      <p className="mb-2 text-sm font-medium">{n.store}, {n.date.split("-").reverse().join("/")}, <span className="num">{formatBrl(n.paidCents)}</span></p>
      <FuelVehiclePicker info={n.info} vehicles={vehicles} value={c} onChange={setC} idPrefix={`p-${n.id}`} />
      <PrimaryButton
        type="button"
        className="mt-3"
        disabled={!c.target || busy}
        onClick={() => {
          setBusy(true);
          void applyFuelChoice(c, n.info, { nfceId: n.id, transactionId: n.transactionId, date: n.date, paidCents: n.paidCents, store: n.store })
            .then(() => showToast(c.target === TERCEIRO ? "Marcada como de terceiro" : "Abastecimento registrado"))
            .catch((e: Error) => setErr(e.message))
            .finally(() => setBusy(false));
        }}
      >
        {c.target === TERCEIRO ? "Confirmar que é de terceiro" : "Registrar abastecimento"}
      </PrimaryButton>
      {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
    </li>
  );
}
