import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRefresh } from "../store/refresh";
import type { Budget } from "../lib/budget";
import type { Mode } from "../types";

export function useBudgets(mode: Mode) {
  const version = useRefresh((s) => s.version);
  const [state, setState] = useState<{ list: Budget[] | null; mode: Mode | null }>({ list: null, mode: null });
  useEffect(() => {
    let alive = true;
    void supabase
      .from("budgets")
      .select("id, category_id, limit_cents, savings_pct")
      .eq("scope", mode)
      .then(({ data }) => {
        if (!alive) return;
        setState({
          mode,
          list: (data ?? []).map((r) => ({
            id: String(r.id),
            categoryId: (r.category_id as string | null) ?? null,
            limitCents: r.limit_cents === null ? null : Number(r.limit_cents),
            savingsPct: r.savings_pct === null ? null : Number(r.savings_pct),
          })),
        });
      });
    return () => {
      alive = false;
    };
  }, [mode, version]);
  return { ready: state.list !== null && state.mode === mode, budgets: state.list ?? [] };
}

const bump = () => useRefresh.getState().bump();
const check = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
};

export async function setCategoryLimit(mode: Mode, existing: Budget | undefined, categoryId: string, limitCents: number) {
  check(existing ? await supabase.from("budgets").update({ limit_cents: limitCents }).eq("id", existing.id) : await supabase.from("budgets").insert({ scope: mode, category_id: categoryId, limit_cents: limitCents }));
  bump();
}

export async function setSavingsPct(mode: Mode, existing: Budget | undefined, pct: number | null) {
  if (pct === null) {
    if (existing) check(await supabase.from("budgets").delete().eq("id", existing.id));
  } else {
    check(existing ? await supabase.from("budgets").update({ savings_pct: pct }).eq("id", existing.id) : await supabase.from("budgets").insert({ scope: mode, savings_pct: pct }));
  }
  bump();
}

export async function removeBudget(id: string) {
  check(await supabase.from("budgets").delete().eq("id", id));
  bump();
}
