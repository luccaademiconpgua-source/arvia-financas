import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Field, inputClass, PrimaryButton, SecondaryButton } from "../components/Sheet";
import { useAuth } from "../store/auth";

/** Primeiro acesso: criar a casa ou entrar numa casa com o código do convite. Dá para pular e usar só o Pessoal. */
export function HouseSetup({ onSkip }: { onSkip: () => void }) {
  const reload = useAuth((s) => s.reload);
  const [name, setName] = useState("Nossa casa");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError("");
    const { error: err } = await supabase.rpc("create_household", { p_name: name.trim() });
    if (err) setError(err.message);
    else await reload();
    setBusy(false);
  }
  async function join() {
    setBusy(true);
    setError("");
    const { error: err } = await supabase.rpc("join_household", { p_code: code });
    if (err) setError(err.message);
    else await reload();
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-brand-dark">Monte a casa</h1>
        <p className="mt-1 text-sm text-muted">Cada um tem suas finanças pessoais, que só você vê. A casa reúne as contas, o cartão e as metas que vocês dois compartilham.</p>
      </div>
      <section className="flex flex-col gap-3 rounded-card border border-line bg-card p-4">
        <h2 className="font-medium">Criar uma casa</h2>
        <Field label="Nome da casa">
          <input className={inputClass} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <PrimaryButton type="button" disabled={busy || name.trim().length < 2} onClick={() => void create()}>Criar casa e gerar convite</PrimaryButton>
      </section>
      <section className="flex flex-col gap-3 rounded-card border border-line bg-card p-4">
        <h2 className="font-medium">Entrar numa casa</h2>
        <Field label="Código do convite">
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" autoComplete="off" />
        </Field>
        <SecondaryButton type="button" disabled={busy || code.trim().length < 4} onClick={() => void join()}>Entrar na casa</SecondaryButton>
      </section>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="button" onClick={onSkip} className="min-h-11 text-sm font-medium text-brand underline underline-offset-4">Usar só o Pessoal por enquanto</button>
    </main>
  );
}
