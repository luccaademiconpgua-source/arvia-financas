import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { format, parseISO } from "date-fns";
import { Card } from "../components/ui";
import { Field, inputClass, PrimaryButton, SecondaryButton } from "../components/Sheet";
import { useModeData } from "../hooks/useModeData";
import { todayIso } from "../lib/clock";
import { formatBrl } from "../lib/money";
import { isAccessKeyOnly, isNfceUrl } from "../lib/nfceUrl";
import { scanImageFile, startCameraScan, type ScanSession } from "../lib/qrScan";
import { suggestCategoryName } from "../lib/suggestCategory";
import { fetchNfce, NfceError, type NfceResult } from "../services/nfce";
import { addTransaction } from "../store/actions";
import { supabase } from "../lib/supabase";
import { useRefresh } from "../store/refresh";
import { useUI } from "../store/ui";
import type { Transaction } from "../types";
import { fuelFromNote } from "../lib/fuel";
import { useVehicles } from "../services/vehicles";
import { useAuth } from "../store/auth";
import { applyFuelChoice, FuelVehiclePicker, TERCEIRO, type FuelChoice } from "../components/vehicles/FuelVehiclePicker";

type Tab = "camera" | "foto" | "url";
const tabs: Array<{ value: Tab; label: string }> = [
  { value: "camera", label: "Câmera" },
  { value: "foto", label: "Foto" },
  { value: "url", label: "Colar URL" },
];

export function Scan() {
  const [tab, setTab] = useState<Tab>("camera");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUrl, setLastUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<{ url: string; nfce: NfceResult } | null>(null);

  async function consult(raw: string) {
    setMessage("");
    setFailed(false);
    const url = raw.trim();
    if (isAccessKeyOnly(url)) return setMessage("A chave de 44 dígitos sozinha não consulta a nota. Cole a URL que começa com http.");
    if (!isNfceUrl(url)) return setMessage("Este QR Code não parece uma nota fiscal.");
    setLastUrl(url);
    const { data: done } = await supabase.from("nfce_scans").select("id").eq("url", url).eq("status", "lancada").limit(1);
    if (done && done.length > 0) return setMessage("Esta nota já foi lançada.");
    setLoading(true);
    try {
      setResult({ url, nfce: await fetchNfce(url) });
    } catch (e) {
      setMessage(e instanceof NfceError ? e.message : "Não consegui ler esta nota.");
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  if (result) return <Review url={result.url} nfce={result.nfce} onCancel={() => setResult(null)} />;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Escanear nota fiscal">
        <div role="tablist" aria-label="Como ler a nota" className="grid grid-cols-3 rounded-xl border border-line p-1">
          {tabs.map((t) => (
            <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => { setTab(t.value); setMessage(""); }} className={`min-h-11 rounded-lg text-sm font-medium ${tab === t.value ? "bg-brand text-white" : "text-muted"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {tab === "camera" && <CameraTab active onUrl={consult} onError={setMessage} />}
          {tab === "foto" && <PhotoTab onUrl={consult} onError={setMessage} />}
          {tab === "url" && <PasteTab onUrl={consult} />}
        </div>
        {loading && <p role="status" className="mt-3 text-sm text-muted">Consultando a SEFAZ…</p>}
        {message && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {message}
          </p>
        )}
        {failed && (
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton type="button" onClick={() => void consult(lastUrl)}>
              Tentar de novo
            </PrimaryButton>
            <ManualButton />
          </div>
        )}
      </Card>
    </div>
  );
}

function ManualButton() {
  const openTx = useUI((s) => s.openTx);
  return (
    <SecondaryButton type="button" onClick={() => openTx({ type: "despesa" })}>
      Lançar manualmente
    </SecondaryButton>
  );
}

function CameraTab({ onUrl, onError }: { active: boolean; onUrl: (u: string) => void; onError: (m: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<ScanSession | null>(null);
  const cb = useRef({ onUrl, onError });
  cb.current = { onUrl, onError };
  const [on, setOn] = useState(false);
  const [torch, setTorch] = useState<null | boolean>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!on || !video.current) return;
    let cancelled = false;
    setSlow(false);
    const tip = setTimeout(() => setSlow(true), 8000);
    startCameraScan(video.current, (text) => {
      setOn(false);
      cb.current.onUrl(text);
    })
      .then((s) => {
        if (cancelled) return s.stop();
        session.current = s;
        setTorch(s.torch ? false : null);
      })
      .catch(() => {
        setOn(false);
        cb.current.onError("Não consegui acessar a câmera. Confira a permissão do navegador ou use a aba Foto.");
      });
    return () => {
      cancelled = true;
      clearTimeout(tip);
      session.current?.stop();
      session.current = null;
      setTorch(null);
    };
  }, [on]);

  return (
    <div className="flex flex-col gap-3">
      <div className={`relative w-full max-w-sm ${on ? "" : "hidden"}`}>
        <video ref={video} muted playsInline className="aspect-square w-full rounded-xl bg-ink object-cover" aria-label="Imagem da câmera" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
      </div>
      {!on && <PrimaryButton type="button" onClick={() => setOn(true)}>Abrir câmera</PrimaryButton>}
      {on && (
        <div className="flex flex-wrap gap-2">
          <SecondaryButton type="button" onClick={() => setOn(false)}>Parar câmera</SecondaryButton>
          {torch !== null && (
            <SecondaryButton
              type="button"
              aria-pressed={torch}
              onClick={() => {
                const next = !torch;
                void session.current?.torch?.(next).then((ok) => ok && setTorch(next));
              }}
            >
              {torch ? "Desligar lanterna" : "Ligar lanterna"}
            </SecondaryButton>
          )}
        </div>
      )}
      <p className="text-sm text-muted">
        Aponte para o QR Code da nota e aproxime até ele ocupar o quadrado. Segure firme por um ou dois segundos.
      </p>
      {on && slow && (
        <p className="text-sm text-muted">
          Demorando? Afaste um pouco o celular para focar, ligue a lanterna, ou use a aba Foto e tire uma foto bem de perto.
        </p>
      )}
    </div>
  );
}

function PhotoTab({ onUrl, onError }: { onUrl: (u: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await scanImageFile(file);
      if (text) onUrl(text);
      else onError("Não encontrei um QR Code nesta foto. Tire bem de perto, com o QR nítido e ocupando boa parte da imagem.");
    } catch {
      onError("Não consegui abrir esta foto.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Field label="Foto do QR Code">
      <input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(e) => void onFile(e)} className={inputClass} />
      {busy && <span className="text-sm text-muted">Procurando o QR Code…</span>}
    </Field>
  );
}

function PasteTab({ onUrl }: { onUrl: (u: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onUrl(value); }} className="flex flex-col gap-3">
      <Field label="URL da nota fiscal">
        <input className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://..." autoComplete="off" />
      </Field>
      <PrimaryButton type="submit">Consultar nota</PrimaryButton>
    </form>
  );
}

function Review({ url, nfce, onCancel }: { url: string; nfce: NfceResult; onCancel: () => void }) {
  const { mode, accounts, cards, categories } = useModeData();
  const navigate = useNavigate();
  const showToast = useUI((s) => s.showToast);
  const fuel = fuelFromNote(nfce.items);
  const household = useAuth((s) => s.household);
  const { vehicles } = useVehicles(household ? "casa" : mode);
  const [fuelChoice, setFuelChoice] = useState<FuelChoice>({ target: null, km: "", fullTank: true });
  const askVehicle = !!fuel && vehicles.length > 0;
  const suggested = fuel ? "Gasolina" : suggestCategoryName(nfce.storeName, mode);
  const cats = categories.filter((c) => c.kind === "despesa");
  const [categoryId, setCategoryId] = useState("");
  const [payment, setPayment] = useState<Transaction["payment"]>(nfce.payment === "desconhecido" ? "pix" : nfce.payment);
  const [dest, setDest] = useState("");
  const [error, setError] = useState("");
  const catSel = categoryId || cats.find((c) => c.name === suggested)?.id || cats[0]?.id || "";
  const options = [
    ...accounts.map((a) => ({ value: `a:${a.id}`, label: a.name })),
    ...cards.map((c) => ({ value: `c:${c.id}`, label: `Cartão ${c.label} final ${c.last4}` })),
  ];
  const destSel = dest || (payment === "credito" && cards[0] ? `c:${cards[0].id}` : accounts[0] ? `a:${accounts[0].id}` : "");
  const onCard = destSel.startsWith("c:");

  async function save() {
    setError("");
    const id = destSel.slice(2);
    if (!id) return setError("Escolha a conta ou o cartão.");
    if (askVehicle && !fuelChoice.target) return setError(vehicles.length === 1 ? "Diga se o combustível foi para o seu veículo ou de terceiro." : "Escolha em qual veículo foi o abastecimento.");
    try {
      const { data: prev } = await supabase.from("nfce_scans").select("id").eq("url", url).limit(1);
      let scanId = prev?.[0]?.id as string | undefined;
      if (!scanId) {
        const { data: created, error: insErr } = await supabase
          .from("nfce_scans")
          .insert({
            scope: mode,
            url,
            access_key: nfce.accessKey ?? null,
            store_name: nfce.storeName,
            cnpj: nfce.cnpj ?? null,
            issued_at: nfce.issuedAt,
            total_cents: nfce.totalCents,
            payment,
            items: nfce.items,
            state: nfce.state ?? null,
            status: "rascunho",
          })
          .select("id")
          .single();
        if (insErr || !created) throw new Error(insErr?.message ?? "Não consegui guardar a nota.");
        scanId = created.id as string;
      }
      const date = nfce.issuedAt.slice(0, 10) > todayIso() ? todayIso() : nfce.issuedAt.slice(0, 10);
      const txId = await addTransaction({
        mode,
        type: "despesa",
        description: nfce.storeName.slice(0, 80),
        amountCents: nfce.totalCents,
        date,
        payment: onCard ? "credito" : payment === "credito" ? "debito" : payment,
        categoryId: catSel,
        ...(onCard ? { cardId: id } : { accountId: id }),
        essential: categories.find((c) => c.id === catSel)?.essential ?? false,
        source: "nfce",
        nfceId: scanId,
      });
      await supabase.from("nfce_scans").update({ status: "lancada", transaction_id: txId }).eq("id", scanId);
      if (fuel && askVehicle) {
        await applyFuelChoice(fuelChoice, fuel, { nfceId: scanId, transactionId: txId, date, paidCents: nfce.totalCents, store: nfce.storeName });
      }
      useRefresh.getState().bump();
      const ownVehicle = fuel && askVehicle && fuelChoice.target !== TERCEIRO;
      showToast(ownVehicle ? "Despesa e abastecimento lançados" : "Despesa lançada");
      navigate(ownVehicle ? "/veiculos" : "/transacoes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui lançar a despesa.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Revisar nota">
        <p className="text-lg font-semibold">{nfce.storeName}</p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-muted">CNPJ</dt><dd className="num">{nfce.cnpj ?? "-"}</dd></div>
          <div><dt className="text-muted">Data</dt><dd className="num">{format(parseISO(nfce.issuedAt), "dd/MM/yyyy")}</dd></div>
          <div><dt className="text-muted">UF</dt><dd>{nfce.state ?? "-"}</dd></div>
          <div><dt className="text-muted">Total</dt><dd className="num font-semibold">{formatBrl(nfce.totalCents)}</dd></div>
        </dl>
        <ul className="mt-3 divide-y divide-line text-sm">
          {nfce.items.map((i, n) => (
            <li key={`${i.description}-${n}`} className="flex justify-between gap-3 py-2">
              <span className="min-w-0 truncate">{i.quantity} {i.unit} · {i.description}</span>
              <span className="num shrink-0">{formatBrl(i.totalCents)}</span>
            </li>
          ))}
        </ul>
      </Card>
      {fuel && (
        <Card title="Abastecimento">
          <FuelVehiclePicker info={fuel} vehicles={vehicles} value={fuelChoice} onChange={setFuelChoice} idPrefix="nota" />
        </Card>
      )}
      <Card title="Lançamento">
        <div className="flex flex-col gap-3">
          <Field label="Forma de pagamento">
            <select className={inputClass} value={payment} onChange={(e) => { setPayment(e.target.value as Transaction["payment"]); setDest(""); }}>
              <option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option>
            </select>
          </Field>
          <Field label="Categoria">
            <select className={inputClass} value={catSel} onChange={(e) => setCategoryId(e.target.value)}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Conta ou cartão" error={error}>
            <select className={inputClass} value={destSel} onChange={(e) => setDest(e.target.value)}>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <div className="flex gap-2">
            <PrimaryButton type="button" className="flex-1" onClick={() => void save()}>Lançar despesa</PrimaryButton>
            <SecondaryButton type="button" onClick={onCancel}>Cancelar</SecondaryButton>
          </div>
        </div>
      </Card>
    </div>
  );
}
