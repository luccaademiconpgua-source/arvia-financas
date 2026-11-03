import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Bell, Car, Fuel as FuelIcon, Plus, Receipt, Settings2, Trash2, Wrench } from "lucide-react";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton } from "../components/Sheet";
import { GlassStage } from "../components/dashboard/GlassStage";
import { ConsumptionChart, MonthlyCostChart } from "../components/vehicles/VehicleCharts";
import { LogSheet, NewVehicleSheet, ReminderSheet, parseDecimal } from "../components/vehicles/VehicleSheets";
import { useModeData } from "../hooks/useModeData";
import { PendingFuelNotes } from "../components/vehicles/FuelVehiclePicker";
import { todayIso } from "../lib/clock";
import { formatBrl } from "../lib/money";
import {
  FUEL_LABEL,
  averageKmPerLiter,
  consumption,
  costPerKm,
  currentOdometer,
  flexAdvice,
  fuelCostPerKm,
  kmDriven,
  kmPerMonth,
  monthly,
  reminderStatus,
  totalCost,
  type Reminder,
  type Vehicle,
  type VehicleLog,
} from "../lib/vehicle";
import { deleteLog, deleteReminder, saveReminder, useVehicles } from "../services/vehicles";
import { useUI } from "../store/ui";

const kmFmt = new Intl.NumberFormat("pt-BR");
const kml = (n: number | null) => (n === null ? "sem dados" : `${n.toFixed(1).replace(".", ",")} km/L`);
const perKm = (c: number | null) => (c === null ? "sem dados" : formatBrl(Math.round(c)));
const dmy = (iso: string) => format(parseISO(iso), "dd/MM/yyyy");

type Tab = "resumo" | "historico" | "lembretes";
type Open = null | { kind: "veiculo" } | { kind: "config" } | { kind: "abastecimento" | "servico" | "despesa" } | { kind: "lembrete"; reminder?: Reminder };

export function Vehicles() {
  const { mode, accounts, cards, categories } = useModeData();
  const { ready, error, vehicles, logs, reminders } = useVehicles(mode);
  const [sel, setSel] = useState<string>("");
  const [tab, setTab] = useState<Tab>("resumo");
  const [open, setOpen] = useState<Open>(null);

  const vehicle = vehicles.find((v) => v.id === sel) ?? vehicles[0];
  const vLogs = useMemo(() => (vehicle ? logs.filter((l) => l.vehicleId === vehicle.id) : []), [logs, vehicle]);
  const vRem = useMemo(() => (vehicle ? reminders.filter((r) => r.vehicleId === vehicle.id) : []), [reminders, vehicle]);

  if (!ready) return <Empty>{error || "Carregando…"}</Empty>;

  if (!vehicle) {
    return (
      <>
        <Card title="Seus veículos">
          <p className="text-sm text-muted">
            Registre abastecimentos, manutenções e despesas como IPVA e seguro. A Arvia calcula o consumo médio, quanto você roda por mês, o custo por quilômetro e avisa quando chegar a hora da próxima revisão.
          </p>
          <PrimaryButton type="button" className="mt-4" onClick={() => setOpen({ kind: "veiculo" })}>Cadastrar veículo</PrimaryButton>
        </Card>
        {open?.kind === "veiculo" && <NewVehicleSheet mode={mode} onClose={() => setOpen(null)} />}
      </>
    );
  }

  const odo = currentOdometer(vehicle, vLogs);
  const points = consumption(vLogs);
  const avg = averageKmPerLiter(points);
  const last = points.at(-1)?.kmPerLiter ?? null;
  const lastDate = vLogs.reduce<string | null>((m, l) => (!m || l.date > m ? l.date : m), null);
  const today = todayIso();
  const statuses = vRem.map((r) => ({ r, s: reminderStatus(r, odo, today) }));
  const alerts = statuses.filter((x) => x.s.state !== "ok");

  return (
    <div className="flex flex-col gap-4">
      <PendingFuelNotes vehicles={vehicles} />
      <div className="flex flex-wrap items-center gap-2">
        {vehicles.map((v) => (
          <button key={v.id} type="button" onClick={() => setSel(v.id)} aria-pressed={v.id === vehicle.id} className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${v.id === vehicle.id ? "border-brand bg-brand text-white" : "border-line bg-card"}`}>
            <Car size={16} aria-hidden="true" /> {v.name}
          </button>
        ))}
        <SecondaryButton type="button" onClick={() => setOpen({ kind: "veiculo" })} className="flex items-center gap-1 bg-card">
          <Plus size={16} aria-hidden="true" /> Veículo
        </SecondaryButton>
        <SecondaryButton type="button" onClick={() => setOpen({ kind: "config" })} className="flex items-center gap-1 bg-card">
          <Settings2 size={16} aria-hidden="true" /> Configurar {vehicle.name}
        </SecondaryButton>
      </div>

      <VehicleHero vehicle={vehicle} odo={odo} avg={avg} last={last} logs={vLogs} onAdd={(kind) => setOpen({ kind })} />

      {alerts.length > 0 && (
        <Card>
          <ul className="space-y-2">
            {alerts.map(({ r, s }) => (
              <li key={r.id} className="flex items-start gap-2 text-sm">
                <Bell size={18} aria-hidden="true" className={s.state === "vencido" ? "text-danger" : "text-warn"} />
                <span>
                  <strong>{r.title}</strong> {s.state === "vencido" ? "está vencido" : "está chegando"}
                  {s.kmLeft !== null && <>: {s.kmLeft > 0 ? `faltam ${kmFmt.format(s.kmLeft)} km` : `passou ${kmFmt.format(-s.kmLeft)} km`}</>}
                  {s.daysLeft !== null && <>{s.kmLeft !== null ? " ou " : ": "}{s.daysLeft > 0 ? `faltam ${s.daysLeft} dias` : `venceu há ${-s.daysLeft} dias`}</>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div role="tablist" aria-label="Seções do veículo" className="grid grid-cols-3 rounded-xl border border-line bg-card p-1">
        {(["resumo", "historico", "lembretes"] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 rounded-lg text-sm font-medium ${tab === t ? "bg-brand text-white" : "text-muted"}`}>
            {t === "resumo" ? "Resumo" : t === "historico" ? "Histórico" : `Lembretes${vRem.length ? ` (${vRem.length})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "resumo" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ConsumptionChart points={points} average={avg} />
          <MonthlyCostChart rows={monthly(vLogs, today.slice(0, 7), 6)} />
          <Totals vehicle={vehicle} logs={vLogs} />
          {(vehicle.fuel === "flex" || vehicle.fuel === "gasolina" || vehicle.fuel === "etanol") && (
            <FlexCalc kmlE={averageKmPerLiter(points, "etanol")} kmlG={averageKmPerLiter(points, "gasolina")} />
          )}
        </div>
      )}

      {tab === "historico" && <History logs={vLogs} points={points} />}

      {tab === "lembretes" && (
        <Card title="Lembretes de manutenção">
          {statuses.length === 0 ? (
            <p className="text-sm text-muted">Crie lembretes por quilometragem ou por data, como troca de óleo a cada 10.000 km ou licenciamento todo ano.</p>
          ) : (
            <ul className="divide-y divide-line">
              {statuses.map(({ r, s }) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.title}</p>
                    <p className="text-sm text-muted">
                      {[r.everyKm ? `a cada ${kmFmt.format(r.everyKm)} km` : null, r.everyMonths ? `a cada ${r.everyMonths} ${r.everyMonths === 1 ? "mês" : "meses"}` : null].filter(Boolean).join(" ou ")}
                    </p>
                    <p className="text-sm text-muted">
                      Próximo: {[s.nextKm !== null ? `${kmFmt.format(s.nextKm)} km` : null, s.nextDate ? dmy(s.nextDate) : null].filter(Boolean).join(" ou ") || "informe a última vez"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={s.state === "ok" ? "ok" : s.state === "breve" ? "warn" : "danger"}>{s.state === "ok" ? "Em dia" : s.state === "breve" ? "Chegando" : "Vencido"}</Pill>
                    <SecondaryButton type="button" onClick={() => void saveReminder({ ...r, lastKm: odo || r.lastKm, lastDate: today })}>Feito hoje</SecondaryButton>
                    <SecondaryButton type="button" onClick={() => setOpen({ kind: "lembrete", reminder: r })}>Editar</SecondaryButton>
                    <button type="button" aria-label={`Excluir lembrete ${r.title}`} onClick={() => void deleteReminder(r.id)} className="flex size-11 items-center justify-center rounded-lg text-muted hover:text-danger">
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <PrimaryButton type="button" className="mt-3" onClick={() => setOpen({ kind: "lembrete" })}>Novo lembrete</PrimaryButton>
        </Card>
      )}


      {open?.kind === "veiculo" && <NewVehicleSheet mode={mode} onClose={() => setOpen(null)} />}
      {open?.kind === "config" && <NewVehicleSheet key={vehicle.id} mode={mode} vehicle={vehicle} onClose={() => setOpen(null)} onDeleted={() => setSel("")} />}
      {open && (open.kind === "abastecimento" || open.kind === "servico" || open.kind === "despesa") && (
        <LogSheet kind={open.kind} mode={mode} vehicle={vehicle} currentOdo={odo} lastDate={lastDate} reminders={vRem} accounts={accounts} cards={cards} categories={categories} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "lembrete" && <ReminderSheet vehicle={vehicle} currentOdo={odo} {...(open.reminder ? { reminder: open.reminder } : {})} onClose={() => setOpen(null)} />}
    </div>
  );
}

function VehicleHero({ vehicle, odo, avg, last, logs, onAdd }: { vehicle: Vehicle; odo: number; avg: number | null; last: number | null; logs: VehicleLog[]; onAdd: (k: "abastecimento" | "servico" | "despesa") => void }) {
  const perMonth = kmPerMonth(logs);
  const tiles = [
    { label: "Consumo médio", value: kml(avg) },
    { label: "Último tanque", value: kml(last) },
    { label: "Custo por km", value: perKm(costPerKm(vehicle, logs)) },
    { label: "Roda por mês", value: perMonth === null ? "sem dados" : `${kmFmt.format(Math.round(perMonth))} km` },
  ];
  return (
    <GlassStage label={`Painel do veículo ${vehicle.name}`}>
      <div className="grid gap-3 lg:grid-cols-12">
        <div className="glass p-4 lg:col-span-5">
          <p className="text-sm text-white/75">
            {vehicle.name}
            {vehicle.plate ? `, placa ${vehicle.plate}` : ""}, {FUEL_LABEL[vehicle.fuel].toLowerCase()}
          </p>
          <p className="num font-display mt-1 text-[34px] leading-tight font-semibold tracking-tight">{kmFmt.format(odo)} km</p>
          <p className="text-sm text-white/70">no hodômetro</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => onAdd("abastecimento")} className="glass-button flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium">
              <FuelIcon size={18} aria-hidden="true" /> Abastecer
            </button>
            <button type="button" onClick={() => onAdd("servico")} className="glass-button flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium">
              <Wrench size={18} aria-hidden="true" /> Serviço
            </button>
            <button type="button" onClick={() => onAdd("despesa")} className="glass-button flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium">
              <Receipt size={18} aria-hidden="true" /> Despesa
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:col-span-7">
          {tiles.map((t) => (
            <div key={t.label} className="glass flex flex-col justify-center p-3 sm:p-4">
              <p className="text-xs text-white/75 sm:text-sm">{t.label}</p>
              <p className="num font-display mt-1 text-lg font-semibold sm:text-2xl">{t.value}</p>
            </div>
          ))}
        </div>
      </div>
    </GlassStage>
  );
}

function Totals({ vehicle, logs }: { vehicle: Vehicle; logs: VehicleLog[] }) {
  const by = (k: VehicleLog["kind"]) => logs.filter((l) => l.kind === k).reduce((s, l) => s + l.amountCents, 0);
  const liters = logs.reduce((s, l) => s + (l.liters ?? 0), 0);
  const rows: Array<[string, string]> = [
    ["Total gasto", formatBrl(totalCost(logs))],
    ["Combustível", formatBrl(by("abastecimento"))],
    ["Serviços e manutenção", formatBrl(by("servico"))],
    ["Outras despesas", formatBrl(by("despesa"))],
    ["Km rodados no período", `${kmFmt.format(kmDriven(vehicle, logs))} km`],
    ["Litros abastecidos", `${liters.toFixed(1).replace(".", ",")} L`],
    ["Combustível por km", perKm(fuelCostPerKm(vehicle, logs))],
  ];
  return (
    <Card title="Totais desde o cadastro" className="h-full">
      <dl className="divide-y divide-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="num font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function FlexCalc({ kmlE, kmlG }: { kmlE: number | null; kmlG: number | null }) {
  const [e, setE] = useState("");
  const [g, setG] = useState("");
  const pe = parseDecimal(e);
  const pg = parseDecimal(g);
  const a = pe && pg ? flexAdvice(Math.round(pe * 100), Math.round(pg * 100), kmlE, kmlG) : null;
  return (
    <Card title="Etanol ou gasolina?" className="h-full">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Etanol (R$ por litro)"><input className={inputClass} inputMode="decimal" value={e} onChange={(x) => setE(x.target.value)} placeholder="3,99" /></Field>
        <Field label="Gasolina (R$ por litro)"><input className={inputClass} inputMode="decimal" value={g} onChange={(x) => setG(x.target.value)} placeholder="5,89" /></Field>
      </div>
      {a ? (
        <div className={`mt-3 rounded-lg p-3 text-sm ${a.best === "etanol" ? "bg-income-bg" : "bg-warn-bg"}`}>
          <p className="font-medium">Abasteça com {a.best}.</p>
          <p className="mt-1 text-muted">
            O etanol custa {Math.round(a.ratio * 100)}% do preço da gasolina.{" "}
            {a.byOwnAverage && a.costPerKmEtanol && a.costPerKmGasolina
              ? `Pelo consumo real do seu carro, o km sai ${formatBrl(Math.round(a.costPerKmEtanol))} no etanol e ${formatBrl(Math.round(a.costPerKmGasolina))} na gasolina.`
              : "Pela regra dos 70%: abaixo disso, o etanol compensa. Com abastecimentos dos dois combustíveis registrados, a conta passa a usar o consumo real do seu carro."}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Digite os dois preços do posto para saber qual compensa.</p>
      )}
    </Card>
  );
}

const KIND_LABEL = { abastecimento: "Abastecimentos", servico: "Serviços", despesa: "Despesas" } as const;

function History({ logs, points }: { logs: VehicleLog[]; points: ReturnType<typeof consumption> }) {
  const [filter, setFilter] = useState<"todos" | VehicleLog["kind"]>("todos");
  const [confirm, setConfirm] = useState<string | null>(null);
  const showToast = useUI((s) => s.showToast);
  const kmlByOdo = new Map(points.map((p) => [p.odometer, p.kmPerLiter]));
  const shown = logs.filter((l) => filter === "todos" || l.kind === filter);
  return (
    <Card title="Histórico">
      <div className="mb-3 flex flex-wrap gap-2">
        {(["todos", "abastecimento", "servico", "despesa"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`min-h-9 rounded-full border px-3 text-sm ${filter === f ? "border-brand bg-brand text-white" : "border-line"}`}>
            {f === "todos" ? "Todos" : KIND_LABEL[f]}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">Nada registrado ainda.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((l) => {
            const Icon = l.kind === "abastecimento" ? FuelIcon : l.kind === "servico" ? Wrench : Receipt;
            const k = l.kind === "abastecimento" && l.odometer !== null ? kmlByOdo.get(l.odometer) : undefined;
            const title = l.kind === "abastecimento" ? `${(l.liters ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L de ${l.fuel ?? "combustível"}` : (l.subtype ?? "Despesa");
            const details = [
              dmy(l.date),
              l.odometer !== null ? `${kmFmt.format(l.odometer)} km` : null,
              l.pricePerLiterCents ? `${formatBrl(l.pricePerLiterCents)}/L` : null,
              k ? `${k.toFixed(1).replace(".", ",")} km/L` : null,
              l.kind === "abastecimento" && !l.fullTank ? "parcial" : null,
              l.place,
              l.description,
            ].filter(Boolean);
            return (
              <li key={l.id} className="py-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-page text-brand"><Icon size={18} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-muted">{details.join(", ")}</p>
                  </div>
                  <span className="num shrink-0 font-medium">{formatBrl(l.amountCents)}</span>
                  <button type="button" aria-label="Excluir registro" onClick={() => setConfirm(confirm === l.id ? null : l.id)} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted hover:text-danger">
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
                {confirm === l.id && (
                  <div className="mt-2 flex flex-wrap gap-2 pl-12">
                    {l.transactionId && (
                      <button type="button" className="min-h-10 rounded-lg bg-danger px-3 text-sm font-medium text-white" onClick={() => void deleteLog(l, true).then(() => showToast("Registro e despesa excluídos"))}>
                        Excluir registro e a despesa lançada
                      </button>
                    )}
                    <button type="button" className={`min-h-10 rounded-lg px-3 text-sm font-medium ${l.transactionId ? "border border-line" : "bg-danger text-white"}`} onClick={() => void deleteLog(l, false).then(() => showToast("Registro excluído"))}>
                      {l.transactionId ? "Excluir só o registro" : "Confirmar exclusão"}
                    </button>
                    <button type="button" className="min-h-10 px-3 text-sm text-muted" onClick={() => setConfirm(null)}>Cancelar</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
