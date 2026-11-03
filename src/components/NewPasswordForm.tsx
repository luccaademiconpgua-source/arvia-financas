import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Field, inputClass, PrimaryButton } from "./Sheet";

/** Cria a senha nova da conta logada (pelos Ajustes ou pelo link de recuperação do e-mail). */
export function NewPasswordForm({ onDone, cta = "Salvar nova senha" }: { onDone: () => void; cta?: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pw.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (pw !== pw2) return setError("As duas senhas não estão iguais.");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) {
      setError(/same/i.test(err.message) ? "A senha nova precisa ser diferente da anterior." : /weak|short/i.test(err.message) ? "Senha fraca. Use letras e números, com pelo menos 8 caracteres." : err.message);
      return;
    }
    setPw("");
    setPw2("");
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <Field label="Senha nova">
        <div className="relative">
          <input className={`${inputClass} pr-12`} type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Esconder senha" : "Mostrar senha"} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted">
            {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
      </Field>
      <Field label="Repita a senha nova">
        <input className={inputClass} type={show ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      </Field>
      <p className="-mt-1 text-xs text-muted">Pelo menos 8 caracteres.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <PrimaryButton type="submit" disabled={busy}>{busy ? "Salvando…" : cta}</PrimaryButton>
    </form>
  );
}
