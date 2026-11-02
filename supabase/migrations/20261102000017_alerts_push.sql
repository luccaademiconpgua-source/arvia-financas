-- Avisos: contas fixas e faturas vencendo, orçamento estourando, despensa e revisão do carro.
-- O sino do app lê my_alerts(); uma rotina diária manda as novidades por notificação (Web Push).

create function public.brl_txt(p_cents numeric) returns text
language sql immutable set search_path = ''
as $$ select 'R$ ' || translate(to_char(p_cents / 100.0, 'FM999,999,990.00'), ',.', '.,') $$;

create function public._alerts(p_owner uuid)
returns table (key text, kind text, severity int, title text, body text, url text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM');
  v_h uuid := public.household_of(p_owner);
begin
  -- contas fixas (despesas) do mês ainda sem pagamento, vencendo em até 3 dias ou atrasadas
  return query
  select 'rec:' || r.id || ':' || v_month || ':' || case when d.due < v_today then 'late' when d.due = v_today then 'today' else 'soon' end,
         'conta', case when d.due < v_today then 3 else 2 end,
         case when d.due < v_today then r.description || ' está atrasada'
              when d.due = v_today then r.description || ' vence hoje'
              else r.description || ' vence em ' || to_char(d.due, 'DD/MM') end,
         public.brl_txt(r.amount_cents) ,
         '/contas-fixas'
  from public.recurrences r
  cross join lateral (select public.recurrence_due(v_month, r.day_of_month) as due) d
  where r.active and r.type = 'despesa'
    and ((r.owner_id = p_owner and r.scope = 'pessoal') or (r.scope = 'casa' and r.household_id = v_h))
    and r.start_month <= v_month and (r.end_month is null or r.end_month >= v_month)
    and d.due <= v_today + 3
    and not exists (select 1 from public.transactions t where t.recurrence_id = r.id and t.recurrence_month = v_month);

  -- faturas de cartão não pagas vencendo em até 3 dias ou vencidas
  return query
  select 'inv:' || i.id || ':' || case when x.due < v_today then 'late' when x.due = v_today then 'today' else 'soon' end,
         'fatura', case when x.due < v_today then 3 else 2 end,
         case when x.due < v_today then 'Fatura do ' || c.label || ' venceu em ' || to_char(x.due, 'DD/MM')
              when x.due = v_today then 'Fatura do ' || c.label || ' vence hoje'
              else 'Fatura do ' || c.label || ' vence em ' || to_char(x.due, 'DD/MM') end,
         public.brl_txt(i.amount_cents),
         '/cartoes/' || c.id
  from public.card_invoices i
  join public.cards c on c.id = i.card_id
  cross join lateral (select least((i.month || '-01')::date + (c.due_day - 1), ((i.month || '-01')::date + interval '1 month' - interval '1 day')::date) as due) x
  where i.status <> 'paga' and i.amount_cents > 0
    and ((c.owner_id = p_owner and c.scope = 'pessoal') or (c.scope = 'casa' and c.household_id = v_h))
    and x.due <= v_today + 3 and x.due >= v_today - 60;

  -- orçamento por categoria: 80% e 100% do limite no mês
  return query
  select 'bud:' || b.id || ':' || v_month || ':' || case when s.spent >= b.limit_cents then '100' else '80' end,
         'orcamento', case when s.spent >= b.limit_cents then 3 else 2 end,
         case when s.spent >= b.limit_cents then 'Orçamento de ' || cat.name || ' estourou'
              else cat.name || ' já usou ' || floor(s.spent * 100.0 / b.limit_cents)::int || '% do orçamento' end,
         'Gasto no mês: R$ ' || substr(public.brl_txt(s.spent), 4) || ' de R$ ' || substr(public.brl_txt(b.limit_cents), 4),
         '/orcamento'
  from public.budgets b
  join public.categories cat on cat.id = b.category_id
  cross join lateral (
    select coalesce(sum(t.amount_cents), 0) as spent from public.transactions t
    where t.category_id = b.category_id and t.type = 'despesa' and not t.is_transfer and t.match_id is null
      and t.date >= (v_month || '-01')::date and t.date <= v_today
  ) s
  where b.category_id is not null
    and ((b.owner_id = p_owner and b.scope = 'pessoal') or (b.scope = 'casa' and b.household_id = v_h))
    and s.spent >= b.limit_cents * 0.8;

  -- despensa: itens marcados como acabou
  return query
  select 'pantry:' || to_char(v_today, 'IYYY-IW') || ':' || count(*), 'despensa', 1,
         case when count(*) = 1 then min(p.name) || ' acabou' else count(*) || ' itens acabaram na despensa' end,
         'Abra a lista de compras para repor.', '/compras'
  from public.pantry_items p
  where p.status = 'acabou'
    and ((p.owner_id = p_owner and p.scope = 'pessoal') or (p.scope = 'casa' and p.household_id = v_h))
  having count(*) > 0;

  -- revisão do carro: por data (até 7 dias antes) ou por km (faltando 500 km ou menos)
  return query
  select 'veh:' || vr.id || ':' || coalesce(vr.last_date::text, '') || ':' || coalesce(vr.last_km::text, ''),
         'veiculo', case when (vr.every_months is not null and vr.last_date is not null and (vr.last_date + make_interval(months => vr.every_months))::date < v_today)
                           or (vr.every_km is not null and vr.last_km is not null and odo.km >= vr.last_km + vr.every_km) then 3 else 2 end,
         vr.title || ' do ' || v.name,
         concat_ws(', ',
           case when vr.every_months is not null and vr.last_date is not null then 'prevista para ' || to_char((vr.last_date + make_interval(months => vr.every_months))::date, 'DD/MM') end,
           case when vr.every_km is not null and vr.last_km is not null then 'aos ' || (vr.last_km + vr.every_km) || ' km' end),
         '/veiculos'
  from public.vehicle_reminders vr
  join public.vehicles v on v.id = vr.vehicle_id
  cross join lateral (select greatest(v.initial_odometer, coalesce(max(l.odometer), 0)) as km from public.vehicle_logs l where l.vehicle_id = v.id) odo
  where ((vr.owner_id = p_owner and vr.scope = 'pessoal') or (vr.scope = 'casa' and vr.household_id = v_h))
    and ((vr.every_months is not null and vr.last_date is not null and (vr.last_date + make_interval(months => vr.every_months))::date <= v_today + 7)
      or (vr.every_km is not null and vr.last_km is not null and odo.km >= vr.last_km + vr.every_km - 500));
end $$;

create function public.my_alerts()
returns table (key text, kind text, severity int, title text, body text, url text)
language sql stable security definer set search_path = ''
as $$ select * from public._alerts(auth.uid()) order by severity desc, title $$;

revoke execute on function public._alerts(uuid) from public, anon, authenticated;
revoke execute on function public.my_alerts() from public, anon;
grant execute on function public.my_alerts() to authenticated;

-- Aparelhos que aceitaram notificações
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy own on public.push_subscriptions for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.push_subscriptions from anon;

-- O que já foi avisado (para não repetir a mesma notificação)
create table public.alert_log (
  owner_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (owner_id, key)
);
alter table public.alert_log enable row level security;
revoke all on public.alert_log from anon, authenticated;

-- Avisos novos de todo mundo que tem notificação ligada (só a rotina do servidor chama)
create function public.pending_push_alerts()
returns table (owner_id uuid, key text, severity int, title text, body text, url text)
language sql stable security definer set search_path = ''
as $$
  select u.owner_id, a.key, a.severity, a.title, a.body, a.url
  from (select distinct owner_id from public.push_subscriptions) u
  cross join lateral public._alerts(u.owner_id) a
  where not exists (select 1 from public.alert_log l where l.owner_id = u.owner_id and l.key = a.key)
  order by u.owner_id, a.severity desc;
$$;
revoke execute on function public.pending_push_alerts() from public, anon, authenticated;
