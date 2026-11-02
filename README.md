# Arvia Finanças

Sistema web de finanças pessoais e da casa, em português do Brasil, pensado para o celular (PWA).
Cada pessoa tem sua conta e suas finanças pessoais. A "Casa" é o espaço compartilhado do casal.

Stack: Vite, React 19, TypeScript, Tailwind v4, Recharts, Supabase (Postgres, Auth, RLS) e Vercel.
Custo: tudo roda nos planos gratuitos.

## Como funciona

- **Pessoal:** só quem criou vê. **Casa:** os dois moradores veem e lançam. A casa aceita no máximo 2 pessoas.
- As regras de segurança ficam no banco (Row Level Security), não só no app.
- Dinheiro é inteiro em centavos. O saldo da conta vem da view `account_balances`.
- Lançar, excluir, ajustar saldo, pagar fatura e pagar parcela são funções do Postgres (`supabase/migrations`), atômicas.
- Notas fiscais (NFC-e): `POST /api/nfce` (função da Vercel em `api/nfce.ts`, mesmo código em `server/nfce.ts`).

## Rodar local

```bash
npm install
cp .env.example .env.local   # URL e chave publishable do Supabase
npm run dev
npm test
npm run build
```

A chave `publishable` é pública por desenho. Nunca coloque a `service_role` nem segredos no front-end.

## Banco

As migrações estão em `supabase/migrations`. Para recriar o banco, aplique-as em ordem num projeto novo.

## Deploy na Vercel

1. Importe este repositório na Vercel (framework Vite).
2. Em Settings, Environment Variables, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. No Supabase, em Authentication, URL Configuration, coloque o endereço da Vercel em Site URL.

## Open Finance

Integração com o Meu Pluggy (gratuito, só uso pessoal, até 5 conexões, só contas do próprio titular).
Cada pessoa cria o próprio Client ID e Client Secret (passo a passo na tela Conexões). O segredo vai para o
Supabase Vault e só a Edge Function `supabase/functions/pluggy` o lê.

Para publicar a função em outro projeto: `supabase functions deploy pluggy --no-verify-jwt` (ela valida o login por conta própria).
A gravação dos dados está em `apply_pluggy_sync` (migração `20261102000002`).

Não foi testado contra a API real da Pluggy, só a gravação com dados de exemplo. Importação de extrato OFX e CSV ainda não existe.

## Atenção

O leitor de notas do Paraná foi escrito pela estrutura conhecida da página e testado só com HTML de exemplo.
Teste com uma nota real e ajuste `parsePrHtml` se o layout da SEFAZ mudou.
