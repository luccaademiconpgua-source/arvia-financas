-- Apagar cartão: some com as compras dele e as faturas; pagamentos de fatura já feitos pela conta continuam,
-- só deixam de apontar para a fatura. Cartão do Open Finance apagado não volta na sincronização.
create or replace function public.delete_card(p_id uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); c record; n int;
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  select * into c from public.cards
   where id = p_id and (owner_id = v_uid or (scope = 'casa' and household_id = public.my_household()));
  if not found then raise exception 'Cartão não encontrado.'; end if;
  update public.transactions set invoice_id = null
   where invoice_id in (select id from public.card_invoices where card_id = p_id) and card_id is distinct from p_id;
  delete from public.transactions where card_id = p_id;
  get diagnostics n = row_count;
  update public.recurrences set card_id = null where card_id = p_id;
  if c.external_id is not null then
    insert into public.account_tombstones (owner_id, external_id) values (c.owner_id, c.external_id) on conflict do nothing;
  end if;
  delete from public.cards where id = p_id;
  return n;
end $$;
revoke execute on function public.delete_card(uuid) from public, anon;
grant execute on function public.delete_card(uuid) to authenticated;
