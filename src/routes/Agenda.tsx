import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { addDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Sparkles } from "lucide-react";
import { Card, Empty, Pill } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../components/Sheet";
import { todayIso } from "../lib/clock";
import { AiNeedsKey, aiStatus, hasAi, taskFromText } from "../services/ai";
import { addTask, deleteTask, setTaskDone, updateTask, useTasks, type Task } from "../services/tasks";
import { useAuth } from "../store/auth";
import { useUI } from "../store/ui";
import type { Mode } from "../types";

const dayName = (iso: string) => {
  const t = format(parseISO(iso), "EEEE, dd/MM", { locale: ptBR });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type Group = { key: string; title: string; tasks: Task[]; tone?: "danger" };

function groupTasks(tasks: Task[], today: string): Group[] {
  const tomorrow = format(addDays(parseISO(today), 1), "yyyy-MM-dd");
  const weekEnd = format(addDays(parseISO(today), 7), "yyyy-MM-dd");
  const open = tasks.filter((t) => !t.done);
  const g: Group[] = [
    { key: "late", title: "Atrasadas", tasks: open.filter((t) => t.date && t.date < today), tone: "danger" },
    { key: "today", title: `Hoje, ${format(parseISO(today), "dd/MM")}`, tasks: open.filter((t) => t.date === today) },
    { key: "tomorrow", title: "Amanhã", tasks: open.filter((t) => t.date === tomorrow) },
  ];
  const week = open.filter((t) => t.date && t.date > tomorrow && t.date <= weekEnd);
  for (const d of [...new Set(week.map((t) => t.date!))].sort()) g.push({ key: d, title: dayName(d), tasks: week.filter((t) => t.date === d) });
  g.push({ key: "later", title: "Mais para frente", tasks: open.filter((t) => t.date && t.date > weekEnd) });
  g.push({ key: "nodate", title: "Sem data", tasks: open.filter((t) => !t.date) });
  g.push({ key: "done", title: "Feitas nos últimos dias", tasks: tasks.filter((t) => t.done) });
  return g.filter((x) => x.tasks.length > 0);
}

export function Agenda() {
  const { ready, tasks, error } = useTasks();
  const household = useAuth((s) => s.household);
  const showToast = useUI((s) => s.showToast);
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);
  const [editing, setEditing] = useState<null | { task?: Task; draft?: Partial<Task> }>(null);
  const [err, setErr] = useState("");
  const today = todayIso();

  useEffect(() => {
    void aiStatus().then((s) => setAi(hasAi(s)));
  }, []);

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setErr("");
    setBusy(true);
    try {
      if (ai) {
        const task = await taskFromText(t);
        if (!task) throw new Error("Não entendi a tarefa. Tente de outro jeito.");
        await addTask("pessoal", { title: task.title, date: task.date, time: task.time, priority: task.priority });
        showToast(task.date ? `Na agenda para ${format(parseISO(task.date), "dd/MM")}${task.time ? ` às ${task.time}` : ""}` : "Na agenda, sem data");
      } else {
        await addTask("pessoal", { title: t, date: today, time: null, priority: "normal" });
        showToast("Na agenda para hoje");
      }
      setText("");
    } catch (e2) {
      if (e2 instanceof AiNeedsKey) {
        await addTask("pessoal", { title: t, date: today, time: null, priority: "normal" });
        setText("");
      } else setErr(e2 instanceof Error ? e2.message : "Não consegui salvar.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Empty>{error || "Carregando…"}</Empty>;
  const groups = groupTasks(tasks, today);
  const todayCount = tasks.filter((t) => !t.done && t.date === today).length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="font-display text-lg font-semibold">Minhas demandas</h2>
        <p className="text-sm text-muted">
          {ai ? "Escreva do seu jeito, como \"dentista quinta às 15h\" ou \"pagar IPVA até sexta, urgente\". A IA entende a data e a hora." : "Escreva a tarefa. Com a IA ligada nos Ajustes, dá para escrever a data do seu jeito (\"quinta 15h\")."}
        </p>
        <form onSubmit={quickAdd} className="mt-3 flex gap-2">
          <label className="sr-only" htmlFor="nova-tarefa">Nova tarefa</label>
          <input id="nova-tarefa" className={`${inputClass} min-w-0 flex-1`} value={text} onChange={(e) => setText(e.target.value)} placeholder="O que você precisa fazer?" autoComplete="off" />
          <PrimaryButton type="submit" aria-label="Adicionar tarefa" disabled={busy}><Plus size={18} aria-hidden="true" /></PrimaryButton>
        </form>
        {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <SecondaryButton type="button" onClick={() => setEditing({ draft: { date: today } })}>Nova com detalhes</SecondaryButton>
          <SecondaryButton type="button" className="flex items-center gap-1" onClick={() => navigate(`/assistente?q=${encodeURIComponent("Organize meu dia de hoje com base na minha agenda")}`)}>
            <Sparkles size={16} aria-hidden="true" /> Organizar meu dia
          </SecondaryButton>
        </div>
      </Card>

      {groups.length === 0 ? (
        <Card><Empty>Nada na agenda. Hoje está livre{todayCount ? "" : "."}</Empty></Card>
      ) : (
        groups.map((g) => (
          <Card key={g.key} title={`${g.title} (${g.tasks.length})`}>
            <ul className="divide-y divide-line">
              {g.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <input type="checkbox" className="size-6 shrink-0 accent-brand" aria-label={`${t.done ? "Desmarcar" : "Concluir"} ${t.title}`} checked={t.done} onChange={(e) => void setTaskDone(t.id, e.target.checked)} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing({ task: t })}>
                    <span className={`block truncate text-sm font-medium ${t.done ? "text-muted line-through" : g.tone === "danger" ? "text-danger" : ""}`}>{t.title}</span>
                    <span className="block text-xs text-muted">
                      {[t.time, g.key === "late" || g.key === "later" || g.key === "done" ? (t.date ? format(parseISO(t.date), "dd/MM") : null) : null, t.notes].filter(Boolean).join(", ")}
                    </span>
                  </button>
                  {t.priority === "alta" && !t.done && <Pill tone="danger">Alta</Pill>}
                  {t.scope === "casa" && <Pill tone="neutral">Casa</Pill>}
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
      {editing && <TaskSheet {...(editing.task ? { task: editing.task } : {})} draft={editing.draft ?? {}} hasHouse={!!household} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TaskSheet({ task, draft, hasHouse, onClose }: { task?: Task; draft: Partial<Task>; hasHouse: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? draft.title ?? "");
  const [date, setDate] = useState(task?.date ?? draft.date ?? "");
  const [time, setTime] = useState(task?.time ?? "");
  const [priority, setPriority] = useState<Task["priority"]>(task?.priority ?? "normal");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [scope, setScope] = useState<Mode>(task?.scope ?? "pessoal");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet title={task ? "Editar tarefa" : "Nova tarefa"} onClose={onClose}>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return setError("Escreva o que precisa fazer.");
          const input = { title: title.trim(), date: date || null, time: time || null, priority, notes: notes.trim() || null };
          void (task ? updateTask(task.id, { ...input, scope }) : addTask(scope, input)).then(onClose).catch((err: Error) => setError(err.message));
        }}
      >
        <Field label="O que fazer"><input className={inputClass} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Hora (opcional)"><input className={inputClass} type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <div role="radiogroup" aria-label="Prioridade" className="grid grid-cols-3 gap-1">
          {(["baixa", "normal", "alta"] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)} className={`min-h-11 rounded-lg border text-sm capitalize ${priority === p ? "border-brand bg-brand text-white" : "border-line"}`}>{p}</button>
          ))}
        </div>
        {hasHouse && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="size-5 accent-brand" checked={scope === "casa"} onChange={(e) => setScope(e.target.checked ? "casa" : "pessoal")} />
            Tarefa da casa (a outra pessoa também vê)
          </label>
        )}
        <Field label="Observação (opcional)"><textarea className={`${inputClass} min-h-20 py-2`} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <PrimaryButton type="submit" className="flex-1">Salvar</PrimaryButton>
          <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
        </div>
        {task && (
          <div className="border-t border-line pt-3 text-sm">
            {!confirm ? (
              <button type="button" className="min-h-11 text-muted underline" onClick={() => setConfirm(true)}>Excluir tarefa</button>
            ) : (
              <button type="button" className="min-h-11 rounded-lg bg-danger px-3 font-medium text-white" onClick={() => void deleteTask(task.id).then(onClose)}>Confirmar exclusão</button>
            )}
          </div>
        )}
      </form>
    </Sheet>
  );
}
