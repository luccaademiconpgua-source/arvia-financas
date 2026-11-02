-- Patrimônio: bens (imóvel, veículo, investimento fora das contas, outros) e cartas de consórcio,
-- mais uma foto mensal do patrimônio líquido para ver a evolução.

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  kind text not null check (kind in ('imovel', 'veiculo', 'investimento', 'consorcio', 'outro')),
  name text not null check (char_length(name) between 1 and 60),
  value_cents bigint check (value_cents is null or value_cents >= 0),
  vehicle_id uuid references public.vehicles (id) on delete cascade,
  -- consórcio
  administrator text check (administrator is null or char_length(administrator) <= 40),
  credit_cents bigint check (credit_cents is null or credit_cents > 0),
  term_months int check (term_months is null or term_months between 1 and 400),
  paid_months int check (paid_months is null or paid_months >= 0),
  installment_cents bigint check (installment_cents is null or installment_cents > 0),
  contemplated boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (kind <> 'consorcio' or (credit_cents is not null and term_months is not null and paid_months is not null and installment_cents is not null and paid_months <= term_months)),
  check (kind = 'consorcio' or value_cents is not null)
);
create unique index assets_vehicle_uniq on public.assets (vehicle_id) where vehicle_id is not null;

create table public.networth_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  assets_cents bigint not null,
  liabilities_cents bigint not null,
  updated_at timestamptz not null default now()
);
create unique index networth_pessoal on public.networth_snapshots (owner_id, month) where scope = 'pessoal';
create unique index networth_casa on public.networth_snapshots (household_id, month) where scope = 'casa';

do $$
declare t text;
begin
  foreach t in array array['assets','networth_snapshots'] loop
    execute format('create trigger set_scope before insert or update of scope on public.%I for each row execute function public.set_scope_fields()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy sel on public.%I for select to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()))$p$, t);
    execute format($p$create policy ins on public.%I for insert to authenticated with check (owner_id = auth.uid())$p$, t);
    execute format($p$create policy upd on public.%I for update to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household())) with check (scope = 'casa' or owner_id = auth.uid())$p$, t);
    execute format($p$create policy del on public.%I for delete to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()))$p$, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Guarda (ou atualiza) a foto do mês.
create function public.save_networth_snapshot(p_scope text, p_month text, p_assets bigint, p_liabilities bigint) returns void
language plpgsql set search_path = ''
as $$
declare v_id uuid;
begin
  if p_scope = 'casa' then
    select id into v_id from public.networth_snapshots where scope = 'casa' and household_id = public.my_household() and month = p_month;
  else
    select id into v_id from public.networth_snapshots where scope = 'pessoal' and owner_id = auth.uid() and month = p_month;
  end if;
  if v_id is null then
    insert into public.networth_snapshots (scope, month, assets_cents, liabilities_cents) values (p_scope, p_month, p_assets, p_liabilities);
  else
    update public.networth_snapshots set assets_cents = p_assets, liabilities_cents = p_liabilities, updated_at = now() where id = v_id;
  end if;
end $$;
revoke execute on function public.save_networth_snapshot(text, text, bigint, bigint) from public, anon;
grant execute on function public.save_networth_snapshot(text, text, bigint, bigint) to authenticated;

-- Redefinir conta passa a limpar também o que foi criado depois.
create or replace function public.reset_my_account(p_confirm text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  if p_confirm is distinct from 'REDEFINIR' then raise exception 'Digite REDEFINIR para confirmar.'; end if;

  delete from public.transactions where owner_id = v_uid and scope = 'pessoal';
  delete from public.nfce_scans where owner_id = v_uid and scope = 'pessoal';
  delete from public.assets where owner_id = v_uid and scope = 'pessoal';
  delete from public.networth_snapshots where owner_id = v_uid and scope = 'pessoal';
  delete from public.recurrences where owner_id = v_uid and scope = 'pessoal';
  delete from public.budgets where owner_id = v_uid and scope = 'pessoal';
  delete from public.category_rules where owner_id = v_uid and scope = 'pessoal';
  delete from public.shopping_items where owner_id = v_uid and scope = 'pessoal';
  delete from public.pantry_items where owner_id = v_uid and scope = 'pessoal';
  delete from public.meal_plan where owner_id = v_uid and scope = 'pessoal';
  delete from public.recipes where owner_id = v_uid and scope = 'pessoal';
  delete from public.vehicles where owner_id = v_uid and scope = 'pessoal';
  delete from public.goals where owner_id = v_uid and scope = 'pessoal';
  delete from public.debts where owner_id = v_uid and scope = 'pessoal';
  delete from public.cards where owner_id = v_uid and scope = 'pessoal';
  delete from public.accounts where owner_id = v_uid and scope = 'pessoal';
  delete from public.categories where owner_id = v_uid and scope = 'pessoal';
  delete from public.pluggy_items where owner_id = v_uid;
  perform public.seed_categories(v_uid, 'pessoal');
end $$;
