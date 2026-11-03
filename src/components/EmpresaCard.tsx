import { useState } from "react";
import { Briefcase } from "lucide-react";
import { Card } from "./ui";
import { Field, inputClass, PrimaryButton, SecondaryButton } from "./Sheet";
import { useScopeData } from "../hooks/useScopeData";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";
import { usePrefs } from "../store/prefs";
import { useRefresh } from "../store/refresh";
import { useUI } from "../store/ui";

/** Espaço Empresa: só o próprio usuário vê. Ativa, e escolhe quais contas e cartões são da empresa. */
export function EmpresaCard() {
  const profile = useAuth((s) => s.profile);
  const reload = useAuth((s) => s.reload);
  const setMode = usePrefs((s) => s.setMode);
  const showToast = useUI((s) => s.showToast);
  const enabled = !!profile?.empresaName;
  const pessoal = useScopeData("pessoal");
  const empresa = useScopeData("empresa", enabled);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error: err } = await supabase.rpc("enable_empresa", { p_name: name.trim() });
    if (err) return setError(err.message);
    await reload();
    showToast("Espaço Empresa criado");
  }

  async function move(kind: "account" | "card", id: string, to: "pessoal" | "empresa", label: string) {
    setBusy(id);
    setError("");
    const { data, error: err } = await supabase.rpc("move_to_scope", { p_kind: kind, p_id: id, p_scope: to });
    setBusy(null);
    if (err) return setError(err.message);
    useRefresh.getState().bump();
    showToast(`${label} foi para ${to === "empresa" ? "a Empresa" : "o Pessoal"}${Number(data) ? ` com ${data} lançamentos` : ""}`);
  }

  if (!enabled) {
    return (
      <Card title="Empresa">
        <p className="text-sm text-muted">
          Separe o dinheiro do CNPJ do seu dinheiro pessoal: contas, cartões, categorias e relatórios próprios da empresa. Só você vê, mesmo morando com alguém na Casa.
        </p>
        <form onSubmit={enable} noValidate className="mt-3 flex flex-col gap-3">
          <Field label="Nome da empresa" error={error}>
            <input className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="ARVIA Capital" />
          </Field>
          <PrimaryButton type="submit" className="flex items-center gap-2 self-start" disabled={name.trim().length < 2}>
            <Briefcase size={18} aria-hidden="true" /> Criar o espaço Empresa
          </PrimaryButton>
        </form>
      </Card>
    );
  }

  const rows = [
    ...pessoal.accounts.map((a) => ({ kind: "account" as const, id: a.id, label: a.name, where: "pessoal" as const })),
    ...pessoal.cards.map((c) => ({ kind: "card" as const, id: c.id, label: `Cartão ${c.label}`, where: "pessoal" as const })),
    ...empresa.accounts.map((a) => ({ kind: "account" as const, id: a.id, label: a.name, where: "empresa" as const })),
    ...empresa.cards.map((c) => ({ kind: "card" as const, id: c.id, label: `Cartão ${c.label}`, where: "empresa" as const })),
  ].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <Card title={`Empresa: ${profile?.empresaName}`}>
      <p className="text-sm text-muted">
        Só você vê. Escolha quais contas e cartões são da empresa: os lançamentos vão junto, e o que chegar depois pelo Open Finance já entra no lugar certo. Pix entre a empresa e você aparece como retirada na Empresa e entrada no Pessoal.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nenhuma conta ainda. Conecte o banco da empresa em Open Finance e depois volte aqui.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.label}</span>
                <span className="text-xs text-muted">{r.where === "empresa" ? "Na Empresa" : "No Pessoal"}</span>
              </span>
              <SecondaryButton type="button" disabled={busy === r.id} onClick={() => void move(r.kind, r.id, r.where === "empresa" ? "pessoal" : "empresa", r.label)}>
                {busy === r.id ? "Movendo…" : r.where === "empresa" ? "Voltar para Pessoal" : "É da empresa"}
              </SecondaryButton>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <button type="button" onClick={() => setMode("empresa")} className="mt-3 min-h-11 text-sm font-medium text-brand underline underline-offset-4">Abrir a Empresa</button>
    </Card>
  );
}
