import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRefresh } from "../store/refresh";
import type { Asset, AssetKind } from "../lib/networth";
import type { Mode } from "../types";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export type Snapshot = { month: string; assetsCents: number; liabilitiesCents: number };

export function useNetWorthData(mode: Mode) {
  const version = useRefresh((s) => s.version);
  const [st, setSt] = useState<{ mode: Mode | null; assets: Asset[]; snapshots: Snapshot[]; error: string }>({ mode: null, assets: [], snapshots: [], error: "" });
  useEffect(() => {
    let alive = true;
    void Promise.all([
      supabase.from("assets").select("*").eq("scope", mode).order("created_at"),
      supabase.from("networth_snapshots").select("month,assets_cents,liabilities_cents").eq("scope", mode).order("month"),
    ]).then(([a, s]) => {
      if (!alive) return;
      const err = a.error ?? s.error;
      if (err) return setSt((x) => ({ ...x, mode, error: err.message }));
      setSt({
        mode,
        error: "",
        assets: (a.data ?? []).map((r: Row) => ({
          id: String(r["id"]), kind: r["kind"] as AssetKind, name: String(r["name"]), valueCents: num(r["value_cents"]), vehicleId: (r["vehicle_id"] as string | null) ?? null,
          administrator: (r["administrator"] as string | null) ?? null, creditCents: num(r["credit_cents"]), termMonths: num(r["term_months"]), paidMonths: num(r["paid_months"]),
          installmentCents: num(r["installment_cents"]), contemplated: Boolean(r["contemplated"]), updatedAt: String(r["updated_at"]),
        })),
        snapshots: (s.data ?? []).map((r: Row) => ({ month: String(r["month"]), assetsCents: Number(r["assets_cents"]), liabilitiesCents: Number(r["liabilities_cents"]) })),
      });
    });
    return () => {
      alive = false;
    };
  }, [mode, version]);
  return { ready: st.mode === mode, ...st };
}

export type AssetInput = Omit<Asset, "id" | "updatedAt">;
const toRow = (a: AssetInput) => ({
  kind: a.kind, name: a.name, value_cents: a.valueCents, vehicle_id: a.vehicleId, administrator: a.administrator, credit_cents: a.creditCents,
  term_months: a.termMonths, paid_months: a.paidMonths, installment_cents: a.installmentCents, contemplated: a.contemplated, updated_at: new Date().toISOString(),
});

export async function saveAsset(mode: Mode, a: AssetInput, id?: string) {
  const r = id ? await supabase.from("assets").update(toRow(a)).eq("id", id) : await supabase.from("assets").insert({ scope: mode, ...toRow(a) });
  if (r.error) throw new Error(r.error.message);
  useRefresh.getState().bump();
}
export async function deleteAsset(id: string) {
  const r = await supabase.from("assets").delete().eq("id", id);
  if (r.error) throw new Error(r.error.message);
  useRefresh.getState().bump();
}
/** Foto do mês (sem bump: não precisa recarregar a tela por causa dela). */
export async function saveSnapshot(mode: Mode, month: string, assetsCents: number, liabilitiesCents: number) {
  await supabase.rpc("save_networth_snapshot", { p_scope: mode, p_month: month, p_assets: assetsCents, p_liabilities: liabilitiesCents });
}
