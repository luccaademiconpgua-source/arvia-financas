-- Conciliação: o lançamento que veio do banco (Open Finance ou extrato) é ligado ao lançamento
-- feito à mão ou pela nota fiscal que representa a mesma compra. O do banco passa a apontar
-- para o outro (match_id) e sai dos totais; o manual/nota continua contando, com loja, itens e categoria.

alter table public.transactions
  add column match_id uuid references public.transactions (id) on delete set null,
  add column match_locked boolean not null default false;

create unique index transactions_match_uniq on public.transactions (match_id) where match_id is not null;

create function public._reconcile(p_owner uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  b record;
  v_mid uuid;
  v_n int := 0;
begin
  for b in
    select id, type, amount_cents, date, account_id, card_id
      from public.transactions
     where owner_id = p_owner and source in ('open_finance', 'extrato')
       and match_id is null and not match_locked and not is_transfer
       and type in ('receita', 'despesa')
     order by date
  loop
    select m.id into v_mid
      from public.transactions m
      left join public.accounts ma on ma.id = m.account_id
      left join public.cards mc on mc.id = m.card_id
     where m.owner_id = p_owner
       and m.source in ('manual', 'nfce')
       and m.type = b.type and m.amount_cents = b.amount_cents
       and abs(m.date - b.date) <= 3
       and not m.is_transfer
       and not exists (select 1 from public.transactions x where x.match_id = m.id)
       and (
         (b.account_id is not null and m.account_id = b.account_id)
         or (b.card_id is not null and m.card_id = b.card_id)
         -- lançado numa conta/cartão que não vem do banco (e não é dinheiro vivo)
         or (m.account_id is not null and ma.external_id is null and ma.type <> 'dinheiro')
         or (m.card_id is not null and mc.external_id is null)
       )
     order by (m.account_id is not distinct from b.account_id and m.card_id is not distinct from b.card_id) desc,
              abs(m.date - b.date), m.created_at
     limit 1;
    if v_mid is not null then
      update public.transactions set match_id = v_mid where id = b.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create function public.reconcile() returns int
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  return public._reconcile(auth.uid());
end $$;

-- desfaz o vínculo (pode ser chamado com o id de qualquer um dos dois lados)
create function public.unlink_match(p_id uuid) returns void
language plpgsql set search_path = ''
as $$
begin
  update public.transactions set match_id = null, match_locked = true
   where id = p_id or match_id = p_id;
end $$;

revoke execute on function public._reconcile(uuid) from public, anon, authenticated;
grant execute on function public._reconcile(uuid) to service_role;
revoke execute on function public.reconcile() from public, anon;
grant execute on function public.reconcile() to authenticated;
revoke execute on function public.unlink_match(uuid) from public, anon;
grant execute on function public.unlink_match(uuid) to authenticated;
