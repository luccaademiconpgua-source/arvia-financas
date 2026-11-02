-- Cozinha e compras: lista de compras, despensa, receitas, cardápio e histórico de preços (pelas notas fiscais).

-- ---------- Preços: cada item de cada nota lançada vira um ponto de preço ----------
create view public.price_points with (security_invoker = true) as
select
  s.id as scan_id,
  s.owner_id,
  s.scope,
  s.household_id,
  s.store_name,
  (s.issued_at at time zone 'America/Sao_Paulo')::date as date,
  i->>'description' as item,
  public.norm_txt(i->>'description') as key,
  greatest(coalesce((i->>'quantity')::numeric, 1), 0.001) as quantity,
  coalesce(nullif(i->>'unit', ''), 'UN') as unit,
  (i->>'totalCents')::bigint as total_cents,
  round((i->>'totalCents')::numeric / greatest(coalesce((i->>'quantity')::numeric, 1), 0.001))::bigint as unit_cents
from public.nfce_scans s
cross join lateral jsonb_array_elements(s.items) i
where s.status = 'lancada' and (i->>'totalCents') is not null;

-- ---------- Tabelas com o mesmo modelo de escopo (pessoal ou casa) ----------
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'casa' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  quantity numeric(10, 3) check (quantity is null or quantity > 0),
  unit text check (unit is null or char_length(unit) <= 10),
  checked boolean not null default false,
  checked_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'despensa', 'cardapio')),
  created_at timestamptz not null default now()
);

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'casa' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  key text not null,
  status text not null default 'tem' check (status in ('tem', 'acabando', 'acabou')),
  last_bought date,
  buy_count int not null default 0,
  avg_interval_days int,
  updated_at timestamptz not null default now()
);
create unique index pantry_key_pessoal on public.pantry_items (owner_id, key) where scope = 'pessoal';
create unique index pantry_key_casa on public.pantry_items (household_id, key) where scope = 'casa';

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'casa' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  servings int not null default 2 check (servings between 1 and 50),
  ingredients jsonb not null default '[]'::jsonb,   -- [{name, qty, unit}]
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

create table public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'casa' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('cafe', 'almoco', 'jantar', 'lanche')),
  recipe_id uuid references public.recipes (id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  people int not null default 2 check (people between 1 and 50),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['shopping_items','pantry_items','recipes','meal_plan'] loop
    execute format('create trigger set_scope before insert or update of scope on public.%I for each row execute function public.set_scope_fields()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy sel on public.%I for select to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()))$p$, t);
    execute format($p$create policy ins on public.%I for insert to authenticated with check (owner_id = auth.uid())$p$, t);
    execute format($p$create policy upd on public.%I for update to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household())) with check (scope = 'casa' or owner_id = auth.uid())$p$, t);
    execute format($p$create policy del on public.%I for delete to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()))$p$, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- lista em tempo real entre as duas pessoas da casa
alter publication supabase_realtime add table public.shopping_items;

-- ---------- Despensa: cada nota lançada abastece a despensa ----------
create function public.pantry_from_scan() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  i jsonb;
  v_key text;
  v_date date := (new.issued_at at time zone 'America/Sao_Paulo')::date;
  p public.pantry_items;
begin
  if new.status <> 'lancada' or (tg_op = 'UPDATE' and old.status = 'lancada') then
    return new;
  end if;
  for i in select * from jsonb_array_elements(new.items) loop
    v_key := public.norm_txt(i->>'description');
    continue when v_key = '';
    select * into p from public.pantry_items
     where scope = new.scope and key = v_key
       and ((new.scope = 'pessoal' and owner_id = new.owner_id) or (new.scope = 'casa' and household_id = new.household_id))
     limit 1;
    if p.id is null then
      insert into public.pantry_items (owner_id, scope, household_id, name, key, status, last_bought, buy_count)
      values (new.owner_id, new.scope, new.household_id, left(i->>'description', 80), v_key, 'tem', v_date, 1);
    else
      update public.pantry_items set
        status = 'tem',
        avg_interval_days = case
          when p.last_bought is null or v_date <= p.last_bought then p.avg_interval_days
          when p.avg_interval_days is null then (v_date - p.last_bought)
          else round((p.avg_interval_days * 2 + (v_date - p.last_bought)) / 3.0)::int end,
        last_bought = greatest(coalesce(p.last_bought, v_date), v_date),
        buy_count = p.buy_count + 1,
        updated_at = now()
      where id = p.id;
    end if;
  end loop;
  return new;
end $$;

create trigger pantry_from_scan after insert or update of status on public.nfce_scans
  for each row execute function public.pantry_from_scan();

revoke execute on function public.pantry_from_scan() from public, anon, authenticated;
