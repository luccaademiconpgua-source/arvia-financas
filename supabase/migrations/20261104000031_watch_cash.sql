-- Relógio: "paguei em dinheiro" sem conta Dinheiro cadastrada cria a Carteira (uma por escopo) em vez de cair no banco.
create or replace function public.watch_cash_account(p_owner uuid, p_scope text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v uuid;
begin
  if p_scope not in ('pessoal', 'casa', 'empresa') then raise exception 'escopo inválido'; end if;
  perform public.watch_as(p_owner);
  if p_scope = 'casa' then
    select id into v from public.accounts where scope = 'casa' and household_id = public.my_household() and type = 'dinheiro' limit 1;
  else
    select id into v from public.accounts where owner_id = p_owner and scope = p_scope and type = 'dinheiro' limit 1;
  end if;
  if v is null then
    insert into public.accounts (owner_id, scope, name, type) values (p_owner, p_scope, 'Carteira', 'dinheiro') returning id into v;
  end if;
  return v;
end $$;
revoke execute on function public.watch_cash_account(uuid, text) from public, anon, authenticated;
