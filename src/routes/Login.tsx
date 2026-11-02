import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Field, inputClass, PrimaryButton } from "../components/Sheet";

export function Login() {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Informe um e-mail válido.");
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    setBusy(true);
    if (creating) {
      const { data, error: err } = await supabase.auth.signUp({ email, password, options: { data: { name: name.trim().slice(0, 24) } } });
      if (err) setError(err.message);
      else if (!data.session) setInfo("Conta criada. Abra o e-mail de confirmação e depois entre aqui.");
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : err.message);
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-semibold text-brand-dark">Arvia</h1>
        <p className="mt-1 text-sm text-muted">Suas finanças e as da casa, em um só lugar.</p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        {creating && (
          <Field label="Seu nome">
            <input className={inputClass} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </Field>
        )}
        <Field label="E-mail">
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Senha">
          <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={creating ? "new-password" : "current-password"} />
        </Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {info && <p role="status" className="text-sm text-income">{info}</p>}
        <PrimaryButton type="submit" disabled={busy}>{creating ? "Criar conta" : "Entrar"}</PrimaryButton>
      </form>
      <button type="button" onClick={() => { setCreating((v) => !v); setError(""); setInfo(""); }} className="min-h-11 text-sm font-medium text-brand underline underline-offset-4">
        {creating ? "Já tenho conta. Entrar" : "Criar uma conta"}
      </button>
    </main>
  );
}
