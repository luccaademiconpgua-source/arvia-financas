-- Impede referenciar conta, cartao, meta ou categoria que o usuario nao enxerga.
create function public.check_tx_refs() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.account_id is not null and not exists (select 1 from public.accounts where id = new.account_id) then
    raise exception 'Conta não encontrada.';
  end if;
  if new.card_id is not null and not exists (select 1 from public.cards where id = new.card_id) then
    raise exception 'Cartão não encontrado.';
  end if;
  if new.goal_id is not null and not exists (select 1 from public.goals where id = new.goal_id) then
    raise exception 'Meta não encontrada.';
  end if;
  if new.category_id is not null and not exists (select 1 from public.categories where id = new.category_id) then
    raise exception 'Categoria não encontrada.';
  end if;
  return new;
end $$;

create trigger check_refs before insert or update on public.transactions
  for each row execute function public.check_tx_refs();

revoke execute on function public.my_household() from public, anon;
grant execute on function public.my_household() to authenticated;
