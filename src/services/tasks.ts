import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRefresh } from "../store/refresh";
import type { Mode } from "../types";

export type Task = {
  id: string;
  scope: Mode;
  title: string;
  notes: string | null;
  date: string | null;
  time: string | null; // HH:MM
  priority: "baixa" | "normal" | "alta";
  done: boolean;
  doneAt: string | null;
};
export type TaskInput = { title: string; notes?: string | null; date: string | null; time: string | null; priority: Task["priority"] };

type Row = Record<string, unknown>;
const toTask = (r: Row): Task => ({
  id: String(r["id"]),
  scope: r["scope"] as Mode,
  title: String(r["title"]),
  notes: (r["notes"] as string | null) ?? null,
  date: (r["date"] as string | null) ?? null,
  time: r["time"] ? String(r["time"]).slice(0, 5) : null,
  priority: r["priority"] as Task["priority"],
  done: Boolean(r["done"]),
  doneAt: (r["done_at"] as string | null) ?? null,
});

/** Tarefas pessoais e da casa (as da casa a outra pessoa também vê). */
export function useTasks() {
  const version = useRefresh((s) => s.version);
  const [st, setSt] = useState<{ ready: boolean; tasks: Task[]; error: string }>({ ready: false, tasks: [], error: "" });
  useEffect(() => {
    let alive = true;
    void supabase
      .from("tasks")
      .select("*")
      .or(`done.eq.false,done_at.gte.${new Date(Date.now() - 7 * 86400000).toISOString()}`)
      .order("date", { ascending: true, nullsFirst: false })
      .order("time", { ascending: true, nullsFirst: false })
      .limit(500)
      .then(({ data, error }) => alive && setSt({ ready: true, tasks: (data ?? []).map(toTask), error: error?.message ?? "" }));
    return () => {
      alive = false;
    };
  }, [version]);
  return st;
}

const bump = () => useRefresh.getState().bump();
const check = (r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
};

export async function addTask(scope: Mode, t: TaskInput): Promise<string> {
  const r = await supabase.from("tasks").insert({ scope, title: t.title.slice(0, 120), notes: t.notes ?? null, date: t.date, time: t.time, priority: t.priority }).select("id").single();
  check(r);
  bump();
  return String(r.data?.id ?? "");
}
export async function updateTask(id: string, t: Partial<TaskInput> & { scope?: Mode }) {
  check(await supabase.from("tasks").update(t).eq("id", id));
  bump();
}
export async function setTaskDone(id: string, done: boolean) {
  check(await supabase.from("tasks").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", id));
  bump();
}
export async function deleteTask(id: string) {
  check(await supabase.from("tasks").delete().eq("id", id));
  bump();
}
