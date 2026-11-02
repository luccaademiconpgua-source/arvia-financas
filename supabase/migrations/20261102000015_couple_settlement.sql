-- Acerto do casal: quem pagou as despesas da casa no mês, a parte de cada um e os acertos feitos.

alter table public.profiles add column share_pct int check (share_pct is null or share_pct between 0 and 100);

create table public.couple_settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index on public.couple_settlements (household_id, month);
alter table public.couple_settlements enable row level security;
create policy sel on public.couple_settlements for select to authenticated using (household_id = public.my_household());
create policy del on public.couple_settlements for delete to authenticated using (household_id = public.my_household());
revoke all on public.couple_settlements from anon;

-- Resumo do mês. Quem pagou = dono da conta ou do cartão usado (senão, quem lançou).
create function public.couple_summary(p_month text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_h uuid := public.my_household();
  v_start date;
  v_out jsonb;
begin
  if v_h is null then return null; end if;
  if p_month !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'Mês inválido.'; end if;
  v_start := (p_month || '-01')::date;

  with members as (
    select p.id, p.name, p.share_pct from public.profiles p where p.household_id = v_h
  ),
  n as (select count(*)::numeric as c, count(share_pct) as with_pct from members),
  spent as (
    select coalesce(a.owner_id, c.owner_id, t.owner_id) as payer, sum(t.amount_cents) as cents, count(*) as qty
    from public.transactions t
    left join public.accounts a on a.id = t.account_id
    left join public.cards c on c.id = t.card_id
    where t.scope = 'casa' and t.household_id = v_h and t.type = 'despesa'
      and not t.is_transfer and t.match_id is null
      and t.date >= v_start and t.date < (v_start + interval '1 month')
    group by 1
  ),
  sent as (select from_user as u, sum(amount_cents) as cents from public.couple_settlements where household_id = v_h and month = p_month group by 1),
  recv as (select to_user as u, sum(amount_cents) as cents from public.couple_settlements where household_id = v_h and month = p_month group by 1)
  select jsonb_build_object(
    'me', auth.uid(),
    'total', coalesce((select sum(cents) from spent where payer in (select id from members)), 0),
    'members', coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name,
      'share_pct', case when (select with_pct from n) = (select c from n) and m.share_pct is not null then m.share_pct
                        else round(100 / (select c from n), 2) end,
      'paid', coalesce(s.cents, 0), 'qty', coalesce(s.qty, 0),
      'sent', coalesce(se.cents, 0), 'received', coalesce(r.cents, 0)
    ) order by m.name), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'from', x.from_user, 'to', x.to_user, 'amount', x.amount_cents, 'at', x.created_at) order by x.created_at)
                    from public.couple_settlements x where x.household_id = v_h and x.month = p_month), '[]'::jsonb)
  ) into v_out
  from members m
  left join spent s on s.payer = m.id
  left join sent se on se.u = m.id
  left join recv r on r.u = m.id;
  return v_out;
end $$;

-- Divisão da casa: minha parte em %, o restante fica com a outra pessoa (casa de duas pessoas).
create function public.set_household_split(p_my_pct int) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_h uuid := public.my_household(); v_others int;
begin
  if v_h is null then raise exception 'Você ainda não está em uma casa.'; end if;
  if p_my_pct is null or p_my_pct < 0 or p_my_pct > 100 then raise exception 'Informe de 0 a 100%%.'; end if;
  select count(*) into v_others from public.profiles where household_id = v_h and id <> auth.uid();
  if v_others <> 1 then raise exception 'A divisão personalizada funciona para casas de duas pessoas.'; end if;
  update public.profiles set share_pct = p_my_pct where id = auth.uid();
  update public.profiles set share_pct = 100 - p_my_pct where household_id = v_h and id <> auth.uid();
end $$;

revoke execute on function public.couple_summary(text) from public, anon;
grant execute on function public.couple_summary(text) to authenticated;
revoke execute on function public.set_household_split(int) from public, anon;
grant execute on function public.set_household_split(int) to authenticated;

-- Registrar um acerto (só entre pessoas da mesma casa).
create function public.register_settlement(p_month text, p_from uuid, p_to uuid, p_cents bigint) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_h uuid := public.my_household(); v_id uuid;
begin
  if v_h is null then raise exception 'Você ainda não está em uma casa.'; end if;
  if p_month !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'Mês inválido.'; end if;
  if p_cents is null or p_cents <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  if p_from = p_to then raise exception 'Escolha duas pessoas diferentes.'; end if;
  if public.household_of(p_from) is distinct from v_h or public.household_of(p_to) is distinct from v_h then
    raise exception 'As duas pessoas precisam ser da sua casa.';
  end if;
  insert into public.couple_settlements (household_id, month, from_user, to_user, amount_cents, created_by)
  values (v_h, p_month, p_from, p_to, p_cents, auth.uid()) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.register_settlement(text, uuid, uuid, bigint) from public, anon;
grant execute on function public.register_settlement(text, uuid, uuid, bigint) to authenticated;
