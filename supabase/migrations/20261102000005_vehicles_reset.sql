-- Veículos (estilo Drivvo): abastecimentos, serviços, despesas e lembretes.
-- Mesmo modelo de escopo das outras tabelas: pessoal ou casa.

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  plate text check (plate is null or char_length(plate) <= 10),
  fuel text not null default 'flex' check (fuel in ('flex', 'gasolina', 'etanol', 'diesel', 'gnv', 'eletrico')),
  initial_odometer int not null default 0 check (initial_odometer >= 0),
  created_at timestamptz not null default now()
);

create table public.vehicle_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  kind text not null check (kind in ('abastecimento', 'servico', 'despesa')),
  date date not null,
  odometer int check (odometer is null or odometer >= 0),
  liters numeric(8, 3) check (liters is null or liters > 0),
  price_per_liter_cents int check (price_per_liter_cents is null or price_per_liter_cents > 0),
  fuel text check (fuel is null or fuel in ('gasolina', 'etanol', 'diesel', 'gnv', 'eletrico')),
  full_tank boolean not null default true,
  subtype text check (subtype is null or char_length(subtype) <= 40),
  description text check (description is null or char_length(description) <= 120),
  place text check (place is null or char_length(place) <= 60),
  amount_cents bigint not null check (amount_cents >= 0),
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'abastecimento' or (liters is not null and odometer is not null))
);
create index on public.vehicle_logs (vehicle_id, date desc);

create table public.vehicle_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 40),
  every_km int check (every_km is null or every_km > 0),
  every_months int check (every_months is null or every_months between 1 and 120),
  last_km int check (last_km is null or last_km >= 0),
  last_date date,
  created_at timestamptz not null default now(),
  check (every_km is not null or every_months is not null)
);

do $$
declare t text;
begin
  foreach t in array array['vehicles','vehicle_logs','vehicle_reminders'] loop
    execute format('create trigger set_scope before insert or update of scope on public.%I for each row execute function public.set_scope_fields()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy sel on public.%I for select to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()))$p$, t);
    execute format($p$create policy ins on public.%I for insert to authenticated with check (owner_id = auth.uid())$p$, t);
    execute format($p$create policy upd on public.%I for update to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household())) with check (scope = 'casa' or owner_id = auth.uid())$p$, t);
    execute format($p$create policy del on public.%I for delete to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()))$p$, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Registro e lembrete precisam apontar para um veículo visível, no mesmo escopo
create function public.check_vehicle_ref() returns trigger
language plpgsql set search_path = ''
as $$
declare v_scope text;
begin
  select scope into v_scope from public.vehicles where id = new.vehicle_id;
  if not found then raise exception 'Veículo não encontrado.'; end if;
  new.scope := v_scope;
  return new;
end $$;

-- o nome começa com "a_" para rodar antes do set_scope (gatilhos rodam em ordem alfabética)
create trigger a_check_vehicle before insert or update on public.vehicle_logs
  for each row execute function public.check_vehicle_ref();
create trigger a_check_vehicle before insert or update on public.vehicle_reminders
  for each row execute function public.check_vehicle_ref();

-- ---------- Categoria Veículo ----------
create or replace function public.seed_categories(p_owner uuid, p_scope text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_scope = 'pessoal' then
    insert into public.categories (owner_id, scope, name, kind, essential) values
      (p_owner, 'pessoal', 'Academia', 'despesa', true), (p_owner, 'pessoal', 'Contas', 'despesa', true),
      (p_owner, 'pessoal', 'Alimentação', 'despesa', true), (p_owner, 'pessoal', 'Saúde e bem-estar', 'despesa', true),
      (p_owner, 'pessoal', 'Mercado', 'despesa', true), (p_owner, 'pessoal', 'Parcelas', 'despesa', true),
      (p_owner, 'pessoal', 'Vestuário', 'despesa', false), (p_owner, 'pessoal', 'Gasolina', 'despesa', false),
      (p_owner, 'pessoal', 'Veículo', 'despesa', true),
      (p_owner, 'pessoal', 'Plano de telefone', 'despesa', true), (p_owner, 'pessoal', 'Lazer', 'despesa', false),
      (p_owner, 'pessoal', 'Restaurante', 'despesa', false), (p_owner, 'pessoal', 'Educação', 'despesa', false),
      (p_owner, 'pessoal', 'Assinaturas', 'despesa', false), (p_owner, 'pessoal', 'Moradia', 'despesa', true),
      (p_owner, 'pessoal', 'Compras online', 'despesa', false), (p_owner, 'pessoal', 'Outras', 'despesa', false),
      (p_owner, 'pessoal', 'Salário', 'receita', false), (p_owner, 'pessoal', 'Outras receitas', 'receita', false);
  else
    insert into public.categories (owner_id, scope, name, kind, essential) values
      (p_owner, 'casa', 'Moradia', 'despesa', true), (p_owner, 'casa', 'Contas', 'despesa', true),
      (p_owner, 'casa', 'Mercado', 'despesa', true), (p_owner, 'casa', 'Alimentação', 'despesa', true),
      (p_owner, 'casa', 'Parcelas', 'despesa', true), (p_owner, 'casa', 'Saúde e bem-estar', 'despesa', true),
      (p_owner, 'casa', 'Gasolina', 'despesa', false), (p_owner, 'casa', 'Veículo', 'despesa', true),
      (p_owner, 'casa', 'Lazer', 'despesa', false), (p_owner, 'casa', 'Restaurante', 'despesa', false),
      (p_owner, 'casa', 'Outras', 'despesa', false),
      (p_owner, 'casa', 'Aporte', 'receita', false), (p_owner, 'casa', 'Outras receitas', 'receita', false);
  end if;
end $$;

-- quem já tem conta ganha as categorias novas
insert into public.categories (owner_id, scope, household_id, name, kind, essential)
select distinct c.owner_id, c.scope, c.household_id, 'Veículo', 'despesa', true
from public.categories c
where not exists (select 1 from public.categories x where x.owner_id = c.owner_id and x.scope = c.scope and x.name = 'Veículo');

insert into public.categories (owner_id, scope, household_id, name, kind, essential)
select distinct c.owner_id, c.scope, c.household_id, 'Gasolina', 'despesa', false
from public.categories c
where c.scope = 'casa'
  and not exists (select 1 from public.categories x where x.owner_id = c.owner_id and x.scope = 'casa' and x.name = 'Gasolina');

-- ---------- Redefinir a conta ----------
-- Apaga só os dados PESSOAIS de quem chama e recria as categorias padrão.
-- Nada do escopo Casa é tocado, para não apagar dados da outra pessoa.
create function public.reset_my_account(p_confirm text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  if p_confirm is distinct from 'REDEFINIR' then raise exception 'Digite REDEFINIR para confirmar.'; end if;

  delete from public.transactions where owner_id = v_uid and scope = 'pessoal';
  delete from public.nfce_scans where owner_id = v_uid and scope = 'pessoal';
  delete from public.vehicles where owner_id = v_uid and scope = 'pessoal';
  delete from public.goals where owner_id = v_uid and scope = 'pessoal';
  delete from public.debts where owner_id = v_uid and scope = 'pessoal';
  delete from public.cards where owner_id = v_uid and scope = 'pessoal';
  delete from public.accounts where owner_id = v_uid and scope = 'pessoal';
  delete from public.categories where owner_id = v_uid and scope = 'pessoal';
  delete from public.pluggy_items where owner_id = v_uid;
  perform public.seed_categories(v_uid, 'pessoal');
end $$;

revoke execute on function public.reset_my_account(text) from public, anon;
grant execute on function public.reset_my_account(text) to authenticated;
revoke execute on function public.check_vehicle_ref() from public, anon, authenticated;
