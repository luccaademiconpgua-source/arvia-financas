-- Cada conta e cartão do Open Finance fica ligado à conexão (item) que o trouxe.
-- A pessoa pode dar um nome à conexão (ex.: "Inter PF" e "Inter PJ"); as contas dela levam o nome.
-- A conexão guarda um resumo do que o banco mandou, para mostrar na tela.

alter table public.accounts add column pluggy_item_id text;
alter table public.cards add column pluggy_item_id text;
alter table public.pluggy_items add column custom_name text check (custom_name is null or char_length(custom_name) between 1 and 40);
alter table public.pluggy_items add column accounts_info jsonb;

do $$
declare def text;
begin
  def := pg_get_functiondef('public.apply_pluggy_sync(uuid,text,jsonb)'::regprocedure);
  -- nome: o que a pessoa deu à conexão vale para as contas novas dela
  def := replace(def,
    $q$    if v_name = '' then v_name := 'Conta importada'; end if;$q$,
    $q$    if v_name = '' then v_name := 'Conta importada'; end if;
    v_name := coalesce((select left(pi.custom_name, 60) from public.pluggy_items pi where pi.owner_id = p_owner and pi.item_id = a->>'item' and pi.custom_name is not null), v_name);$q$);
  -- cartão: guarda a conexão e não sobrescreve mais o nome que a pessoa deu
  def := replace(def,
    $q$insert into public.cards (owner_id, scope, brand, label, last4, limit_cents, due_day, external_id)$q$,
    $q$insert into public.cards (owner_id, scope, brand, label, last4, limit_cents, due_day, external_id, pluggy_item_id)$q$);
  def := replace(def,
    $q$        'pluggy:' || (a->>'id')
      )
      on conflict (owner_id, external_id) where external_id is not null
      do update set label = excluded.label,$q$,
    $q$        'pluggy:' || (a->>'id'), a->>'item'
      )
      on conflict (owner_id, external_id) where external_id is not null
      do update set pluggy_item_id = excluded.pluggy_item_id,$q$);
  -- conta: guarda a conexão
  def := replace(def,
    $q$insert into public.accounts (owner_id, scope, name, type, institution, opening_balance_cents, of_status, of_synced_at, external_id)
      values (p_owner, 'pessoal', v_name, v_type, p_connector, v_balance, 'conectada', now(), 'pluggy:' || (a->>'id'))
      on conflict (owner_id, external_id) where external_id is not null
      do update set institution = excluded.institution,$q$,
    $q$insert into public.accounts (owner_id, scope, name, type, institution, opening_balance_cents, of_status, of_synced_at, external_id, pluggy_item_id)
      values (p_owner, 'pessoal', v_name, v_type, p_connector, v_balance, 'conectada', now(), 'pluggy:' || (a->>'id'), a->>'item')
      on conflict (owner_id, external_id) where external_id is not null
      do update set pluggy_item_id = excluded.pluggy_item_id, institution = excluded.institution,$q$);
  if (length(def) - length(replace(def, 'pluggy_item_id', ''))) / length('pluggy_item_id') < 6
     or position('pi.custom_name' in def) = 0 then
    raise exception 'apply_pluggy_sync mudou: revisar a migração';
  end if;
  execute def;
end $$;

-- renomear a conexão: renomeia junto as contas e cartões que vieram dela
create or replace function public.rename_pluggy_item(p_item_id text, p_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v text := nullif(trim(p_name), '');
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  if v is null or char_length(v) > 40 then raise exception 'Use um nome de 1 a 40 letras.'; end if;
  update public.pluggy_items set custom_name = v where owner_id = v_uid and item_id = p_item_id;
  if not found then raise exception 'Conexão não encontrada.'; end if;
  update public.accounts set name = v where owner_id = v_uid and pluggy_item_id = p_item_id;
  update public.cards set label = left(v, 40) where owner_id = v_uid and pluggy_item_id = p_item_id
     and (select count(*) from public.cards c2 where c2.owner_id = v_uid and c2.pluggy_item_id = p_item_id) = 1;
end $$;
revoke execute on function public.rename_pluggy_item(text, text) from public, anon;
grant execute on function public.rename_pluggy_item(text, text) to authenticated;

-- mover uma conexão inteira (contas e cartões dela) entre Pessoal e Empresa
create or replace function public.move_pluggy_item_scope(p_item_id text, p_scope text)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); r record; n int := 0;
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  if not exists (select 1 from public.pluggy_items where owner_id = v_uid and item_id = p_item_id) then
    raise exception 'Conexão não encontrada.';
  end if;
  for r in select 'account' k, id from public.accounts where owner_id = v_uid and pluggy_item_id = p_item_id and scope <> p_scope
           union all
           select 'card', id from public.cards where owner_id = v_uid and pluggy_item_id = p_item_id and scope <> p_scope loop
    n := n + public.move_to_scope(r.k, r.id, p_scope);
  end loop;
  return n;
end $$;
revoke execute on function public.move_pluggy_item_scope(text, text) from public, anon;
grant execute on function public.move_pluggy_item_scope(text, text) to authenticated;
