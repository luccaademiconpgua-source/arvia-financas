import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRefresh } from "../store/refresh";
import { addTransaction, deleteTransaction } from "../store/actions";
import type { Mode, Transaction } from "../types";
import type { Fuel, Reminder, Vehicle, VehicleFuel, VehicleLog } from "../lib/vehicle";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

const toVehicle = (r: Row): Vehicle => ({
  id: String(r["id"]),
  scope: r["scope"] as Vehicle["scope"],
  name: String(r["name"]),
  plate: str(r["plate"]),
  fuel: r["fuel"] as VehicleFuel,
  initialOdometer: Number(r["initial_odometer"] ?? 0),
});

const toLog = (r: Row): VehicleLog => ({
  id: String(r["id"]),
  vehicleId: String(r["vehicle_id"]),
  kind: r["kind"] as VehicleLog["kind"],
  date: String(r["date"]),
  odometer: num(r["odometer"]),
  liters: num(r["liters"]),
  pricePerLiterCents: num(r["price_per_liter_cents"]),
  fuel: str(r["fuel"]) as Fuel | null,
  fullTank: Boolean(r["full_tank"]),
  subtype: str(r["subtype"]),
  description: str(r["description"]),
  place: str(r["place"]),
  amountCents: Number(r["amount_cents"] ?? 0),
  transactionId: str(r["transaction_id"]),
});

const toReminder = (r: Row): Reminder => ({
  id: String(r["id"]),
  vehicleId: String(r["vehicle_id"]),
  title: String(r["title"]),
  everyKm: num(r["every_km"]),
  everyMonths: num(r["every_months"]),
  lastKm: num(r["last_km"]),
  lastDate: str(r["last_date"]),
});

export type VehicleData = { vehicles: Vehicle[]; logs: VehicleLog[]; reminders: Reminder[] };

async function fetchAll(mode: Mode): Promise<VehicleData> {
  const [v, l, r] = await Promise.all([
    supabase.from("vehicles").select("*").eq("scope", mode).order("created_at"),
    supabase.from("vehicle_logs").select("*").eq("scope", mode).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(5000),
    supabase.from("vehicle_reminders").select("*").eq("scope", mode).order("created_at"),
  ]);
  const err = v.error ?? l.error ?? r.error;
  if (err) throw new Error(err.message);
  return { vehicles: (v.data ?? []).map(toVehicle), logs: (l.data ?? []).map(toLog), reminders: (r.data ?? []).map(toReminder) };
}

export function useVehicles(mode: Mode) {
  const version = useRefresh((s) => s.version);
  const [state, setState] = useState<{ data: VehicleData | null; error: string; mode: Mode | null }>({ data: null, error: "", mode: null });
  useEffect(() => {
    let alive = true;
    fetchAll(mode).then(
      (data) => alive && setState({ data, error: "", mode }),
      (e: unknown) => alive && setState((s) => ({ ...s, error: e instanceof Error ? e.message : "Erro ao carregar.", mode })),
    );
    return () => {
      alive = false;
    };
  }, [mode, version]);
  return { ready: state.data !== null && state.mode === mode, error: state.error, ...(state.data ?? { vehicles: [], logs: [], reminders: [] }) };
}

const bump = () => useRefresh.getState().bump();
const check = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
};

export async function createVehicle(mode: Mode, v: { name: string; plate: string | null; fuel: VehicleFuel; initialOdometer: number }) {
  check(await supabase.from("vehicles").insert({ scope: mode, name: v.name, plate: v.plate, fuel: v.fuel, initial_odometer: v.initialOdometer }));
  bump();
}

export async function deleteVehicle(id: string) {
  check(await supabase.from("vehicles").delete().eq("id", id));
  bump();
}

export type Payment = { accountId?: string; cardId?: string; payment: Transaction["payment"]; categoryId?: string };

export type NewLog = Omit<VehicleLog, "id" | "transactionId">;

/** Grava o registro e, se pedido, também lança a despesa na conta ou no cartão. */
export async function addLog(mode: Mode, log: NewLog, pay: Payment | null, vehicleName: string) {
  let transactionId: string | null = null;
  if (pay && log.amountCents > 0) {
    const what = log.kind === "abastecimento" ? `Combustível ${(log.liters ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L` : (log.subtype ?? "Despesa do veículo");
    transactionId = await addTransaction({
      mode,
      type: "despesa",
      description: `${what} (${vehicleName})`.slice(0, 80),
      amountCents: log.amountCents,
      date: log.date,
      payment: pay.cardId ? "credito" : pay.payment,
      categoryId: pay.categoryId,
      accountId: pay.accountId,
      cardId: pay.cardId,
    });
  }
  const res = await supabase.from("vehicle_logs").insert({
    vehicle_id: log.vehicleId,
    kind: log.kind,
    date: log.date,
    odometer: log.odometer,
    liters: log.liters,
    price_per_liter_cents: log.pricePerLiterCents,
    fuel: log.fuel,
    full_tank: log.fullTank,
    subtype: log.subtype,
    description: log.description,
    place: log.place,
    amount_cents: log.amountCents,
    transaction_id: transactionId,
  });
  if (res.error) {
    if (transactionId) await deleteTransaction(transactionId).catch(() => undefined);
    throw new Error(res.error.message);
  }
  bump();
}

export async function deleteLog(log: VehicleLog, alsoTransaction: boolean) {
  check(await supabase.from("vehicle_logs").delete().eq("id", log.id));
  if (alsoTransaction && log.transactionId) await deleteTransaction(log.transactionId);
  bump();
}

export async function saveReminder(r: Omit<Reminder, "id"> & { id?: string }) {
  const row = { vehicle_id: r.vehicleId, title: r.title, every_km: r.everyKm, every_months: r.everyMonths, last_km: r.lastKm, last_date: r.lastDate };
  check(r.id ? await supabase.from("vehicle_reminders").update(row).eq("id", r.id) : await supabase.from("vehicle_reminders").insert(row));
  bump();
}

/** Marca como feito o lembrete com o mesmo nome do serviço (se existir). */
export async function markReminderDone(vehicleId: string, title: string, km: number | null, date: string) {
  const row: Record<string, unknown> = { last_date: date };
  if (km !== null) row["last_km"] = km;
  check(await supabase.from("vehicle_reminders").update(row).eq("vehicle_id", vehicleId).ilike("title", title));
  bump();
}

export async function deleteReminder(id: string) {
  check(await supabase.from("vehicle_reminders").delete().eq("id", id));
  bump();
}
