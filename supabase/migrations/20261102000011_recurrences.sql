-- Contas fixas (recorrências mensais) e ligação com o lançamento que pagou/recebeu cada mês.

create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  type text not null check (type in ('receita', 'despesa')),
  description text not null check (char_length(description) between 2 and 60),
  amount_cents bigint not null check (amount_cents > 0),
  variable boolean not null default false,          -- valor muda todo mês (luz, água): aceita até 25% de diferença
  day_of_month int not null check (day_of_month between 1 and 31),
  category_id uuid references public.categories (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  card_id uuid references public.cards (id) on delete set null,
  payment text not null default 'pix' check (payment in ('pix', 'dinheiro', 'debito', 'credito')),
  start_month text not null check (start_month ~ '^[0-9]{4}-[0-9]{2}$'),
  end_month text check (end_month is null or end_month ~ '^[0-9]{4}-[0-9]{2}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column recurrence_id uuid references public.recurrences (id) on delete set null,
  add column recurrence_month text check (recurrence_month is null or recurrence_month ~ '^[0-9]{4}-[0-9]{2}$');

create unique index transactions_recurrence_uniq on public.transactions (recurrence_id, recurrence_month)
  where recurrence_id is not null;

create trigger set_scope before insert or update of scope on public.recurrences
  for each row execute function public.set_scope_fields();
alter table public.recurrences enable row level security;
create policy sel on public.recurrences for select to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()));
create policy ins on public.recurrences for insert to authenticated with check (owner_id = auth.uid());
create policy upd on public.recurrences for update to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household())) with check (scope = 'casa' or owner_id = auth.uid());
create policy del on public.recurrences for delete to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()));
revoke all on public.recurrences from anon;

-- data de vencimento de uma conta fixa num mês (dia 31 vira o último dia do mês)
create function public.recurrence_due(p_month text, p_day int) returns date
language sql immutable set search_path = ''
as $$
  select least(
    (p_month || '-01')::date + (p_day - 1),
    ((p_month || '-01')::date + interval '1 month' - interval '1 day')::date
  );
$$;

-- liga um lançamento a uma conta fixa num mês (ou desliga com p_recurrence_id null)
create function public.link_recurrence(p_tx uuid, p_recurrence_id uuid, p_month text) returns void
language plpgsql set search_path = ''
as $$
begin
  if p_recurrence_id is not null and not exists (select 1 from public.recurrences where id = p_recurrence_id) then
    raise exception 'Conta fixa não encontrada.';
  end if;
  update public.transactions set recurrence_id = null, recurrence_month = null
   where recurrence_id = p_recurrence_id and recurrence_month = p_month and id <> p_tx;
  update public.transactions set recurrence_id = p_recurrence_id, recurrence_month = case when p_recurrence_id is null then null else p_month end
   where id = p_tx;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
end $$;

-- procura, nos últimos 3 meses, o lançamento que pagou cada conta fixa ainda em aberto
create function public._match_recurrences(p_owner uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r public.recurrences;
  m text;
  v_due date;
  v_tx uuid;
  v_n int := 0;
  v_tol numeric;
begin
  for r in select * from public.recurrences where owner_id = p_owner and active loop
    v_tol := case when r.variable then 0.25 else 0 end;
    for m in
      select to_char(d, 'YYYY-MM') from generate_series(
        date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '2 months',
        date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date), interval '1 month') d
    loop
      continue when m < r.start_month or (r.end_month is not null and m > r.end_month);
      continue when exists (select 1 from public.transactions where recurrence_id = r.id and recurrence_month = m);
      v_due := public.recurrence_due(m, r.day_of_month);
      select t.id into v_tx from public.transactions t
       where t.owner_id = p_owner and t.type = r.type and not t.is_transfer and t.recurrence_id is null
         and t.match_id is null
         and abs(t.amount_cents - r.amount_cents) <= r.amount_cents * v_tol
         and t.date between v_due - 5 and v_due + 5
         and (r.account_id is null or t.account_id = r.account_id or t.account_id is null)
         and (r.card_id is null or t.card_id = r.card_id)
       order by abs(t.amount_cents - r.amount_cents), abs(t.date - v_due)
       limit 1;
      if v_tx is not null then
        update public.transactions set recurrence_id = r.id, recurrence_month = m,
               category_id = coalesce(category_id, r.category_id)
         where id = v_tx;
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
end $$;

create function public.match_recurrences() returns int
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  return public._match_recurrences(auth.uid());
end $$;

revoke execute on function public._match_recurrences(uuid) from public, anon, authenticated;
grant execute on function public._match_recurrences(uuid) to service_role;
revoke execute on function public.match_recurrences() from public, anon;
grant execute on function public.match_recurrences() to authenticated;
revoke execute on function public.link_recurrence(uuid, uuid, text) from public, anon;
grant execute on function public.link_recurrence(uuid, uuid, text) to authenticated;
