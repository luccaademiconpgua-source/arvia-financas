// Cálculos do módulo de veículos (consumo, custo por km, km rodados, lembretes).

export type Fuel = "gasolina" | "etanol" | "diesel" | "gnv" | "eletrico";
export type VehicleFuel = "flex" | Fuel;

export type Vehicle = {
  id: string;
  scope: "pessoal" | "casa" | "empresa";
  name: string;
  plate: string | null;
  fuel: VehicleFuel;
  initialOdometer: number;
};

export type VehicleLog = {
  id: string;
  vehicleId: string;
  kind: "abastecimento" | "servico" | "despesa";
  date: string;
  odometer: number | null;
  liters: number | null;
  pricePerLiterCents: number | null;
  fuel: Fuel | null;
  fullTank: boolean;
  subtype: string | null;
  description: string | null;
  place: string | null;
  amountCents: number;
  transactionId: string | null;
  /** nota fiscal do posto que gerou este abastecimento */
  nfceId?: string | null;
};

export type Reminder = {
  id: string;
  vehicleId: string;
  title: string;
  everyKm: number | null;
  everyMonths: number | null;
  lastKm: number | null;
  lastDate: string | null;
};

export const SERVICE_TYPES = [
  "Troca de óleo",
  "Filtros",
  "Revisão",
  "Pneus",
  "Freios",
  "Alinhamento e balanceamento",
  "Bateria",
  "Suspensão",
  "Ar-condicionado",
  "Funilaria e pintura",
  "Outro serviço",
] as const;

export const EXPENSE_TYPES = [
  "IPVA",
  "Licenciamento",
  "Seguro",
  "Multa",
  "Pedágio",
  "Estacionamento",
  "Lavagem",
  "Financiamento",
  "Outra despesa",
] as const;

export const FUEL_LABEL: Record<VehicleFuel, string> = {
  flex: "Flex",
  gasolina: "Gasolina",
  etanol: "Etanol",
  diesel: "Diesel",
  gnv: "GNV",
  eletrico: "Elétrico",
};

/** Consumo de um trecho entre dois tanques cheios. */
export type ConsumptionPoint = { date: string; odometer: number; km: number; liters: number; kmPerLiter: number; fuel: Fuel | null };

/**
 * Método do tanque cheio: o consumo só é calculado entre dois abastecimentos de tanque cheio.
 * Os litros de abastecimentos parciais no meio do caminho entram na conta do próximo cheio.
 */
export function consumption(logs: VehicleLog[]): ConsumptionPoint[] {
  const fills = logs
    .filter((l) => l.kind === "abastecimento" && l.odometer !== null && l.liters !== null && l.liters > 0)
    .sort((a, b) => a.odometer! - b.odometer! || a.date.localeCompare(b.date));
  const out: ConsumptionPoint[] = [];
  let lastFullOdo: number | null = null;
  let acc = 0;
  for (const f of fills) {
    if (lastFullOdo === null) {
      if (f.fullTank) lastFullOdo = f.odometer!;
      continue;
    }
    acc += f.liters!;
    if (f.fullTank) {
      const km = f.odometer! - lastFullOdo;
      if (km > 0 && acc > 0) {
        out.push({ date: f.date, odometer: f.odometer!, km, liters: acc, kmPerLiter: km / acc, fuel: f.fuel });
      }
      lastFullOdo = f.odometer!;
      acc = 0;
    }
  }
  return out;
}

export function averageKmPerLiter(points: ConsumptionPoint[], fuel?: Fuel): number | null {
  const ps = fuel ? points.filter((p) => p.fuel === fuel) : points;
  const km = ps.reduce((s, p) => s + p.km, 0);
  const l = ps.reduce((s, p) => s + p.liters, 0);
  return l > 0 ? km / l : null;
}

/** Maior hodômetro conhecido (registros ou o inicial). */
export function currentOdometer(v: Vehicle, logs: VehicleLog[]): number {
  return logs.reduce((m, l) => (l.odometer !== null && l.odometer > m ? l.odometer : m), v.initialOdometer);
}

/** Primeiro hodômetro conhecido (o inicial, ou o menor registro se o inicial ficou zerado). */
function firstOdometer(v: Vehicle, logs: VehicleLog[]): number {
  if (v.initialOdometer > 0) return v.initialOdometer;
  const odos = logs.map((l) => l.odometer).filter((o): o is number => o !== null);
  return odos.length ? Math.min(...odos) : 0;
}

export function kmDriven(v: Vehicle, logs: VehicleLog[]): number {
  return Math.max(0, currentOdometer(v, logs) - firstOdometer(v, logs));
}

export function totalCost(logs: VehicleLog[]): number {
  return logs.reduce((s, l) => s + l.amountCents, 0);
}

/** Custo por km rodado, em centavos. */
export function costPerKm(v: Vehicle, logs: VehicleLog[]): number | null {
  const km = kmDriven(v, logs);
  return km > 0 ? totalCost(logs) / km : null;
}

/** Custo de combustível por km, em centavos. */
export function fuelCostPerKm(v: Vehicle, logs: VehicleLog[]): number | null {
  const km = kmDriven(v, logs);
  const fuel = logs.filter((l) => l.kind === "abastecimento").reduce((s, l) => s + l.amountCents, 0);
  return km > 0 && fuel > 0 ? fuel / km : null;
}

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const monthKey = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;

export type MonthRow = { ym: string; combustivel: number; servicos: number; despesas: number; km: number | null };

/** Custos e km rodados mês a mês, nos últimos `n` meses até `todayYm`. */
export function monthly(logs: VehicleLog[], todayYm: string, n = 6): MonthRow[] {
  const end = monthIndex(todayYm + "-01");
  const rows: MonthRow[] = [];
  const odoByMonth = new Map<number, number>();
  for (const l of logs) {
    if (l.odometer === null) continue;
    const i = monthIndex(l.date);
    odoByMonth.set(i, Math.max(odoByMonth.get(i) ?? 0, l.odometer));
  }
  const sortedOdo = [...odoByMonth.entries()].sort((a, b) => a[0] - b[0]);
  const lastOdoBefore = (i: number) => {
    let v: number | null = null;
    for (const [m, o] of sortedOdo) if (m < i) v = o;
    return v;
  };
  for (let i = end - n + 1; i <= end; i++) {
    const inM = logs.filter((l) => monthIndex(l.date) === i);
    const sum = (k: VehicleLog["kind"]) => inM.filter((l) => l.kind === k).reduce((s, l) => s + l.amountCents, 0);
    const cur = odoByMonth.get(i);
    const prev = lastOdoBefore(i);
    rows.push({
      ym: monthKey(i),
      combustivel: sum("abastecimento"),
      servicos: sum("servico"),
      despesas: sum("despesa"),
      km: cur !== undefined && prev !== null ? Math.max(0, cur - prev) : null,
    });
  }
  return rows;
}

/** Média de km por mês considerando todo o histórico com hodômetro. */
export function kmPerMonth(logs: VehicleLog[]): number | null {
  const withOdo = logs.filter((l) => l.odometer !== null).sort((a, b) => a.date.localeCompare(b.date));
  if (withOdo.length < 2) return null;
  const first = withOdo[0]!;
  const last = withOdo[withOdo.length - 1]!;
  const days = (Date.parse(last.date) - Date.parse(first.date)) / 86400000;
  if (days < 7) return null;
  const km = Math.max(...withOdo.map((l) => l.odometer!)) - Math.min(...withOdo.map((l) => l.odometer!));
  return (km / days) * 30.44;
}

// ---------- Etanol ou gasolina ----------

export type FlexAdvice = { ratio: number; best: "etanol" | "gasolina"; byOwnAverage: boolean; costPerKmEtanol?: number; costPerKmGasolina?: number };

/**
 * Regra dos 70%: etanol compensa se custar até 70% da gasolina.
 * Com médias próprias dos dois combustíveis, compara o custo por km real do carro.
 */
export function flexAdvice(etanolCents: number, gasolinaCents: number, kmlEtanol?: number | null, kmlGasolina?: number | null): FlexAdvice | null {
  if (etanolCents <= 0 || gasolinaCents <= 0) return null;
  const ratio = etanolCents / gasolinaCents;
  if (kmlEtanol && kmlGasolina) {
    const e = etanolCents / kmlEtanol;
    const g = gasolinaCents / kmlGasolina;
    return { ratio, best: e <= g ? "etanol" : "gasolina", byOwnAverage: true, costPerKmEtanol: e, costPerKmGasolina: g };
  }
  return { ratio, best: ratio <= 0.7 ? "etanol" : "gasolina", byOwnAverage: false };
}

// ---------- Lembretes ----------

export type ReminderStatus = {
  state: "ok" | "breve" | "vencido";
  nextKm: number | null;
  kmLeft: number | null;
  nextDate: string | null;
  daysLeft: number | null;
};

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function reminderStatus(r: Reminder, odometer: number, today: string): ReminderStatus {
  const nextKm = r.everyKm && r.lastKm !== null ? r.lastKm + r.everyKm : null;
  const kmLeft = nextKm !== null ? nextKm - odometer : null;
  const nextDate = r.everyMonths && r.lastDate ? addMonths(r.lastDate, r.everyMonths) : null;
  const daysLeft = nextDate ? Math.round((Date.parse(nextDate) - Date.parse(today)) / 86400000) : null;
  let state: ReminderStatus["state"] = "ok";
  if ((kmLeft !== null && kmLeft <= 0) || (daysLeft !== null && daysLeft <= 0)) state = "vencido";
  else if ((kmLeft !== null && kmLeft <= 500) || (daysLeft !== null && daysLeft <= 15)) state = "breve";
  return { state, nextKm, kmLeft, nextDate, daysLeft };
}

/** Valor total do abastecimento a partir de litros e preço, ou o preço a partir do total. */
export function fillMath(input: { liters?: number | null; priceCents?: number | null; totalCents?: number | null }) {
  const { liters, priceCents, totalCents } = input;
  if (liters && priceCents && !totalCents) return { liters, priceCents, totalCents: Math.round(liters * priceCents) };
  if (liters && totalCents && !priceCents) return { liters, totalCents, priceCents: Math.round(totalCents / liters) };
  if (priceCents && totalCents && !liters) return { priceCents, totalCents, liters: Math.round((totalCents / priceCents) * 1000) / 1000 };
  return { liters: liters ?? null, priceCents: priceCents ?? null, totalCents: totalCents ?? null };
}
