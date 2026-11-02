-- Metas ligadas ao patrimônio:
-- reserva de N meses de gastos essenciais, lance de uma carta de consórcio (percentual do crédito),
-- dinheiro guardado numa conta específica (o saldo dela é o progresso) e data-alvo opcional.

alter table public.goals drop constraint goals_kind_check;
alter table public.goals add constraint goals_kind_check check (kind in ('emergencia', 'geral', 'lance'));

alter table public.goals
  add column months_target int check (months_target is null or months_target between 1 and 24),
  add column asset_id uuid references public.assets (id) on delete set null,
  add column lance_pct numeric(5, 2) check (lance_pct is null or (lance_pct > 0 and lance_pct <= 100)),
  add column account_id uuid references public.accounts (id) on delete set null,
  add column target_date date;
