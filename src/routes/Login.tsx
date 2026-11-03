import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Field, inputClass, PrimaryButton } from "../components/Sheet";

type View = "entrar" | "criar" | "esqueci";

export function Login({ linkExpired = false }: { linkExpired?: boolean }) {
  const [view, setView] = useState<View>(linkExpired ? "esqueci" : "entrar");
  const creating = view === "criar";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Informe o e-mail da sua conta.");
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/nova-senha` });
    setBusy(false);
    if (err) {
      setError(/rate|seconds|too many/i.test(err.message) ? "Muitos pedidos seguidos. Espere um minuto e tente de novo." : `Não consegui enviar: ${err.message}`);
      return;
    }
    setSent(email.trim());
  }

  if (view === "esqueci") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-semibold text-brand-dark">Arvia</h1>
          <p className="mt-1 text-sm text-muted">Redefinir a senha</p>
        </div>
        {linkExpired && !sent && <p role="alert" className="text-sm text-danger">Esse link já foi usado ou expirou. Peça um novo abaixo.</p>}
        {sent ? (
          <div className="flex flex-col gap-3 text-sm">
            <p role="status">Mandei um link para <strong>{sent}</strong>. Abra o e-mail neste aparelho e toque no link para criar a senha nova.</p>
            <p className="text-muted">Não chegou em 2 minutos? Olhe o spam e as abas Promoções e Atualizações do Gmail.</p>
            <button type="button" className="min-h-11 self-start font-medium text-brand underline underline-offset-4" onClick={() => setSent("")}>Mandar de novo</button>
          </div>
        ) : (
          <form onSubmit={sendReset} noValidate className="flex flex-col gap-3">
            <p className="text-sm text-muted">Digite o e-mail da sua conta. Você recebe um link para criar uma senha nova.</p>
            <Field label="E-mail">
              <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <PrimaryButton type="submit" disabled={busy}>{busy ? "Enviando…" : "Mandar link para o e-mail"}</PrimaryButton>
          </form>
        )}
        <button type="button" onClick={() => { setView("entrar"); setError(""); setSent(""); }} className="min-h-11 text-sm font-medium text-brand underline underline-offset-4">Voltar para entrar</button>
      </main>
    );
  }

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
        {!creating && (
          <button type="button" onClick={() => { setView("esqueci"); setError(""); setInfo(""); }} className="min-h-11 self-center text-sm text-muted underline underline-offset-4">
            Esqueci minha senha
          </button>
        )}
      </form>
      <button type="button" onClick={() => { setView(creating ? "entrar" : "criar"); setError(""); setInfo(""); }} className="min-h-11 text-sm font-medium text-brand underline underline-offset-4">
        {creating ? "Já tenho conta. Entrar" : "Criar uma conta"}
      </button>
    </main>
  );
}
