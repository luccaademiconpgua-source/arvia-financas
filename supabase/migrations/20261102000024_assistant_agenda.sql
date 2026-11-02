-- Assistente pessoal (Groq + Gemini), agenda de demandas e o resumo dos dados que a IA lê.

-- ---------- Chaves de IA: uma por provedor ----------
alter table public.ai_credentials add column provider text not null default 'gemini' check (provider in ('gemini', 'groq'));
alter table public.ai_credentials drop constraint ai_credentials_pkey;
alter table public.ai_credentials add primary key (owner_id, provider);

create function public.save_ai_key(p_provider text, p_key text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_old uuid; v_new uuid; k text := trim(coalesce(p_key, ''));
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  if p_provider = 'gemini' and k !~ '^[A-Za-z0-9_\-]{30,60}$' then raise exception 'Essa chave não parece uma chave do Google AI Studio.'; end if;
  if p_provider = 'groq' and k !~ '^gsk_[A-Za-z0-9]{20,80}$' then raise exception 'Essa chave não parece uma chave do Groq (começa com gsk_).'; end if;
  if p_provider not in ('gemini', 'groq') then raise exception 'Provedor inválido.'; end if;
  select secret_id into v_old from public.ai_credentials where owner_id = v_uid and provider = p_provider;
  if v_old is not null then
    perform vault.update_secret(v_old, k);
    update public.ai_credentials set hint = right(k, 4), updated_at = now() where owner_id = v_uid and provider = p_provider;
  else
    v_new := vault.create_secret(k, p_provider || '_' || v_uid::text, 'Chave ' || p_provider || ' do assistente');
    insert into public.ai_credentials (owner_id, provider, secret_id, hint) values (v_uid, p_provider, v_new, right(k, 4));
  end if;
end $$;

create function public.delete_ai_key(p_provider text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_old uuid;
begin
  select secret_id into v_old from public.ai_credentials where owner_id = auth.uid() and provider = p_provider;
  delete from public.ai_credentials where owner_id = auth.uid() and provider = p_provider;
  if v_old is not null then delete from vault.secrets where id = v_old; end if;
end $$;

create function public.ai_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_object_agg(pr, jsonb_build_object(
    'mine', exists (select 1 from public.ai_credentials where owner_id = auth.uid() and provider = pr),
    'hint', (select hint from public.ai_credentials where owner_id = auth.uid() and provider = pr),
    'shared', exists (select 1 from public.ai_credentials c join public.profiles p on p.id = c.owner_id
                      where c.provider = pr and p.household_id is not null and p.household_id = public.my_household() and c.owner_id <> auth.uid())))
  from unnest(array['gemini', 'groq']) pr;
$$;

-- a minha chave do provedor, ou a de alguém da minha casa
create function public.get_ai_key(p_owner uuid, p_provider text) returns text
language sql stable security definer set search_path = ''
as $$
  select s.decrypted_secret from public.ai_credentials c
  join vault.decrypted_secrets s on s.id = c.secret_id
  left join public.profiles p on p.id = c.owner_id
  where c.provider = p_provider
    and (c.owner_id = p_owner or (p.household_id is not null and p.household_id = public.household_of(p_owner)))
  order by (c.owner_id = p_owner) desc
  limit 1;
$$;

create or replace function public.get_gemini_key(p_owner uuid) returns text
language sql stable security definer set search_path = ''
as $$ select public.get_ai_key(p_owner, 'gemini') $$;

create or replace function public.gemini_status() returns jsonb
language sql stable security definer set search_path = ''
as $$ select public.ai_status()->'gemini' $$;

create or replace function public.save_gemini_key(p_key text) returns void
language sql security definer set search_path = ''
as $$ select public.save_ai_key('gemini', p_key) $$;

create or replace function public.delete_gemini_key() returns void
language sql security definer set search_path = ''
as $$ select public.delete_ai_key('gemini') $$;

revoke execute on function public.save_ai_key(text, text) from public, anon;
revoke execute on function public.delete_ai_key(text) from public, anon;
revoke execute on function public.ai_status() from public, anon;
grant execute on function public.save_ai_key(text, text) to authenticated;
grant execute on function public.delete_ai_key(text) to authenticated;
grant execute on function public.ai_status() to authenticated;
revoke execute on function public.get_ai_key(uuid, text) from public, anon, authenticated;
grant execute on function public.get_ai_key(uuid, text) to service_role;

-- ---------- Agenda de demandas ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  date date,
  time time,
  duration_min int check (duration_min is null or duration_min between 5 and 720),
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta')),
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.tasks (owner_id, date);

-- ---------- Conversa com o assistente (só de quem conversa) ----------
create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  meta jsonb,
  created_at timestamptz not null default now()
);
create index on public.assistant_messages (owner_id, created_at desc);
alter table public.assistant_messages enable row level security;
create policy own on public.assistant_messages for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.assistant_messages from anon;

do $$
begin
  execute 'create trigger set_scope before insert or update of scope on public.tasks for each row execute function public.set_scope_fields()';
  alter table public.tasks enable row level security;
  create policy sel on public.tasks for select to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()));
  create policy ins on public.tasks for insert to authenticated with check (owner_id = auth.uid());
  create policy upd on public.tasks for update to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household())) with check (scope = 'casa' or owner_id = auth.uid());
  create policy del on public.tasks for delete to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()));
  revoke all on public.tasks from anon;
end $$;

-- ---------- O que o assistente sabe (só leitura, só do dono: o pessoal dele e a casa) ----------
create function public.assistant_context(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_h uuid := public.household_of(p_owner);
  v_m0 date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v jsonb;
begin
  with vis as (
    select t.* from public.transactions t
    where ((t.owner_id = p_owner and t.scope = 'pessoal') or (t.scope = 'casa' and t.household_id = v_h))
      and not t.is_transfer and t.match_id is null
  ),
  months as (
    select to_char(d, 'YYYY-MM') ym, d::date d0, (d + interval '1 month')::date d1
    from generate_series(v_m0 - interval '5 months', v_m0, interval '1 month') d
  )
  select jsonb_build_object(
    'hoje', to_char(v_today, 'YYYY-MM-DD') || ' (' || trim(to_char(v_today, 'TMDay')) || ')',
    'nome', (select name from public.profiles where id = p_owner),
    'tem_casa', v_h is not null,
    'contas', (select coalesce(jsonb_agg(jsonb_build_object('nome', a.name, 'escopo', a.scope, 'tipo', a.type, 'saldo', public.brl_txt(b.balance_cents))), '[]')
               from public.accounts a left join public.account_balances b on b.account_id = a.id
               where (a.owner_id = p_owner and a.scope = 'pessoal') or (a.scope = 'casa' and a.household_id = v_h)),
    'cartoes', (select coalesce(jsonb_agg(jsonb_build_object('nome', c.label, 'escopo', c.scope, 'vence_dia', c.due_day,
                  'limite', case when c.limit_cents is null then null else public.brl_txt(c.limit_cents) end,
                  'em_aberto', public.brl_txt(coalesce((select sum(i.amount_cents) from public.card_invoices i where i.card_id = c.id and i.status <> 'paga'), 0)))), '[]')
               from public.cards c where (c.owner_id = p_owner and c.scope = 'pessoal') or (c.scope = 'casa' and c.household_id = v_h)),
    'categorias', (select coalesce(jsonb_agg(distinct jsonb_build_object('nome', name, 'tipo', kind)), '[]') from public.categories
                   where (owner_id = p_owner and scope = 'pessoal') or (scope = 'casa' and household_id = v_h)),
    'meses', (select jsonb_agg(jsonb_build_object('mes', m.ym,
                 'entrou', public.brl_txt(coalesce((select sum(amount_cents) from vis where type = 'receita' and date >= m.d0 and date < m.d1), 0)),
                 'saiu', public.brl_txt(coalesce((select sum(amount_cents) from vis where type = 'despesa' and date >= m.d0 and date < m.d1), 0))) order by m.ym)
              from months m),
    'gastos_por_categoria_mes_atual', (select coalesce(jsonb_agg(jsonb_build_object('categoria', x.cat, 'valor', public.brl_txt(x.s)) order by x.s desc), '[]') from (
        select coalesce(c.name, 'Sem categoria') cat, sum(v.amount_cents) s from vis v left join public.categories c on c.id = v.category_id
        where v.type = 'despesa' and v.date >= v_m0 and v.date <= v_today group by 1) x),
    'gastos_por_categoria_mes_passado', (select coalesce(jsonb_agg(jsonb_build_object('categoria', x.cat, 'valor', public.brl_txt(x.s)) order by x.s desc), '[]') from (
        select coalesce(c.name, 'Sem categoria') cat, sum(v.amount_cents) s from vis v left join public.categories c on c.id = v.category_id
        where v.type = 'despesa' and v.date >= (v_m0 - interval '1 month')::date and v.date < v_m0 group by 1) x),
    'ultimos_lancamentos', (select coalesce(jsonb_agg(jsonb_build_object('data', y.date, 'tipo', y.type, 'descricao', y.d, 'valor', public.brl_txt(y.amount_cents), 'categoria', y.cat, 'escopo', y.scope) order by y.date desc), '[]') from (
        select v.date, v.type, coalesce(v.merchant, v.description) d, v.amount_cents, c.name cat, v.scope from vis v left join public.categories c on c.id = v.category_id
        where v.date <= v_today order by v.date desc, v.created_at desc limit 40) y),
    'orcamentos', (select coalesce(jsonb_agg(jsonb_build_object('categoria', c.name, 'limite', public.brl_txt(b.limit_cents),
                     'gasto_no_mes', public.brl_txt(coalesce((select sum(amount_cents) from vis where category_id = b.category_id and type = 'despesa' and date >= v_m0), 0)))), '[]')
                  from public.budgets b join public.categories c on c.id = b.category_id
                  where (b.owner_id = p_owner and b.scope = 'pessoal') or (b.scope = 'casa' and b.household_id = v_h)),
    'contas_fixas', (select coalesce(jsonb_agg(jsonb_build_object('descricao', r.description, 'valor', public.brl_txt(r.amount_cents), 'dia', r.day_of_month, 'tipo', r.type,
                       'paga_este_mes', exists (select 1 from public.transactions t where t.recurrence_id = r.id and t.recurrence_month = to_char(v_today, 'YYYY-MM')))), '[]')
                    from public.recurrences r where r.active and ((r.owner_id = p_owner and r.scope = 'pessoal') or (r.scope = 'casa' and r.household_id = v_h))),
    'metas', (select coalesce(jsonb_agg(jsonb_build_object('nome', g.name, 'tipo', g.kind, 'alvo', public.brl_txt(g.target_cents),
                'reservado', public.brl_txt(coalesce((select sum(amount_cents) from public.transactions t where t.goal_id = g.id and t.type = 'reserva'), 0)))), '[]')
             from public.goals g where (g.owner_id = p_owner and g.scope = 'pessoal') or (g.scope = 'casa' and g.household_id = v_h)),
    'dividas', (select coalesce(jsonb_agg(jsonb_build_object('nome', d.name, 'parcela', public.brl_txt(d.installment_cents), 'faltam', d.installment_count - d.paid_installments, 'proximo_vencimento', d.next_due)), '[]')
               from public.debts d where d.paid_installments < d.installment_count and ((d.owner_id = p_owner and d.scope = 'pessoal') or (d.scope = 'casa' and d.household_id = v_h))),
    'agenda', (select coalesce(jsonb_agg(jsonb_build_object('tarefa', k.title, 'data', k.date, 'hora', to_char(k.time, 'HH24:MI'), 'prioridade', k.priority, 'feita', k.done) order by k.date nulls last, k.time nulls last), '[]')
              from public.tasks k where ((k.owner_id = p_owner and k.scope = 'pessoal') or (k.scope = 'casa' and k.household_id = v_h))
                and (not k.done or k.done_at > now() - interval '2 days') and (k.date is null or k.date between v_today - 14 and v_today + 14)),
    'avisos', (select coalesce(jsonb_agg(jsonb_build_object('aviso', a.title, 'detalhe', a.body)), '[]') from public._alerts(p_owner) a)
  ) into v;
  return v;
end $$;
revoke execute on function public.assistant_context(uuid) from public, anon, authenticated;
grant execute on function public.assistant_context(uuid) to service_role;

-- redefinir conta também apaga agenda e conversa
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
  delete from public.tasks where owner_id = v_uid and scope = 'pessoal';
  delete from public.assistant_messages where owner_id = v_uid;
  delete from public.vehicles where owner_id = v_uid and scope = 'pessoal';
  delete from public.goals where owner_id = v_uid and scope = 'pessoal';
  delete from public.debts where owner_id = v_uid and scope = 'pessoal';
  delete from public.cards where owner_id = v_uid and scope = 'pessoal';
  delete from public.accounts where owner_id = v_uid and scope = 'pessoal';
  delete from public.categories where owner_id = v_uid and scope = 'pessoal';
  delete from public.pluggy_items where owner_id = v_uid;
  perform public.seed_categories(v_uid, 'pessoal');
end $$;
