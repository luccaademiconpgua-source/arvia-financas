-- Arvia Finanças: esquema base. Dinheiro sempre em centavos (bigint).
-- Escopos: "pessoal" (só o dono vê) e "casa" (os dois moradores veem e editam).

-- ---------- Casa e perfis ----------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Você' check (char_length(name) between 1 and 24),
  household_id uuid references public.households (id) on delete set null,
  created_at timestamptz not null default now()
);

create function public.household_of(p_user uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select household_id from public.profiles where id = p_user $$;

create function public.my_household() returns uuid
language sql stable security definer set search_path = ''
as $$ select household_id from public.profiles where id = auth.uid() $$;

-- ---------- Tabelas com escopo ----------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  type text not null check (type in ('corrente', 'digital', 'dinheiro', 'investimento')),
  institution text,
  opening_balance_cents bigint not null default 0,
  of_status text check (of_status in ('demo', 'conectada', 'expirada')),
  of_synced_at timestamptz,
  external_id text,
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  brand text not null check (brand in ('visa', 'master', 'elo')),
  label text not null,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  limit_cents bigint check (limit_cents is null or limit_cents >= 0),
  due_day int not null check (due_day between 1 and 31),
  external_id text,
  created_at timestamptz not null default now()
);

create table public.card_invoices (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  status text not null check (status in ('paga', 'vencida', 'aberta')),
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  paid_from_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('receita', 'despesa')),
  essential boolean not null default false
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  name text not null,
  target_cents bigint not null check (target_cents > 0),
  kind text not null check (kind in ('emergencia', 'geral'))
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  name text not null,
  installment_count int not null check (installment_count > 0),
  paid_installments int not null default 0 check (paid_installments >= 0),
  installment_cents bigint not null check (installment_cents > 0),
  next_due date not null,
  check (paid_installments <= installment_count)
);

create table public.nfce_scans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  url text not null,
  access_key text,
  store_name text not null,
  cnpj text,
  issued_at timestamptz not null,
  total_cents bigint not null check (total_cents > 0),
  payment text check (payment in ('pix', 'dinheiro', 'debito', 'credito', 'desconhecido')),
  items jsonb not null default '[]'::jsonb,
  state text,
  status text not null default 'rascunho' check (status in ('rascunho', 'lancada')),
  transaction_id uuid,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  type text not null check (type in ('receita', 'despesa', 'reserva', 'ajuste')),
  description text not null check (char_length(description) between 2 and 80),
  category_id uuid references public.categories (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  card_id uuid references public.cards (id) on delete set null,
  goal_id uuid references public.goals (id) on delete set null,
  payment text not null check (payment in ('pix', 'dinheiro', 'debito', 'credito')),
  amount_cents bigint not null check (amount_cents > 0),
  signed_cents bigint,
  date date not null,
  essential boolean,
  affects_balance boolean not null,
  source text not null default 'manual' check (source in ('manual', 'nfce', 'open_finance', 'fatura')),
  nfce_id uuid,
  invoice_id uuid references public.card_invoices (id) on delete set null,
  debt_id uuid references public.debts (id) on delete set null,
  external_id text,
  created_at timestamptz not null default now(),
  check (type <> 'ajuste' or signed_cents is not null)
);

alter table public.nfce_scans add foreign key (transaction_id) references public.transactions (id) on delete set null;

create index on public.transactions (owner_id, date desc);
create index on public.transactions (household_id, date desc) where scope = 'casa';
create index on public.transactions (account_id);
create index on public.transactions (card_id);
create index on public.transactions (goal_id);
create unique index transactions_external_uniq on public.transactions (owner_id, external_id) where external_id is not null;
create index on public.card_invoices (card_id);
create unique index nfce_scans_url_uniq on public.nfce_scans (owner_id, url);

-- ---------- Escopo: dono e casa preenchidos pelo banco ----------
create function public.set_scope_fields() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.owner_id := coalesce(new.owner_id, auth.uid());
  if new.scope = 'casa' then
    new.household_id := public.household_of(new.owner_id);
    if new.household_id is null then
      raise exception 'Crie ou entre em uma casa antes de usar o escopo Casa.';
    end if;
  else
    new.household_id := null;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['accounts','cards','categories','goals','debts','nfce_scans','transactions'] loop
    execute format('create trigger set_scope before insert or update of scope on public.%I for each row execute function public.set_scope_fields()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy sel on public.%I for select to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()))$p$, t);
    execute format($p$create policy ins on public.%I for insert to authenticated with check (owner_id = auth.uid())$p$, t);
    execute format($p$create policy upd on public.%I for update to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household())) with check (scope = 'casa' or owner_id = auth.uid())$p$, t);
    execute format($p$create policy del on public.%I for delete to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()))$p$, t);
  end loop;
end $$;

-- Faturas herdam a visibilidade do cartão
alter table public.card_invoices enable row level security;
create policy inv_all on public.card_invoices for all to authenticated
  using (exists (select 1 from public.cards c where c.id = card_id))
  with check (exists (select 1 from public.cards c where c.id = card_id));

alter table public.households enable row level security;
create policy hh_sel on public.households for select to authenticated using (id = public.my_household());

alter table public.profiles enable row level security;
create policy pr_sel on public.profiles for select to authenticated using (id = auth.uid() or household_id = public.my_household());
create policy pr_upd on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.households from authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

-- ---------- Saldo derivado ----------
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  (a.opening_balance_cents + coalesce(sum(
    case when t.affects_balance then
      case t.type
        when 'receita' then t.amount_cents
        when 'despesa' then -t.amount_cents
        when 'reserva' then -t.amount_cents
        when 'ajuste' then t.signed_cents
      end
    else 0 end), 0))::bigint as balance_cents
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;
grant select on public.account_balances to authenticated;

-- ---------- Categorias padrão e cadastro ----------
create function public.seed_categories(p_owner uuid, p_scope text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_scope = 'pessoal' then
    insert into public.categories (owner_id, scope, name, kind, essential) values
      (p_owner, 'pessoal', 'Academia', 'despesa', true), (p_owner, 'pessoal', 'Contas', 'despesa', true),
      (p_owner, 'pessoal', 'Alimentação', 'despesa', true), (p_owner, 'pessoal', 'Saúde e bem-estar', 'despesa', true),
      (p_owner, 'pessoal', 'Mercado', 'despesa', true), (p_owner, 'pessoal', 'Parcelas', 'despesa', true),
      (p_owner, 'pessoal', 'Vestuário', 'despesa', false), (p_owner, 'pessoal', 'Gasolina', 'despesa', false),
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
      (p_owner, 'casa', 'Lazer', 'despesa', false), (p_owner, 'casa', 'Restaurante', 'despesa', false),
      (p_owner, 'casa', 'Outras', 'despesa', false),
      (p_owner, 'casa', 'Aporte', 'receita', false), (p_owner, 'casa', 'Outras receitas', 'receita', false);
  end if;
end $$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1), 'Você'), 24));
  perform public.seed_categories(new.id, 'pessoal');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.create_household(p_name text) returns text
language plpgsql security definer set search_path = ''
as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if public.my_household() is not null then raise exception 'Você já faz parte de uma casa.'; end if;
  insert into public.households (name) values (p_name) returning * into h;
  update public.profiles set household_id = h.id where id = auth.uid();
  perform public.seed_categories(auth.uid(), 'casa');
  return h.invite_code;
end $$;

create function public.join_household(p_code text) returns void
language plpgsql security definer set search_path = ''
as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if public.my_household() is not null then raise exception 'Você já faz parte de uma casa.'; end if;
  select * into h from public.households where invite_code = lower(trim(p_code));
  if not found then raise exception 'Código de convite inválido.'; end if;
  if (select count(*) from public.profiles where household_id = h.id) >= 2 then
    raise exception 'Esta casa já tem 2 pessoas.';
  end if;
  update public.profiles set household_id = h.id where id = auth.uid();
end $$;

-- ---------- Lançamentos (atômicos) ----------
create function public.add_transaction(
  p_scope text, p_type text, p_description text, p_amount_cents bigint, p_date date, p_payment text,
  p_category_id uuid default null, p_account_id uuid default null, p_card_id uuid default null,
  p_goal_id uuid default null, p_essential boolean default null, p_source text default 'manual',
  p_nfce_id uuid default null, p_external_id text default null
) returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_card public.cards;
  v_inv public.card_invoices;
  v_balance bigint;
  v_ym text;
  v_closing int;
  v_affects boolean := true;
  v_essential boolean := p_essential;
  v_id uuid;
begin
  if p_type not in ('receita', 'despesa', 'reserva') then raise exception 'Tipo de lançamento inválido.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Informe um valor maior que zero.'; end if;

  if p_type = 'reserva' then
    if p_account_id is null or p_goal_id is null then raise exception 'Escolha a conta e a meta.'; end if;
    select balance_cents into v_balance from public.account_balances where account_id = p_account_id;
    if v_balance is null then raise exception 'Conta não encontrada.'; end if;
    if p_amount_cents > v_balance then raise exception 'O valor passa do saldo da conta.'; end if;
  end if;

  v_id := gen_random_uuid();
  if p_card_id is not null then
    select * into v_card from public.cards where id = p_card_id for update;
    if not found then raise exception 'Cartão não encontrado.'; end if;
    v_closing := greatest(1, v_card.due_day - 7);
    v_ym := case when extract(day from p_date) <= v_closing then to_char(p_date, 'YYYY-MM')
                 else to_char(p_date + interval '1 month', 'YYYY-MM') end;
    select * into v_inv from public.card_invoices
      where card_id = p_card_id and status = 'aberta'
      order by (month = v_ym) desc, month asc limit 1 for update;
    if not found then
      insert into public.card_invoices (card_id, month, status, amount_cents)
      values (p_card_id, v_ym, 'aberta', 0) returning * into v_inv;
    end if;
    update public.card_invoices set amount_cents = amount_cents + p_amount_cents where id = v_inv.id;
    v_affects := false;
  end if;

  if v_essential is null and p_category_id is not null then
    select essential into v_essential from public.categories where id = p_category_id;
  end if;

  insert into public.transactions (
    id, scope, type, description, category_id, account_id, card_id, goal_id, payment, amount_cents,
    date, essential, affects_balance, source, nfce_id, invoice_id, external_id
  ) values (
    v_id, p_scope, p_type, trim(p_description), p_category_id,
    case when p_card_id is null then p_account_id end, p_card_id, p_goal_id, p_payment, p_amount_cents,
    p_date, v_essential, v_affects, p_source, p_nfce_id, v_inv.id, p_external_id
  );
  return v_id;
end $$;

create function public.delete_transaction(p_id uuid) returns void
language plpgsql set search_path = ''
as $$
declare t public.transactions;
begin
  select * into t from public.transactions where id = p_id for update;
  if not found then return; end if;
  if t.card_id is not null and t.invoice_id is not null then
    update public.card_invoices set amount_cents = greatest(0, amount_cents - t.amount_cents) where id = t.invoice_id;
  end if;
  if t.source = 'fatura' and t.invoice_id is not null then
    update public.card_invoices set status = 'aberta', paid_from_account_id = null where id = t.invoice_id;
  end if;
  if t.debt_id is not null then
    update public.debts set paid_installments = paid_installments - 1, next_due = (next_due - interval '1 month')::date
      where id = t.debt_id and paid_installments > 0;
  end if;
  update public.nfce_scans set status = 'rascunho', transaction_id = null where transaction_id = t.id;
  delete from public.transactions where id = p_id;
end $$;

create function public.adjust_balance(p_account_id uuid, p_new_balance_cents bigint, p_date date default null) returns void
language plpgsql set search_path = ''
as $$
declare a public.accounts; v_balance bigint; v_delta bigint;
begin
  select * into a from public.accounts where id = p_account_id;
  if not found then raise exception 'Conta não encontrada.'; end if;
  select balance_cents into v_balance from public.account_balances where account_id = p_account_id;
  v_delta := p_new_balance_cents - v_balance;
  if v_delta = 0 then raise exception 'O saldo informado é igual ao atual.'; end if;
  insert into public.transactions (scope, type, description, account_id, payment, amount_cents, signed_cents, date, affects_balance, source)
  values (a.scope, 'ajuste', 'Ajuste de saldo', a.id, 'pix', abs(v_delta), v_delta,
          coalesce(p_date, (now() at time zone 'America/Sao_Paulo')::date), true, 'manual');
end $$;

create function public.pay_invoice(p_card_id uuid, p_invoice_id uuid, p_account_id uuid, p_date date default null) returns void
language plpgsql set search_path = ''
as $$
declare c public.cards; i public.card_invoices; v_cat uuid;
begin
  select * into c from public.cards where id = p_card_id;
  if not found then raise exception 'Cartão não encontrado.'; end if;
  select * into i from public.card_invoices where id = p_invoice_id and card_id = p_card_id for update;
  if not found then raise exception 'Fatura não encontrada.'; end if;
  if i.status = 'paga' then raise exception 'Esta fatura já está paga.'; end if;
  if i.amount_cents <= 0 then raise exception 'A fatura está zerada.'; end if;
  if not exists (select 1 from public.accounts where id = p_account_id) then raise exception 'Conta não encontrada.'; end if;
  select id into v_cat from public.categories where scope = c.scope and name = 'Contas' and kind = 'despesa' limit 1;
  insert into public.transactions (scope, type, description, category_id, account_id, payment, amount_cents, date, affects_balance, source, invoice_id)
  values (c.scope, 'despesa', 'Fatura ' || c.label || ' ' || i.month, v_cat, p_account_id, 'pix', i.amount_cents,
          coalesce(p_date, (now() at time zone 'America/Sao_Paulo')::date), true, 'fatura', i.id);
  update public.card_invoices set status = 'paga', paid_from_account_id = p_account_id where id = i.id;
end $$;

create function public.pay_debt_installment(p_debt_id uuid, p_account_id uuid, p_date date default null) returns void
language plpgsql set search_path = ''
as $$
declare d public.debts; v_cat uuid; v_num int;
begin
  select * into d from public.debts where id = p_debt_id for update;
  if not found then raise exception 'Dívida não encontrada.'; end if;
  if d.paid_installments >= d.installment_count then raise exception 'Esta dívida já está quitada.'; end if;
  if not exists (select 1 from public.accounts where id = p_account_id) then raise exception 'Conta não encontrada.'; end if;
  v_num := d.paid_installments + 1;
  select id into v_cat from public.categories where scope = d.scope and name = 'Parcelas' and kind = 'despesa' limit 1;
  insert into public.transactions (scope, type, description, category_id, account_id, payment, amount_cents, date, affects_balance, source, debt_id)
  values (d.scope, 'despesa', left('Parcela ' || d.name || ' (' || v_num || '/' || d.installment_count || ')', 80), v_cat, p_account_id, 'pix',
          d.installment_cents, coalesce(p_date, (now() at time zone 'America/Sao_Paulo')::date), true, 'manual', d.id);
  update public.debts set paid_installments = v_num,
    next_due = case when v_num >= installment_count then next_due else (next_due + interval '1 month')::date end
    where id = d.id;
end $$;

-- ---------- Permissões das funções ----------
do $$
declare f text;
begin
  foreach f in array array[
    'add_transaction(text,text,text,bigint,date,text,uuid,uuid,uuid,uuid,boolean,text,uuid,text)',
    'delete_transaction(uuid)', 'adjust_balance(uuid,bigint,date)', 'pay_invoice(uuid,uuid,uuid,date)',
    'pay_debt_installment(uuid,uuid,date)', 'create_household(text)', 'join_household(text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.seed_categories(uuid, text) from public, anon, authenticated;
revoke execute on function public.household_of(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_scope_fields() from public, anon, authenticated;
