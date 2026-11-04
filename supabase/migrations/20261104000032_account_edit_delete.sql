-- Editar e apagar contas.
-- Conta do Open Finance apagada não volta na sincronização (fica numa lista de ignoradas),
-- e o nome que a pessoa deu à conta não é mais sobrescrito pelo banco.

create table public.account_tombstones (
  owner_id uuid not null references auth.users (id) on delete cascade,
  external_id text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, external_id)
);
alter table public.account_tombstones enable row level security;
create policy sel on public.account_tombstones for select using (owner_id = auth.uid());

create or replace function public.delete_account(p_id uuid, p_move_to uuid default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  a record;
  n int;
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  select * into a from public.accounts
   where id = p_id and (owner_id = v_uid or (scope = 'casa' and household_id = public.my_household()));
  if not found then raise exception 'Conta não encontrada.'; end if;

  if p_move_to is not null then
    if p_move_to = p_id or not exists (
      select 1 from public.accounts where id = p_move_to and scope = a.scope
         and (owner_id = v_uid or (scope = 'casa' and household_id = public.my_household()))
    ) then
      raise exception 'Escolha outra conta do mesmo espaço para receber os lançamentos.';
    end if;
    update public.transactions set account_id = p_move_to where account_id = p_id;
    get diagnostics n = row_count;
    update public.recurrences set account_id = p_move_to where account_id = p_id;
    update public.goals set account_id = p_move_to where account_id = p_id;
  else
    delete from public.transactions where account_id = p_id;
    get diagnostics n = row_count;
  end if;

  if a.external_id is not null then
    insert into public.account_tombstones (owner_id, external_id) values (a.owner_id, a.external_id)
    on conflict do nothing;
  end if;
  delete from public.accounts where id = p_id;
  return n;
end $$;
revoke execute on function public.delete_account(uuid, uuid) from public, anon;
grant execute on function public.delete_account(uuid, uuid) to authenticated;

-- sincronização do Open Finance: pula contas apagadas e mantém o nome escolhido pela pessoa
do $$
declare def text;
begin
  def := pg_get_functiondef('public.apply_pluggy_sync(uuid,text,jsonb)'::regprocedure);
  def := replace(def,
    $q$    if a->>'type' = 'CREDIT' then$q$,
    $q$    continue when exists (select 1 from public.account_tombstones tb where tb.owner_id = p_owner and tb.external_id = 'pluggy:' || (a->>'id'));
    if a->>'type' = 'CREDIT' then$q$);
  def := replace(def,
    $q$do update set name = excluded.name, institution = excluded.institution, of_status = 'conectada', of_synced_at = now()$q$,
    $q$do update set institution = excluded.institution, of_status = 'conectada', of_synced_at = now()$q$);
  if position('account_tombstones' in def) = 0 or position('do update set name = excluded.name' in def) > 0 then
    raise exception 'apply_pluggy_sync mudou: revisar a migração';
  end if;
  execute def;
end $$;
