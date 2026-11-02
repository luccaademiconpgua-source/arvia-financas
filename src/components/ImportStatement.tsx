import { useMemo, useRef, useState } from "react";
import { Card } from "./ui";
import { Field, inputClass, PrimaryButton, SecondaryButton } from "./Sheet";
import { useModeData } from "../hooks/useModeData";
import { useUI } from "../store/ui";
import { adjustBalance, afterDataChange, importStatement, type ImportRow } from "../store/actions";
import { formatBrl } from "../lib/money";
import { cleanMerchantName, decodeStatement, looksInverted, parseStatement, suggestStatementCategory, type Statement } from "../lib/statement";
import type { Transaction } from "../types";

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

/** Cartão: compras aparecem como valor positivo em vários bancos (ex.: fatura Nubank em CSV). */
function guessInvert(st: Statement, dest: string, txs: readonly Transaction[]) {
  const isCard = dest.startsWith("c:");
  const id = dest.slice(2);
  const known = txs.filter((t) => (isCard ? t.cardId === id : t.accountId === id) && (t.source === "open_finance" || t.source === "manual"));
  if (looksInverted(st.rows, known)) return true;
  if (!isCard) return false;
  const pos = st.rows.filter((r) => r.amountCents > 0).length;
  return pos > st.rows.length / 2;
}

export function ImportStatement() {
  const { accounts, cards, categories, mode, transactions } = useModeData();
  const showToast = useUI((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [st, setSt] = useState<Statement | null>(null);
  const [dest, setDest] = useState("");
  const [invert, setInvert] = useState(false);
  const [autoInv, setAutoInv] = useState(false);
  const [fixBalance, setFixBalance] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isCard = dest.startsWith("c:");
  const destId = dest.slice(2);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setError("");
    setSt(null);
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return setError("Arquivo grande demais (máximo 5 MB).");
    try {
      const parsed = parseStatement(decodeStatement(await f.arrayBuffer()), f.name);
      const first = dest || (accounts[0] ? `a:${accounts[0].id}` : cards[0] ? `c:${cards[0].id}` : "");
      setFileName(f.name);
      setSt(parsed);
      setDest(first);
      const g = guessInvert(parsed, first, transactions);
      setInvert(g);
      setAutoInv(g && !first.startsWith("c:"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui ler o arquivo.");
    }
  }

  function changeDest(v: string) {
    setDest(v);
    if (st) {
      const g = guessInvert(st, v, transactions);
      setInvert(g);
      setAutoInv(g && !v.startsWith("c:"));
    }
  }

  const prepared = useMemo(() => {
    if (!st || !destId) return null;
    const rows: ImportRow[] = [];
    let ignored = 0;
    let inCents = 0;
    let outCents = 0;
    for (const r of st.rows) {
      const signed = invert ? -r.amountCents : r.amountCents;
      const type = signed < 0 ? "despesa" : "receita";
      if (isCard && type === "receita") {
        ignored++;
        continue;
      }
      const catName = suggestStatementCategory(r.description, type);
      const cat = categories.find((c) => c.kind === type && c.name === catName);
      if (type === "receita") inCents += signed;
      else outCents += -signed;
      rows.push({
        external_id: `ext:${destId}:${r.key}`,
        type,
        amount_cents: Math.abs(signed),
        date: r.date,
        description: cleanMerchantName(r.description),
        category_id: cat?.id,
      });
    }
    const dates = rows.map((r) => r.date).sort();
    return { rows, ignored, inCents, outCents, from: dates[0], to: dates[dates.length - 1] };
  }, [st, destId, invert, isCard, categories]);

  const account = !isCard ? accounts.find((a) => a.id === destId) : undefined;
  const canFixBalance = !!account && st?.balanceCents !== undefined && st.balanceCents !== account.balanceCents;

  function reset() {
    setSt(null);
    setFileName("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onImport() {
    if (!prepared || prepared.rows.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await importStatement(isCard ? { cardId: destId } : { accountId: destId }, prepared.rows);
      await afterDataChange().catch(() => undefined);
      if (canFixBalance && fixBalance && account && st?.balanceCents !== undefined) {
        await adjustBalance(account.id, st.balanceCents);
      }
      const parts = [`${res.inserted} ${res.inserted === 1 ? "lançamento importado" : "lançamentos importados"}`];
      if (res.enriched > 0) parts.push(`${res.enriched} do banco ganharam o nome da loja`);
      if (res.skipped > 0) parts.push(`${res.skipped} já existiam`);
      showToast(parts.join(", "));
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar.");
    } finally {
      setBusy(false);
    }
  }

  const noTargets = accounts.length === 0 && cards.length === 0;

  return (
    <Card title="Importar extrato">
      <p className="text-sm text-muted">
        Baixe o extrato no app ou site do banco em OFX (o mais completo) ou CSV e escolha o arquivo aqui. Funciona com qualquer banco. Se a conta já recebe o Open Finance, o que já veio não duplica: o extrato só completa o nome da loja em lançamentos como "DÉBITO DE CARTÃO".
      </p>

      {noTargets ? (
        <p className="mt-3 text-sm">
          Crie uma conta ou um cartão {mode === "casa" ? "da casa " : ""}antes de importar.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Arquivo do extrato">
            <input
              ref={inputRef}
              type="file"
              accept=".ofx,.qfx,.csv,.txt,text/csv"
              onChange={onFile}
              className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-card file:px-3 file:text-ink"
            />
          </Field>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          {st && prepared && (
            <>
              <Field label="Lançar em">
                <select className={inputClass} value={dest} onChange={(e) => changeDest(e.target.value)}>
                  {accounts.length > 0 && (
                    <optgroup label="Contas">
                      {accounts.map((a) => (
                        <option key={a.id} value={`a:${a.id}`}>{a.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {cards.length > 0 && (
                    <optgroup label="Cartões">
                      {cards.map((c) => (
                        <option key={c.id} value={`c:${c.id}`}>{c.label} final {c.last4}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </Field>

              <div className="rounded-lg border border-line p-3 text-sm">
                <p className="font-medium">
                  {fileName}: {prepared.rows.length} lançamentos
                  {prepared.from && ` de ${fmtDate(prepared.from)} a ${fmtDate(prepared.to!)}`}
                </p>
                <p className="mt-1 text-muted">
                  Entradas <span className="num text-income">{formatBrl(prepared.inCents)}</span>, saídas{" "}
                  <span className="num text-expense">{formatBrl(prepared.outCents)}</span>
                </p>
                {prepared.ignored > 0 && (
                  <p className="mt-1 text-muted">{prepared.ignored} pagamentos ou estornos do cartão ficam de fora.</p>
                )}
                <ul className="mt-2 divide-y divide-line">
                  {prepared.rows.slice(0, 6).map((r) => (
                    <li key={r.external_id} className="flex justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate">
                        <span className="text-muted">{fmtDate(r.date).slice(0, 5)}</span> {r.description}
                      </span>
                      <span className={`num shrink-0 ${r.type === "receita" ? "text-income" : "text-expense"}`}>
                        {r.type === "receita" ? "+" : "-"}
                        {formatBrl(r.amount_cents)}
                      </span>
                    </li>
                  ))}
                </ul>
                {prepared.rows.length > 6 && <p className="mt-1 text-xs text-muted">e mais {prepared.rows.length - 6}.</p>}
              </div>

              {autoInv && invert && (
                <p className="rounded-lg bg-page p-3 text-sm">Este arquivo veio com entradas e saídas trocadas (comum no C6). A Arvia já desinverteu; confira a prévia acima.</p>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 size-4" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
                <span>Inverter entradas e saídas (marque se as compras apareceram como entrada)</span>
              </label>

              {canFixBalance && account && st.balanceCents !== undefined && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 size-4" checked={fixBalance} onChange={(e) => setFixBalance(e.target.checked)} />
                  <span>
                    Acertar o saldo de {account.name} para {formatBrl(st.balanceCents)}
                    {st.balanceDate ? `, saldo do extrato em ${fmtDate(st.balanceDate)}` : ""} (hoje está {formatBrl(account.balanceCents ?? 0)})
                  </span>
                </label>
              )}

              <p className="text-xs text-muted">
                Os lançamentos entram como histórico, com categoria sugerida, e não mudam o saldo da conta. Importar o mesmo arquivo de novo não duplica nada.
              </p>

              <div className="flex flex-wrap gap-2">
                <PrimaryButton type="button" disabled={busy || prepared.rows.length === 0} onClick={onImport}>
                  {busy ? "Importando…" : `Importar ${prepared.rows.length} lançamentos`}
                </PrimaryButton>
                <SecondaryButton type="button" disabled={busy} onClick={reset}>Cancelar</SecondaryButton>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
