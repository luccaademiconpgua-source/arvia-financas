// Edge Function `ai`: o cérebro do assistente da Arvia.
// Provedores: Groq (rápido, texto e áudio) e Gemini (texto, foto e áudio). Um assume quando o outro falha ou estoura a cota.
// As chaves são de cada pessoa (ou de alguém da casa) e ficam no Vault; só esta função lê, com service_role.
//
// Ações:
//   transcribe  {audio, mime}            -> {text}
//   items       {text}                   -> {items:[{name,qty,unit}]}          (lista de compras ditada)
//   photo_list  {image, mime}            -> {items:[...]}                      (foto de lista escrita à mão)
//   chat        {messages:[{role,content}]} -> {reply, actions:[...]}         (assistente com os dados da pessoa)
//   task        {text}                   -> {task:{title,date,time,priority}} (agenda por texto livre)
//   capture     {audio,mime} ou {text}   -> {text, actions:[transaction|task], missing:[...]} (lançamento rápido por voz)
//   relógio     ?chave= no endereço (ou header x-arvia-chave) + {texto}  -> texto para o relógio falar
//               lança direto o que for gasto/recebimento/compromisso, responde perguntas e entende "desfazer"
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-arvia-chave",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

type Keys = { groq: string | null; gemini: string | null };
type Msg = { role: "user" | "assistant"; content: string };
type Provider = "groq" | "gemini";

const GROQ_CHAT = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"];
const GROQ_STT = "whisper-large-v3-turbo";
const GEMINI = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];

class AiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function todayBR() {
  const now = new Date();
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const wd = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(now);
  const hm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(now);
  return { date: d, weekday: wd, time: hm };
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = /\{[\s\S]*\}/.exec(t);
    if (m) return JSON.parse(m[0]);
    throw new Error("json");
  }
}

async function groqChat(key: string, system: string, msgs: Msg[], wantJson: boolean): Promise<string> {
  let last = "";
  for (const model of GROQ_CHAT) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 1500,
        messages: [{ role: "system", content: system }, ...msgs],
        ...(wantJson ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(40000),
    });
    const body = await res.text();
    if (res.ok) return JSON.parse(body)?.choices?.[0]?.message?.content ?? "";
    if (res.status === 401) throw new AiError("chave_groq", "A chave do Groq foi recusada.");
    last = `Groq ${res.status}`;
    if (res.status !== 404 && res.status !== 400) break; // 429/5xx: deixa o Gemini tentar
  }
  throw new AiError("falhou", last);
}

async function geminiCall(key: string, system: string, parts: unknown[], history: Msg[], wantJson: boolean): Promise<string> {
  let last = "";
  const contents = [
    ...history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    ...(parts.length ? [{ role: "user", parts }] : []),
  ];
  for (const model of GEMINI) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500, ...(wantJson ? { responseMimeType: "application/json" } : {}) },
      }),
      signal: AbortSignal.timeout(45000),
    });
    const body = await res.text();
    if (res.ok) return JSON.parse(body)?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    if ((res.status === 400 && /API key/i.test(body)) || res.status === 403) throw new AiError("chave_gemini", "A chave do Gemini foi recusada.");
    last = `Gemini ${res.status}`;
    if (res.status !== 404 && res.status !== 429) break;
  }
  throw new AiError("falhou", last);
}

/** Texto: Groq primeiro (mais rápido); se falhar ou estourar a cota, o Gemini responde. */
async function llm(keys: Keys, system: string, msgs: Msg[], wantJson: boolean): Promise<{ text: string; provider: Provider }> {
  const order: Provider[] = ["groq", "gemini"];
  const errors: string[] = [];
  for (const p of order) {
    const k = keys[p];
    if (!k) continue;
    try {
      const text = p === "groq" ? await groqChat(k, system, msgs, wantJson) : await geminiCall(k, system, [], msgs, wantJson);
      return { text, provider: p };
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!keys.groq && !keys.gemini) throw new AiError("sem_chave", "Configure uma chave do Groq ou do Gemini.");
  throw new AiError("falhou", errors.join("; ") || "Não consegui responder agora.");
}

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function transcribe(keys: Keys, audio: string, mime: string): Promise<{ text: string; provider: Provider }> {
  if (keys.groq) {
    const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
    const fd = new FormData();
    fd.append("file", new Blob([b64ToBytes(audio)], { type: mime }), `audio.${ext}`);
    fd.append("model", GROQ_STT);
    fd.append("language", "pt");
    fd.append("response_format", "json");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${keys.groq}` }, body: fd, signal: AbortSignal.timeout(45000) });
    if (res.ok) return { text: String((await res.json())?.text ?? "").trim(), provider: "groq" };
    if (res.status === 401) throw new AiError("chave_groq", "A chave do Groq foi recusada.");
  }
  if (keys.gemini) {
    const text = await geminiCall(keys.gemini, "Transcreva o áudio em português do Brasil, palavra por palavra, com pontuação. Responda só com a transcrição.", [{ inline_data: { mime_type: mime.split(";")[0], data: audio } }], [], false);
    return { text: text.trim(), provider: "gemini" };
  }
  throw new AiError("sem_chave", "Configure uma chave do Groq ou do Gemini.");
}

const ITEMS_PROMPT = `Você recebe o que a pessoa falou ou escreveu para a lista de compras de supermercado (pt-BR), às vezes sem vírgulas, como "arroz feijão dois litros de leite pão de forma".
Separe em itens. Mantenha nomes compostos juntos ("pão de forma", "papel higiênico", "leite condensado", "pão de queijo"). Converta números falados ("dois" -> 2).
Unidades possíveis: kg, g, l, ml, un, cx, pct, dz, lata ou null. Corrija grafia óbvia. Não invente itens.
Responda só JSON: {"items":[{"name":"arroz","qty":null,"unit":null}]}`;

function cleanItems(raw: unknown) {
  const list = (raw as { items?: unknown })?.items;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 80).flatMap((x) => {
    const i = x as { name?: unknown; qty?: unknown; unit?: unknown };
    const name = String(i?.name ?? "").trim().slice(0, 80);
    if (name.length < 2) return [];
    const q = Number(i?.qty);
    const u = i?.unit ? String(i.unit).toLowerCase().slice(0, 10) : null;
    return [{ name, qty: Number.isFinite(q) && q > 0 && q < 10000 ? q : null, unit: u && u !== "null" ? u : null }];
  });
}

function chatSystem(ctx: unknown) {
  const t = todayBR();
  return `Você é o assistente pessoal da Arvia, o app de finanças e organização da casa da pessoa. Fale em português do Brasil, com tom humano, direto e prático, como um mentor financeiro que conhece a vida da pessoa. Não use travessão. Não bajule.
Hoje é ${t.weekday}, ${t.date}, ${t.time} (horário de Brasília).

DADOS da pessoa (JSON, valores em reais). Use só estes dados para afirmar números; se algo não estiver aqui, diga que não tem essa informação no app. Nunca invente valores:
${JSON.stringify(ctx)}

O que você faz:
1. Responde dúvidas sobre os gastos, saldos, orçamento, metas, contas fixas, dívidas e agenda, com números dos DADOS. Compare com meses anteriores quando ajudar.
2. Dá resumos gerais quando pedirem: o que entrou e saiu, onde mais gastou, o que mudou, alertas e 1 a 3 sugestões práticas.
3. Tira dúvidas gerais de finanças pessoais, consumo e organização, de forma educativa (não é recomendação de investimento personalizada).
4. Organiza o dia e a semana com base na agenda: sugere ordem, horários livres e o que priorizar.
5. Quando a pessoa contar um gasto ou recebimento ("gastei 45 no mercado no pix", "recebi 2 mil de comissão", "paguei a luz 180"), crie uma ação "transaction".
   - amount em reais (número). type "despesa" ou "receita". category: o nome EXATO de uma categoria dos DADOS do mesmo tipo (escolha a mais adequada). payment: pix, dinheiro, debito ou credito.
   - account: nome exato de uma conta dos DADOS se a pessoa citar ou se der para deduzir; card: nome exato do cartão se for no crédito. Se for no crédito parcelado, installments com o número de parcelas.
   - scope: "casa" se for despesa da casa (mercado da casa, contas da casa, carro da família) e a pessoa tiver casa; "empresa" se for da empresa (comissão, imposto, DAS, contador, anúncios, ferramenta de trabalho) e tem_empresa for true; senão "pessoal".
   - date no formato AAAA-MM-DD (hoje se não disser; "ontem" = um dia antes).
   - Se faltar o valor, NÃO crie a ação: pergunte o valor.
6. Quando for algo a fazer, compromisso ou lembrete ("dentista quinta 15h", "pagar IPVA até sexta", "ligar pro cliente amanhã"), crie uma ação "task" com title, date (AAAA-MM-DD ou null), time (HH:MM ou null), priority (baixa, normal ou alta).
7. Quando a pessoa pedir para pôr coisas na lista de compras, crie uma ação "shopping" com items [{name, qty, unit}].
Pode haver várias ações numa mensagem. A pessoa confirma cada ação antes de salvar, então no reply diga o que você preparou ("Preparei a despesa de R$ 45,00 em Mercado, confirma?").

Responda SEMPRE e SÓ com JSON neste formato:
{"reply": "texto para a pessoa (pode usar **negrito** e listas com -)", "actions": [
  {"kind":"transaction","type":"despesa","amount":45.0,"description":"Mercado","category":"Mercado","payment":"pix","account":null,"card":null,"installments":null,"scope":"pessoal","date":"${t.date}"},
  {"kind":"task","title":"Dentista","date":"2026-11-05","time":"15:00","priority":"normal"},
  {"kind":"shopping","items":[{"name":"leite","qty":2,"unit":"l"}]}
]}
Se não houver ação, use "actions": [].`;
}


function captureSystem(ctx: unknown) {
  const t = todayBR();
  return `Você transforma o que a pessoa falou em lançamentos do app de finanças Arvia (pt-BR). Hoje é ${t.weekday}, ${t.date}.
Cadastros da pessoa (use os nomes EXATOS daqui; os últimos lançamentos mostram como ela costuma classificar):
${JSON.stringify(ctx)}

Regras:
- Cada gasto ou recebimento falado vira uma transação. "gastei", "paguei", "comprei", "saiu" = despesa. "recebi", "entrou", "caiu", "ganhei" = receita.
- amount em reais (número). "45 conto" = 45. "dois mil" = 2000. "mil e duzentos" = 1200.
- category: o nome EXATO de uma categoria do mesmo tipo. Escolha pelo sentido (padaria, ifood, restaurante = Restaurante ou Alimentação se existir; posto = Gasolina; farmácia = Saúde; luz, água, internet = Contas). Se a pessoa já lançou algo parecido nos últimos lançamentos, siga a mesma categoria.
- description: curta e útil, com o nome do lugar se falado ("Padaria", "Posto Shell", "Comissão Ademicon").
- payment: pix, dinheiro, debito ou credito. Sem informação: pix. "no cartão" sem dizer débito = credito.
- account: nome exato da conta citada ("no Nubank", "pelo C6"); card: nome exato do cartão se for crédito; installments se falar "em 3x".
- scope: "casa" se for gasto da casa (mercado, contas da casa, carro, feira) e tem_casa for true; "empresa" se for da empresa (comissão, imposto, DAS, contador, anúncios, ferramenta de trabalho, gasto pago pela conta da empresa) e tem_empresa for true; senão "pessoal". Use as categorias do mesmo escopo.
- date AAAA-MM-DD: hoje, salvo "ontem", "anteontem", "sexta passada", "dia 10".
- Compromissos e lembretes ("dentista amanhã 15h") viram tarefa.
- Se faltar o valor de um gasto, NÃO crie a transação: coloque a frase em "missing".
Responda só JSON:
{"actions":[{"kind":"transaction","type":"despesa","amount":45,"description":"Mercado","category":"Mercado","payment":"pix","account":null,"card":null,"installments":null,"scope":"pessoal","date":"${t.date}"},{"kind":"task","title":"Dentista","date":"AAAA-MM-DD","time":"15:00","priority":"normal"}],"missing":["o uber de ontem"]}`;
}

function cleanActions(raw: unknown) {
  const list = (raw as { actions?: unknown })?.actions;
  if (!Array.isArray(list)) return [];
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  return list.slice(0, 10).flatMap((a): Record<string, unknown>[] => {
    const x = a as Record<string, unknown>;
    if (x.kind === "transaction") {
      const amount = Number(x.amount);
      if (!(amount > 0 && amount < 10_000_000)) return [];
      return [{
        kind: "transaction",
        type: x.type === "receita" ? "receita" : "despesa",
        amount_cents: Math.round(amount * 100),
        description: String(x.description ?? x.category ?? "Lançamento").slice(0, 80),
        category: x.category ? String(x.category).slice(0, 60) : null,
        payment: ["pix", "dinheiro", "debito", "credito"].includes(String(x.payment)) ? String(x.payment) : "pix",
        account: x.account ? String(x.account).slice(0, 60) : null,
        card: x.card ? String(x.card).slice(0, 60) : null,
        installments: Number(x.installments) >= 2 && Number(x.installments) <= 48 ? Math.round(Number(x.installments)) : null,
        scope: x.scope === "casa" ? "casa" : x.scope === "empresa" ? "empresa" : "pessoal",
        date: iso.test(String(x.date)) ? String(x.date) : todayBR().date,
      }];
    }
    if (x.kind === "task") {
      const title = String(x.title ?? "").trim().slice(0, 120);
      if (!title) return [];
      return [{
        kind: "task",
        title,
        date: iso.test(String(x.date)) ? String(x.date) : null,
        time: /^\d{1,2}:\d{2}$/.test(String(x.time)) ? String(x.time).padStart(5, "0") : null,
        priority: ["baixa", "normal", "alta"].includes(String(x.priority)) ? String(x.priority) : "normal",
      }];
    }
    if (x.kind === "shopping") {
      const items = cleanItems({ items: x.items });
      return items.length ? [{ kind: "shopping", items }] : [];
    }
    return [];
  });
}


// ---------- Apple Watch / Siri (app Atalhos) ----------
type Cat = { id: string; name: string; kind: string; scope: string };
type Acc = { id: string; name: string; type: string; scope: string };
type Crd = { id: string; label: string; scope: string };
type Catalog = { household: string | null; categories: Cat[]; accounts: Acc[]; cards: Crd[] };

const nrm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function pick<T>(list: T[], name: unknown, label: (x: T) => string): T | undefined {
  if (!name) return undefined;
  const n = nrm(String(name));
  if (!n) return undefined;
  return list.find((x) => nrm(label(x)) === n) ?? list.find((x) => nrm(label(x)).includes(n) || n.includes(nrm(label(x))));
}
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PAYW: Record<string, string> = { pix: "Pix", dinheiro: "dinheiro", debito: "débito", credito: "crédito" };

/** Liga o que a IA entendeu aos cadastros. No relógio não dá para perguntar: usa o mais provável. */
function resolveWatchTx(a: Record<string, unknown>, cat: Catalog) {
  const hasEmpresa = cat.categories.some((c) => c.scope === "empresa");
  const scope = a.scope === "casa" && cat.household ? "casa" : a.scope === "empresa" && hasEmpresa ? "empresa" : "pessoal";
  const type = a.type === "receita" ? "receita" : "despesa";
  const cats = cat.categories.filter((c) => c.scope === scope && c.kind === type);
  const accs = cat.accounts.filter((c) => c.scope === scope);
  const cards = cat.cards.filter((c) => c.scope === scope);
  const category = pick(cats, a.category, (c) => c.name) ?? pick(cats, a.description, (c) => c.name) ?? cats.find((c) => nrm(c.name).startsWith("outr"));
  let card: Crd | undefined;
  let account: Acc | undefined;
  let payment = String(a.payment ?? "pix");
  let named: Acc | undefined;
  let missingAccount: string | null = null;
  if (type === "despesa" && (payment === "credito" || a.card)) card = pick(cards, a.card, (c) => c.label) ?? cards[0];
  if (!card) {
    if (payment === "credito") payment = "debito";
    named = payment === "dinheiro" ? undefined : pick(accs, a.account, (x) => x.name);
    if (a.account && !named && payment !== "dinheiro") missingAccount = String(a.account);
    account = named ?? (payment === "dinheiro" ? accs.find((x) => x.type === "dinheiro") : undefined)
      ?? (payment === "dinheiro" ? undefined : accs.find((x) => x.type !== "dinheiro" && x.type !== "investimento") ?? accs[0]);
  }
  return {
    scope, type,
    amount_cents: Number(a.amount_cents),
    description: String(a.description ?? category?.name ?? "Lançamento").slice(0, 80),
    date: String(a.date),
    payment: card ? "credito" : payment,
    category_id: category?.id ?? null, category_name: category?.name ?? null,
    account_id: account?.id ?? null, account_name: account?.name ?? null,
    card_id: card?.id ?? null, card_name: card?.label ?? null,
    installments: card && Number(a.installments) >= 2 ? Number(a.installments) : null,
    missing_account: missingAccount,
  };
}

function voiceSystem(ctx: unknown) {
  const t = todayBR();
  return `Você é o assistente da Arvia respondendo pelo Apple Watch: a resposta será LIDA EM VOZ ALTA.
Responda em português do Brasil, em no máximo 3 frases curtas, sem listas, sem markdown, sem emojis e sem travessão. Diga valores por extenso de forma natural ("R$ 1.250" vira "mil duzentos e cinquenta reais").
Hoje é ${t.weekday}, ${t.date}, ${t.time}. Use só estes DADOS para números; se não tiver a informação, diga que não tem no app:
${JSON.stringify(ctx)}`;
}

async function handleWatch(admin: ReturnType<typeof createClient>, uid: string, keys: Keys, said: string): Promise<string> {
  const text = said.trim().slice(0, 1500);
  if (!text) return "Não ouvi nada. Tente de novo.";

  if (/^(desfa[zç]|desfazer|cancela(r)? (o )?[uú]ltimo|apaga(r)? (o )?[uú]ltimo)/i.test(text)) {
    const { data } = await admin.rpc("watch_undo", { p_owner: uid });
    const n = Number((data as { undone?: number })?.undone ?? 0);
    return n ? `Pronto, desfiz ${n === 1 ? "o último lançamento" : `os ${n} últimos lançamentos`}.` : "Não achei nada lançado pelo relógio nos últimos 30 minutos.";
  }

  const { data: ctx } = await admin.rpc("assistant_context", { p_owner: uid });
  const c = (ctx ?? {}) as Record<string, unknown>;
  const slim = { tem_casa: c.tem_casa, tem_empresa: c.tem_empresa, categorias: c.categorias, contas: c.contas, cartoes: c.cartoes, ultimos_lancamentos: c.ultimos_lancamentos };
  const r = await llm(keys, captureSystem(slim), [{ role: "user", content: text }], true);
  let parsed: { missing?: unknown } = {};
  try {
    parsed = parseJson(r.text) as { missing?: unknown };
  } catch {
    parsed = {};
  }
  const actions = cleanActions(parsed).filter((a) => a.kind !== "shopping");
  const missing = Array.isArray(parsed?.missing) ? parsed.missing.map((m) => String(m)) : [];

  if (actions.length === 0 && missing.length === 0) {
    // não é lançamento: é pergunta para o assistente
    const ans = await llm(keys, voiceSystem(ctx), [{ role: "user", content: text }], false);
    return ans.text.replace(/\*\*/g, "").replace(/^\s*[-•]\s*/gm, "").trim().slice(0, 600) || "Não consegui responder agora.";
  }

  const { data: catData } = await admin.rpc("watch_catalog", { p_owner: uid });
  const cat = catData as Catalog;
  const txIds: string[] = [];
  const groupIds: string[] = [];
  const taskIds: string[] = [];
  const said_parts: string[] = [];
  for (const a of actions) {
    if (a.kind === "task") {
      const { data: t, error } = await admin.from("tasks").insert({ owner_id: uid, scope: "pessoal", title: a.title, date: a.date, time: a.time, priority: a.priority }).select("id").single();
      if (!error && t) {
        taskIds.push(String(t.id));
        said_parts.push(`na agenda: ${a.title}${a.date ? ` em ${String(a.date).slice(8, 10)}/${String(a.date).slice(5, 7)}` : ""}${a.time ? ` às ${a.time}` : ""}`);
      }
      continue;
    }
    const tx = resolveWatchTx(a, cat);
    if (tx.payment === "dinheiro" && !tx.account_id) {
      // sem conta Dinheiro: cria a Carteira em vez de cair no banco
      const { data: cash } = await admin.rpc("watch_cash_account", { p_owner: uid, p_scope: tx.scope });
      if (cash) {
        tx.account_id = String(cash);
        tx.account_name = "Carteira";
        cat.accounts.push({ id: String(cash), name: "Carteira", type: "dinheiro", scope: tx.scope });
      }
    }
    if (!tx.account_id && !tx.card_id) {
      said_parts.push(`não lancei ${brl(tx.amount_cents)} de ${tx.description} porque não há conta cadastrada`);
      continue;
    }
    const { data: id, error } = await admin.rpc("watch_add_tx", { p_owner: uid, p: tx });
    if (error || !id) {
      said_parts.push(`não consegui lançar ${brl(tx.amount_cents)} de ${tx.description}`);
      continue;
    }
    (tx.installments ? groupIds : txIds).push(String(id));
    const onde = tx.card_name ? `no cartão ${tx.card_name}${tx.installments ? ` em ${tx.installments} vezes` : ""}` : tx.payment === "dinheiro" ? `em dinheiro, na ${tx.account_name ?? "Carteira"}` : `${PAYW[tx.payment] ?? tx.payment}${tx.account_name ? ` na ${tx.account_name}` : ""}`;
    said_parts.push(`${tx.type === "receita" ? "receita" : "despesa"} de ${brl(tx.amount_cents)} em ${tx.category_name ?? "sem categoria"}, ${onde}${tx.scope === "casa" ? ", na Casa" : tx.scope === "empresa" ? ", na Empresa" : ""}${tx.missing_account ? ` (não achei a conta ${tx.missing_account} no app)` : ""}`);
  }
  if (txIds.length || groupIds.length || taskIds.length) {
    await admin.from("watch_events").insert({ owner_id: uid, said: text, tx_ids: txIds, group_ids: groupIds, task_ids: taskIds });
    await admin.rpc("watch_after", { p_owner: uid });
  }
  let out = said_parts.length ? `Lancei: ${said_parts.join("; ")}.` : "";
  if (missing.length) out += `${out ? " " : ""}Faltou o valor de ${missing.join(" e ")}.`;
  if (txIds.length || groupIds.length) out += " Se errei, diga desfazer.";
  return out.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const plain = (t: string, status = 200) => new Response(t, { status, headers: { ...cors, "content-type": "text/plain; charset=utf-8" } });
  const qs = new URL(req.url).searchParams;
  if (req.method !== "POST" && !(req.method === "GET" && qs.get("chave"))) return json({ error: "Método não permitido." }, 405);
  let watchMode = false;
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    let body: Record<string, unknown> = {};
    const ctype = req.headers.get("content-type") ?? "";
    if (req.method === "POST" && /form/i.test(ctype)) {
      // Atalhos com corpo "Formulário"
      try {
        const fd = await req.formData();
        for (const [k, v] of fd.entries()) body[k.toLowerCase()] = typeof v === "string" ? v : "";
      } catch {
        body = {};
      }
    } else if (req.method === "POST") {
      const raw = await req.text();
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        body = parsed && typeof parsed === "object" ? parsed : { texto: String(parsed) };
        if (body.Texto && !body.texto) body.texto = body.Texto;
      } catch {
        // o Atalhos pode mandar só o texto puro
        body = { texto: raw };
      }
    }
    if (!body.texto && qs.get("texto")) body.texto = qs.get("texto");

    // relógio: chave pessoal no endereço (?chave=), no header x-arvia-chave ou no corpo
    const watchKey = (qs.get("chave") ?? req.headers.get("x-arvia-chave") ?? String(body.chave ?? "")).trim();
    if (!watchKey && !req.headers.get("Authorization")) return plain("Falta a chave do relógio no endereço. Copie de novo o endereço nos Ajustes da Arvia.", 401);
    let uid: string;
    if (watchKey) {
      watchMode = true;
      if (!/^arv_[A-Za-z0-9_-]{20,60}$/.test(watchKey)) return plain("Chave inválida. Gere uma chave nova nos Ajustes da Arvia.", 401);
      const { data: owner } = await admin.rpc("watch_owner", { p_key: watchKey });
      if (!owner) return plain("Essa chave não vale mais. Gere uma nova nos Ajustes da Arvia.", 401);
      uid = String(owner);
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
      const { data: u, error: uerr } = await userClient.auth.getUser();
      if (uerr || !u.user) return json({ error: "Entre na sua conta." }, 401);
      uid = u.user.id;
    }
    const [g1, g2] = await Promise.all([admin.rpc("get_ai_key", { p_owner: uid, p_provider: "groq" }), admin.rpc("get_ai_key", { p_owner: uid, p_provider: "gemini" })]);
    const keys: Keys = { groq: (g1.data as string | null) ?? null, gemini: (g2.data as string | null) ?? null };

    if (watchMode) {
      if (!keys.groq && !keys.gemini) return plain("A inteligência artificial não está configurada. Cole a chave do Groq ou do Gemini nos Ajustes da Arvia.");
      return plain(await handleWatch(admin, uid, keys, String(body.texto ?? body.text ?? "")));
    }
    const action = String(body.action ?? "");

    if (action === "transcribe") {
      const audio = String(body.audio ?? "");
      if (audio.length < 100 || audio.length > 14_000_000) return json({ error: "Áudio vazio ou longo demais (até uns 5 minutos)." }, 400);
      const r = await transcribe(keys, audio, String(body.mime ?? "audio/webm"));
      return json(r);
    }

    if (action === "items") {
      const text = String(body.text ?? "").slice(0, 3000);
      if (!text.trim()) return json({ items: [] });
      const r = await llm(keys, ITEMS_PROMPT, [{ role: "user", content: text }], true);
      return json({ items: cleanItems(parseJson(r.text)), provider: r.provider });
    }

    if (action === "photo_list") {
      if (!keys.gemini) return json({ error: "sem_gemini" }, 400);
      const image = String(body.image ?? "");
      if (image.length < 100 || image.length > 7_000_000) return json({ error: "Foto inválida ou grande demais." }, 400);
      const mime = ["image/jpeg", "image/png", "image/webp"].includes(String(body.mime)) ? String(body.mime) : "image/jpeg";
      const text = await geminiCall(keys.gemini, ITEMS_PROMPT.replace("o que a pessoa falou ou escreveu", "a FOTO de uma lista escrita à mão ou impressa") + "\nIgnore itens riscados, datas e títulos.", [{ inline_data: { mime_type: mime, data: image } }], [], true);
      return json({ items: cleanItems(parseJson(text)), provider: "gemini" });
    }

    if (action === "task") {
      const text = String(body.text ?? "").slice(0, 500);
      const t = todayBR();
      const r = await llm(keys, `Hoje é ${t.weekday}, ${t.date}. Transforme o pedido em uma tarefa de agenda. Datas relativas ("amanhã", "quinta", "dia 10") viram AAAA-MM-DD no futuro mais próximo. Responda só JSON: {"title":"...","date":"AAAA-MM-DD ou null","time":"HH:MM ou null","priority":"baixa|normal|alta"}`, [{ role: "user", content: text }], true);
      const [task] = cleanActions({ actions: [{ kind: "task", ...(parseJson(r.text) as object) }] });
      return json({ task: task ?? null, provider: r.provider });
    }

    if (action === "capture") {
      let text = String(body.text ?? "").slice(0, 3000).trim();
      if (!text) {
        const audio = String(body.audio ?? "");
        if (audio.length < 100 || audio.length > 14_000_000) return json({ error: "Áudio vazio ou longo demais (até uns 5 minutos)." }, 400);
        text = (await transcribe(keys, audio, String(body.mime ?? "audio/webm"))).text;
      }
      if (!text) return json({ text: "", actions: [], missing: [] });
      const { data: ctx, error: cerr } = await admin.rpc("assistant_context", { p_owner: uid });
      if (cerr) return json({ error: "Não consegui ler seus dados agora." }, 500);
      const c = ctx as Record<string, unknown>;
      const slim = { tem_casa: c.tem_casa, tem_empresa: c.tem_empresa, categorias: c.categorias, contas: c.contas, cartoes: c.cartoes, ultimos_lancamentos: c.ultimos_lancamentos };
      const r = await llm(keys, captureSystem(slim), [{ role: "user", content: text }], true);
      const parsed = parseJson(r.text) as { missing?: unknown };
      const actions = cleanActions(parsed).filter((a) => a.kind !== "shopping");
      const missing = Array.isArray(parsed?.missing) ? parsed.missing.slice(0, 5).map((m) => String(m).slice(0, 120)) : [];
      return json({ text, actions, missing, provider: r.provider });
    }

    if (action === "chat") {
      const msgs = (Array.isArray(body.messages) ? body.messages : [])
        .slice(-12)
        .map((m) => ({ role: (m as Msg).role === "assistant" ? "assistant" : "user", content: String((m as Msg).content ?? "").slice(0, 2500) }) as Msg)
        .filter((m) => m.content.trim());
      if (!msgs.length || msgs[msgs.length - 1]!.role !== "user") return json({ error: "Escreva uma mensagem." }, 400);
      const { data: ctx, error: cerr } = await admin.rpc("assistant_context", { p_owner: uid });
      if (cerr) return json({ error: "Não consegui ler seus dados agora." }, 500);
      const r = await llm(keys, chatSystem(ctx), msgs, true);
      let parsed: unknown;
      try {
        parsed = parseJson(r.text);
      } catch {
        return json({ reply: r.text.slice(0, 4000), actions: [], provider: r.provider });
      }
      const reply = String((parsed as { reply?: unknown })?.reply ?? "").slice(0, 6000) || "Pronto.";
      return json({ reply, actions: cleanActions(parsed), provider: r.provider });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    if (watchMode) {
      const m = e instanceof AiError && e.code.startsWith("chave") ? "A chave da inteligência artificial foi recusada. Troque nos Ajustes da Arvia." : e instanceof AiError && /429/.test(e.message) ? "A cota grátis da IA acabou por agora. Tente em alguns minutos." : "Não consegui agora. Tente de novo em instantes.";
      return plain(m);
    }
    if (e instanceof AiError) return json({ error: e.code, message: e.message }, e.code === "falhou" ? 502 : 400);
    return json({ error: "falhou", message: "Não consegui responder agora." }, 500);
  }
});
