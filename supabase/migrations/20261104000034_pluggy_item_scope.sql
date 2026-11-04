-- A conexão lembra se é Pessoal ou Empresa: conta ou cartão novo que chegar por ela já entra no lugar certo.
alter table public.pluggy_items add column scope text not null default 'pessoal' check (scope in ('pessoal', 'empresa'));

do $$
declare def text;
begin
  def := pg_get_functiondef('public.apply_pluggy_sync(uuid,text,jsonb)'::regprocedure);
  def := replace(def,
    $q$        p_owner, 'pessoal', v_brand, v_name, v_digits,$q$,
    $q$        p_owner, coalesce((select pi.scope from public.pluggy_items pi where pi.owner_id = p_owner and pi.item_id = a->>'item'), 'pessoal'), v_brand, v_name, v_digits,$q$);
  def := replace(def,
    $q$      values (p_owner, 'pessoal', v_name, v_type, p_connector,$q$,
    $q$      values (p_owner, coalesce((select pi.scope from public.pluggy_items pi where pi.owner_id = p_owner and pi.item_id = a->>'item'), 'pessoal'), v_name, v_type, p_connector,$q$);
  if (length(def) - length(replace(def, 'pi.scope', ''))) / length('pi.scope') < 2 then
    raise exception 'apply_pluggy_sync mudou: revisar a migração';
  end if;
  execute def;
end $$;

create or replace function public.move_pluggy_item_scope(p_item_id text, p_scope text)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); r record; n int := 0;
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  if p_scope not in ('pessoal', 'empresa') then raise exception 'Só dá para mover entre Pessoal e Empresa.'; end if;
  update public.pluggy_items set scope = p_scope where owner_id = v_uid and item_id = p_item_id;
  if not found then raise exception 'Conexão não encontrada.'; end if;
  for r in select 'account' k, id from public.accounts where owner_id = v_uid and pluggy_item_id = p_item_id and scope <> p_scope
           union all
           select 'card', id from public.cards where owner_id = v_uid and pluggy_item_id = p_item_id and scope <> p_scope loop
    n := n + public.move_to_scope(r.k, r.id, p_scope);
  end loop;
  return n;
end $$;
