import { useEffect } from "react";
import { Building2, Car, Home as HomeIcon, Mic, ShoppingBasket, Watch } from "lucide-react";

/** Página pública que apresenta a Arvia. Sempre no tema escuro; valores são de exemplo. */

const CATS = [
  { name: "Casa", v: 2400 },
  { name: "Mercado", v: 1800 },
  { name: "Carro", v: 890 },
  { name: "Lazer", v: 1200 },
  { name: "Saúde", v: 450 },
];
const CAT_FILL = ["var(--color-cat-1)", "#e8506b", "var(--color-cat-2)", "#3a3a40", "#2a2a2f"];
const BANKS = ["Nubank", "Inter", "C6 Bank", "Itaú", "Bradesco", "Banco do Brasil", "Caixa", "Santander", "XP"];
const CURVE = "M0 92 C40 86 70 80 110 74 S170 66 200 66 S240 58 270 46 S330 38 360 34 S410 26 440 14";

const LIFE = [
  { icon: Mic, title: "Lança falando", text: "\"Gastei 45 na padaria no Pix.\" A Arvia entende, escolhe a categoria e salva. Errou? Diga desfazer." },
  { icon: Watch, title: "Direto do Apple Watch", text: "Pergunte quanto gastou no mês ou marque um compromisso sem tirar o celular do bolso." },
  { icon: HomeIcon, title: "Casa a dois, pessoal só seu", text: "Mercado, contas e carro ficam na Casa, que o casal vê junto. O que é pessoal continua só seu." },
  { icon: Building2, title: "Empresa separada", text: "A conta do CNPJ vira o espaço Empresa, com categorias próprias. O pró-labore aparece como salário no pessoal." },
  { icon: ShoppingBasket, title: "Compras e despensa", text: "Lista de compras por voz ou foto, nota fiscal pelo QR Code e a despensa se atualiza sozinha." },
  { icon: Car, title: "Carro em dia", text: "A nota do posto vira abastecimento no carro certo, com consumo e lembretes de revisão." },
];

function Gauge({ score }: { score: number }) {
  const r = 52;
  const len = Math.PI * r;
  return (
    <svg viewBox="0 0 132 76" className="w-32 shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="presArc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-danger)" />
          <stop offset="55%" stopColor="var(--color-warn)" />
          <stop offset="100%" stopColor="var(--color-income)" />
        </linearGradient>
      </defs>
      <path d={`M 14 66 A ${r} ${r} 0 0 1 118 66`} fill="none" stroke="var(--color-line)" strokeWidth="10" strokeLinecap="round" />
      <path d={`M 14 66 A ${r} ${r} 0 0 1 118 66`} fill="none" stroke="url(#presArc)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(score / 100) * len} ${len}`} />
      <text x="66" y="62" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--color-ink)" className="font-display">{score}</text>
    </svg>
  );
}

function Tile({ title, text, children, className = "" }: { title: string; text: string; children: React.ReactNode; className?: string }) {
  return (
    <article className={`flex flex-col rounded-[22px] border border-line bg-card p-6 sm:p-7 ${className}`}>
      <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-[42ch] text-[15px] leading-relaxed text-muted">{text}</p>
      <div className="mt-6 flex-1">{children}</div>
    </article>
  );
}

export function Presentation({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    document.title = "Arvia: suas finanças, a casa e a empresa num lugar só";
  }, []);
  const max = Math.max(...CATS.map((c) => c.v));
  const cta = signedIn ? "Abrir a Arvia" : "Entrar na Arvia";

  return (
    <div data-theme="escuro" className="relative min-h-dvh overflow-x-clip bg-page text-ink">
      <div aria-hidden="true" className="pointer-events-none absolute top-[-180px] left-1/2 h-[480px] w-[min(900px,140vw)] -translate-x-1/2 rounded-full bg-brand/20 blur-[120px]" />
      <style>{`
        @keyframes pres-draw { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
        .pres-curve { animation: pres-draw 1.6s cubic-bezier(.4,0,.2,1) .2s both }
        @media (prefers-reduced-motion: reduce) { .pres-curve { animation: none } }
      `}</style>

      <header className="relative mx-auto flex max-w-[1180px] items-center justify-between px-4 py-5 sm:px-8">
        <p className="font-display text-2xl font-bold tracking-tight">Arvia</p>
        <a href="/" className="flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-medium hover:bg-card">{cta}</a>
      </header>

      <main>
        <section className="relative mx-auto max-w-[1180px] px-4 pt-10 pb-6 sm:px-8 sm:pt-16">
          <h1 className="font-display relative max-w-[16ch] text-[44px] leading-[1.02] font-bold tracking-[-0.03em] text-balance sm:text-[68px]">
            Seu dinheiro, a casa e a empresa no mesmo lugar.
          </h1>
          <p className="relative mt-5 max-w-[56ch] text-lg leading-relaxed text-muted">
            A Arvia junta seus bancos pelo Open Finance, entende o que você fala e mostra para onde vai cada real. Sem planilha e sem digitar extrato.
          </p>
          <div className="relative mt-8 flex flex-wrap gap-3">
            <a href="/" className="flex min-h-12 items-center rounded-full bg-brand px-7 text-[15px] font-semibold text-white hover:bg-brand-hover">{cta}</a>
            <a href="#recursos" className="flex min-h-12 items-center rounded-full px-5 text-[15px] font-medium text-muted hover:text-ink">Ver o que ela faz</a>
          </div>
          <svg viewBox="0 0 440 110" className="pres-curve relative mt-10 h-28 w-full sm:h-40" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${CURVE} L440 110 L0 110 Z`} fill="url(#heroFill)" />
            <path d={CURVE} fill="none" stroke="var(--color-brand)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </section>

        <section id="recursos" className="mx-auto max-w-[1180px] scroll-mt-6 px-4 pt-16 pb-10 sm:px-8">
          <h2 className="font-display text-center text-4xl font-bold tracking-[-0.02em] sm:text-5xl">O que a Arvia faz por você</h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-center text-lg text-muted">Controle, segurança e inteligência sobre os seus dados financeiros.</p>
          <p className="mt-2 text-center text-xs text-muted">Valores ilustrativos.</p>

          <div className="mt-12 grid gap-4 lg:grid-cols-6">
            <Tile className="lg:col-span-2" title="Gastos por categoria" text="Entenda para onde vai o seu dinheiro, mês a mês, sem montar planilha.">
              <div className="flex h-40 items-end gap-2" role="img" aria-label="Exemplo de gastos por categoria">
                {CATS.map((c, i) => (
                  <div key={c.name} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="num text-[11px] text-muted">R$ {(c.v / 1000).toFixed(1).replace(".", ",")}k</span>
                    <span className="w-full rounded-lg" style={{ height: `${(c.v / max) * 100}px`, background: CAT_FILL[i] }} />
                    <span className="w-full truncate text-center text-[11px] text-muted">{c.name}</span>
                  </div>
                ))}
              </div>
            </Tile>

            <Tile className="lg:col-span-2" title="Evolução do saldo" text="Acompanhe como o seu patrimônio cresce ao longo do tempo.">
              <svg viewBox="0 0 440 110" className="h-28 w-full" preserveAspectRatio="none" aria-hidden="true">
                <path d={`${CURVE} L440 110 L0 110 Z`} fill="url(#heroFill)" />
                <path d={CURVE} fill="none" stroke="var(--color-brand)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              </svg>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="num font-display text-3xl font-bold tracking-tight">R$ 25.576</span>
                <span className="num text-sm font-medium text-income">+12,4%</span>
              </p>
            </Tile>

            <Tile className="lg:col-span-2" title="Assistente com IA" text="Pergunte em português e receba a resposta com os seus números.">
              <div className="flex flex-col gap-2 text-sm">
                <p className="self-end rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-white">Quanto gastei com mercado este mês?</p>
                <p className="max-w-[92%] rounded-2xl rounded-bl-md bg-page px-4 py-2.5 leading-relaxed">
                  R$ 1.812 até hoje, 9% a menos que no mês passado. A maior compra foi no atacado, dia 12.
                </p>
              </div>
            </Tile>

            <Tile className="lg:col-span-3" title="Todos os seus bancos" text="Conecte as contas pelo Open Finance, o sistema regulado pelo Banco Central. A Arvia nunca pede a senha do banco.">
              <ul className="flex flex-wrap gap-2" aria-label="Alguns bancos compatíveis">
                {BANKS.map((b) => (
                  <li key={b} className="rounded-full border border-line bg-page px-3.5 py-1.5 text-sm">{b}</li>
                ))}
              </ul>
            </Tile>

            <Tile className="lg:col-span-3" title="Sua saúde financeira" text="Uma nota simples que mostra se você está no caminho certo, e por quê.">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <ul className="grid flex-1 grid-cols-3 gap-2">
                  {[["Poupança", "Boa", "text-income"], ["Dívidas", "Baixo", "text-income"], ["Gastos", "Atenção", "text-warn"]].map(([l, v, c]) => (
                    <li key={l} className="rounded-xl bg-page px-2 py-3 text-center">
                      <p className="text-xs text-muted">{l}</p>
                      <p className={`font-display mt-0.5 font-semibold ${c}`}>{v}</p>
                    </li>
                  ))}
                </ul>
                <Gauge score={72} />
              </div>
            </Tile>
          </div>
        </section>

        <section className="mx-auto max-w-[1180px] px-4 py-16 sm:px-8">
          <h2 className="font-display max-w-[20ch] text-3xl font-bold tracking-[-0.02em] sm:text-4xl">Feita para a rotina de verdade</h2>
          <dl className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {LIFE.map((f) => (
              <div key={f.title} className="border-t border-line pt-5">
                <dt className="flex items-center gap-2.5 font-display text-lg font-semibold">
                  <f.icon size={20} className="text-brand" aria-hidden="true" />
                  {f.title}
                </dt>
                <dd className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-muted">{f.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-[1180px] px-4 pb-20 sm:px-8">
          <div className="flex flex-col items-start gap-6 rounded-[28px] border border-line bg-card p-8 sm:flex-row sm:items-center sm:justify-between sm:p-12">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-[-0.02em]">Comece pelo que você já tem.</h2>
              <p className="mt-2 max-w-[48ch] text-muted">Conecte um banco, fale o primeiro gasto e veja o mês se organizar.</p>
            </div>
            <a href="/" className="flex min-h-12 shrink-0 items-center rounded-full bg-brand px-7 text-[15px] font-semibold text-white hover:bg-brand-hover">{cta}</a>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-6 text-sm text-muted sm:px-8">
        <p>Arvia, finanças pessoais, da casa e da empresa.</p>
        <p>Feita no Brasil.</p>
      </footer>
    </div>
  );
}
