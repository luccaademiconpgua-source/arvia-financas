import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Empty } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton, Sheet } from "../components/Sheet";
import { useModeData } from "../hooks/useModeData";
import { accountBalanceCents } from "../lib/calc";
import { todayIso } from "../lib/clock";
import { formatBrl, parseBrlToCents } from "../lib/money";
import { consorcio, KIND_LABEL, netWorth, type Asset, type AssetKind } from "../lib/networth";
import { deleteAsset, saveAsset, saveSnapshot, useNetWorthData } from "../services/networth";
import { useVehicles } from "../services/vehicles";
import { useUI } from "../store/ui";
import type { Mode } from "../types";

const centsText = (c: number | null) => (c === null ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const shortBrl = (c: number) => {
  const v = c / 100;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

type Editing = null | { asset?: Asset; kind?: AssetKind; vehicleId?: string; name?: string };

export function NetWorth() {
  const { ready, mode, accounts, cards, debts, transactions } = useModeData();
  const nw = useNetWorthData(mode);
  const veh = useVehicles(mode);
  const [editing, setEditing] = useState<Editing>(null);
  const month = todayIso().slice(0, 7);

  const result = useMemo(
    () => netWorth({ accounts, balanceOf: (a) => accountBalanceCents(a, transactions), cards, debts, assets: nw.assets }),
    [accounts, transactions, cards, debts, nw.assets],
  );

  const saved = nw.snapshots.find((s) => s.month === month);
  const allReady = ready && nw.ready && veh.ready;
  useEffect(() => {
    if (!allReady) return;
    if (saved && saved.assetsCents === result.assetsCents && saved.liabilitiesCents === result.liabilitiesCents) return;
    void saveSnapshot(mode, month, result.assetsCents, result.liabilitiesCents);
  }, [allReady, saved, result.assetsCents, result.liabilitiesCents, mode, month]);

  if (!allReady) return <Empty>{nw.error || "Carregando…"}</Empty>;

  const series = [...nw.snapshots.filter((s) => s.month !== month), { month, assetsCents: result.assetsCents, liabilitiesCents: result.liabilitiesCents }]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-24)
    .map((s) => ({ m: format(parseISO(`${s.month}-01`), "MMM yy", { locale: ptBR }), net: (s.assetsCents - s.liabilitiesCents) / 100 }));
  const prev = nw.snapshots.filter((s) => s.month < month).at(-1);
  const delta = prev ? result.netCents - (prev.assetsCents - prev.liabilitiesCents) : null;
  const consorcios = nw.assets.filter((a) => a.kind === "consorcio");
  const others = nw.assets.filter((a) => a.kind !== "consorcio");
  const vehiclesWithout = veh.vehicles.filter((v) => !nw.assets.some((a) => a.vehicleId === v.id));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-sm text-muted">Patrimônio líquido</p>
        <p className={`num font-display mt-1 text-4xl font-semibold ${result.netCents < 0 ? "text-expense" : ""}`}>{formatBrl(result.netCents)}</p>
        {delta !== null && prev && (
          <p className={`mt-1 text-sm ${delta >= 0 ? "text-income" : "text-expense"}`}>
            {delta >= 0 ? "+" : "-"}{formatBrl(Math.abs(delta))} desde {format(parseISO(`${prev.month}-01`), "MMMM", { locale: ptBR })}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-income-bg p-3"><dt className="text-muted">O que vocês têm</dt><dd className="num text-lg font-semibold text-income">{formatBrl(result.assetsCents)}</dd></div>
          <div className="rounded-lg bg-expense-bg p-3"><dt className="text-muted">O que devem</dt><dd className="num text-lg font-semibold text-expense">{formatBrl(result.liabilitiesCents)}</dd></div>
        </dl>
        {series.length > 1 ? (
          <div className="mt-4 h-44" role="img" aria-label="Evolução do patrimônio líquido por mês">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="m" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={64} tickFormatter={(v: number) => shortBrl(v * 100)} />
                <Tooltip formatter={(v) => [formatBrl(Math.round(Number(v) * 100)), "Patrimônio"]} />
                <Line type="monotone" dataKey="net" stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted">A Arvia guarda uma foto do patrimônio a cada mês. A partir do mês que vem dá para ver a evolução aqui.</p>
        )}
      </Card>

      <Card title="Consórcios">
        {consorcios.length === 0 ? (
          <p className="text-sm text-muted">Cadastre as cartas de consórcio para acompanhar quanto já foi pago e quanto falta.</p>
        ) : (
          <ul className="divide-y divide-line">
            {consorcios.map((a) => {
              const c = consorcio(a);
              return (
                <li key={a.id}>
                  <button type="button" className="w-full py-3 text-left" onClick={() => setEditing({ asset: a })}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{a.name}</span>
                      <span className="num text-sm font-semibold">{formatBrl(c.creditCents)}</span>
                    </span>
                    <span className="mt-2 block h-2 rounded-full bg-page" aria-hidden="true"><span className="block h-2 rounded-full bg-brand" style={{ width: `${c.progressPct}%` }} /></span>
                    <span className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
                      <span>{a.contemplated ? "Contemplada" : "Aguardando contemplação"}{a.administrator ? `, ${a.administrator}` : ""}</span>
                      <span>{a.paidMonths} de {a.termMonths} pagas ({c.progressPct}%), faltam <span className="num">{formatBrl(c.remainingCents)}</span></span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <SecondaryButton type="button" className="mt-3" onClick={() => setEditing({ kind: "consorcio" })}>Adicionar carta</SecondaryButton>
        <p className="mt-2 text-xs text-muted">Antes da contemplação, o que você já pagou conta como bem. Depois, o bem comprado entra em Imóveis ou Veículos e as parcelas que faltam contam como dívida.</p>
      </Card>

      <Card title="O que vocês têm">
        {result.assets.length === 0 && <p className="text-sm text-muted">Nada cadastrado ainda.</p>}
        {result.assets.map((g) => (
          <section key={g.key} className="border-b border-line py-2 last:border-0">
            <h3 className="flex justify-between text-sm font-semibold"><span>{g.label}</span><span className="num">{formatBrl(g.cents)}</span></h3>
            <ul className="mt-1 space-y-1 text-sm text-muted">
              {g.lines.map((l, i) => (
                <li key={`${l.name}${i}`} className="flex justify-between gap-2"><span className="truncate">{l.name}</span><span className="num shrink-0">{formatBrl(l.cents)}</span></li>
              ))}
            </ul>
          </section>
        ))}
        {others.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {others.map((a) => (
              <button key={a.id} type="button" onClick={() => setEditing({ asset: a })} className="min-h-9 rounded-full border border-line px-3 text-xs">Editar {a.name}</button>
            ))}
          </div>
        )}
        {vehiclesWithout.length > 0 && (
          <div className="mt-3 rounded-lg bg-page p-3 text-sm">
            <p className="text-muted">Veículos sem valor informado:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {vehiclesWithout.map((v) => (
                <button key={v.id} type="button" onClick={() => setEditing({ kind: "veiculo", vehicleId: v.id, name: v.name })} className="min-h-9 rounded-full border border-brand px-3 text-brand">Informar valor do {v.name}</button>
              ))}
            </div>
          </div>
        )}
        <SecondaryButton type="button" className="mt-3" onClick={() => setEditing({ kind: "imovel" })}>Adicionar bem</SecondaryButton>
      </Card>

      <Card title="O que vocês devem">
        {result.liabilities.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma dívida, fatura em aberto ou consórcio contemplado com parcelas a pagar.</p>
        ) : (
          result.liabilities.map((g) => (
            <section key={g.key} className="border-b border-line py-2 last:border-0">
              <h3 className="flex justify-between text-sm font-semibold"><span>{g.label}</span><span className="num">{formatBrl(g.cents)}</span></h3>
              <ul className="mt-1 space-y-1 text-sm text-muted">
                {g.lines.map((l, i) => (
                  <li key={`${l.name}${i}`} className="flex justify-between gap-2"><span className="truncate">{l.name}{l.detail ? `, ${l.detail}` : ""}</span><span className="num shrink-0">{formatBrl(l.cents)}</span></li>
                ))}
              </ul>
            </section>
          ))
        )}
        <p className="mt-2 text-xs text-muted">Faturas em aberto incluem parcelas futuras de compras parceladas.</p>
      </Card>

      {editing && <AssetSheet mode={mode} editing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AssetSheet({ mode, editing, onClose }: { mode: Mode; editing: NonNullable<Editing>; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const a = editing.asset;
  const [kind, setKind] = useState<AssetKind>(a?.kind ?? editing.kind ?? "imovel");
  const [name, setName] = useState(a?.name ?? editing.name ?? "");
  const [value, setValue] = useState(centsText(a?.valueCents ?? null));
  const [admin, setAdmin] = useState(a?.administrator ?? "");
  const [credit, setCredit] = useState(centsText(a?.creditCents ?? null));
  const [term, setTerm] = useState(a?.termMonths ? String(a.termMonths) : "");
  const [paid, setPaid] = useState(a?.paidMonths !== null && a?.paidMonths !== undefined ? String(a.paidMonths) : "");
  const [inst, setInst] = useState(centsText(a?.installmentCents ?? null));
  const [contemplated, setContemplated] = useState(a?.contemplated ?? false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const vehicleId = a?.vehicleId ?? editing.vehicleId ?? null;
  const isCons = kind === "consorcio";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 1) return setError("Dê um nome.");
    let input;
    if (isCons) {
      const c = parseBrlToCents(credit), i = parseBrlToCents(inst), t = Number(term), p = Number(paid);
      if (!c || c <= 0) return setError("Informe o valor da carta.");
      if (!Number.isInteger(t) || t < 1 || t > 400) return setError("Informe o prazo em meses.");
      if (!Number.isInteger(p) || p < 0 || p > t) return setError("Parcelas pagas precisa ficar entre 0 e o prazo.");
      if (!i || i <= 0) return setError("Informe o valor da parcela.");
      input = { kind, name: name.trim().slice(0, 60), valueCents: null, vehicleId: null, administrator: admin.trim().slice(0, 40) || null, creditCents: c, termMonths: t, paidMonths: p, installmentCents: i, contemplated };
    } else {
      const v = parseBrlToCents(value);
      if (v === null || v < 0) return setError("Informe quanto vale hoje.");
      input = { kind, name: name.trim().slice(0, 60), valueCents: v, vehicleId: kind === "veiculo" ? vehicleId : null, administrator: null, creditCents: null, termMonths: null, paidMonths: null, installmentCents: null, contemplated: false };
    }
    void saveAsset(mode, input, a?.id).then(() => { showToast(a ? "Atualizado" : "Adicionado ao patrimônio"); onClose(); }).catch((err: Error) => setError(err.message));
  }

  return (
    <Sheet title={a ? a.name : isCons ? "Nova carta de consórcio" : "Novo bem"} onClose={onClose}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-3">
        {!a && !editing.vehicleId && editing.kind !== "consorcio" && (
          <Field label="Tipo">
            <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
              {(["imovel", "veiculo", "investimento", "outro"] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </Field>
        )}
        <Field label="Nome"><input className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={isCons ? "Carta imóvel" : kind === "imovel" ? "Apartamento" : ""} /></Field>
        {isCons ? (
          <>
            <Field label="Administradora (opcional)"><input className={inputClass} value={admin} maxLength={40} onChange={(e) => setAdmin(e.target.value)} placeholder="Ademicon" /></Field>
            <Field label="Valor da carta (crédito)"><input className={inputClass} inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="300.000,00" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prazo (meses)"><input className={inputClass} inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value.replace(/\D/g, "").slice(0, 3))} /></Field>
              <Field label="Parcelas pagas"><input className={inputClass} inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value.replace(/\D/g, "").slice(0, 3))} /></Field>
            </div>
            <Field label="Valor da parcela atual"><input className={inputClass} inputMode="decimal" value={inst} onChange={(e) => setInst(e.target.value)} /></Field>
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="size-5 accent-brand" checked={contemplated} onChange={(e) => setContemplated(e.target.checked)} />
              Já foi contemplada
            </label>
          </>
        ) : (
          <Field label="Quanto vale hoje"><input className={inputClass} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" /></Field>
        )}
        {kind === "veiculo" && <p className="-mt-1 text-xs text-muted">Use o valor da tabela FIPE como referência.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <PrimaryButton type="submit" className="flex-1">Salvar</PrimaryButton>
          <SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton>
        </div>
        {a && (
          <div className="border-t border-line pt-3 text-sm">
            {!confirm ? (
              <button type="button" className="min-h-11 text-muted underline" onClick={() => setConfirm(true)}>Tirar do patrimônio</button>
            ) : (
              <button type="button" className="min-h-11 rounded-lg bg-danger px-3 font-medium text-white" onClick={() => void deleteAsset(a.id).then(onClose)}>Confirmar</button>
            )}
          </div>
        )}
      </form>
    </Sheet>
  );
}
