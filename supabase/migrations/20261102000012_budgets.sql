-- Orçamento: teto mensal por categoria (vale para todos os meses) e meta de quanto guardar (% da receita).
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  limit_cents bigint check (limit_cents is null or limit_cents > 0),
  savings_pct int check (savings_pct is null or savings_pct between 1 and 90),
  created_at timestamptz not null default now(),
  check ((category_id is not null and limit_cents is not null and savings_pct is null)
      or (category_id is null and limit_cents is null and savings_pct is not null))
);

create trigger set_scope before insert or update of scope on public.budgets
  for each row execute function public.set_scope_fields();
alter table public.budgets enable row level security;
create policy sel on public.budgets for select to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()));
create policy ins on public.budgets for insert to authenticated with check (owner_id = auth.uid());
create policy upd on public.budgets for update to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household())) with check (scope = 'casa' or owner_id = auth.uid());
create policy del on public.budgets for delete to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()));
revoke all on public.budgets from anon;
