-- Apple Watch / Siri: o app Atalhos manda o que a pessoa falou para a Edge Function `watch`,
-- autenticado por uma chave pessoal (só o hash fica guardado). Lançamentos feitos pelo relógio
-- ficam anotados em watch_events para o comando "desfazer".

create extension if not exists pgcrypto with schema extensions;

create table public.watch_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  key_hash text not null unique,
  hint text not null,
  label text not null default 'Apple Watch' check (char_length(label) between 1 and 40),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.watch_keys enable row level security;
create policy sel on public.watch_keys for select to authenticated using (owner_id = auth.uid());
create policy del on public.watch_keys for delete to authenticated using (owner_id = auth.uid());
revoke all on public.watch_keys from anon;
revoke insert, update on public.watch_keys from authenticated;

create table public.watch_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  said text not null,
  tx_ids uuid[] not null default '{}',
  group_ids uuid[] not null default '{}',
  task_ids uuid[] not null default '{}',
  undone boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.watch_events (owner_id, created_at desc);
alter table public.watch_events enable row level security;
revoke all on public.watch_events from anon, authenticated;

-- Cria uma chave e devolve o texto dela uma única vez.
create function public.create_watch_key(p_label text default 'Apple Watch') returns text
language plpgsql security definer set search_path = ''
as $$
declare v_key text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if (select count(*) from public.watch_keys where owner_id = auth.uid()) >= 5 then raise exception 'Você já tem 5 chaves. Apague uma antes.'; end if;
  v_key := 'arv_' || translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.watch_keys (owner_id, key_hash, hint, label)
  values (auth.uid(), encode(extensions.digest(v_key, 'sha256'), 'hex'), right(v_key, 4), left(coalesce(nullif(trim(p_label), ''), 'Apple Watch'), 40));
  return v_key;
end $$;
revoke execute on function public.create_watch_key(text) from public, anon;
grant execute on function public.create_watch_key(text) to authenticated;

-- Só a Edge Function (service_role): quem é o dono da chave.
create function public.watch_owner(p_key text) returns uuid
language sql security definer set search_path = ''
as $$
  update public.watch_keys set last_used_at = now()
   where key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex')
  returning owner_id;
$$;

-- Cadastros com ids (categorias, contas, cartões) que a pessoa enxerga, para a função ligar nomes a ids.
create function public.watch_catalog(p_owner uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with h as (select public.household_of(p_owner) as id)
  select jsonb_build_object(
    'household', (select id from h),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind, 'scope', c.scope)) from public.categories c
                   where (c.owner_id = p_owner and c.scope = 'pessoal') or (c.scope = 'casa' and c.household_id = (select id from h))), '[]'),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'type', a.type, 'scope', a.scope)) from public.accounts a
                   where (a.owner_id = p_owner and a.scope = 'pessoal') or (a.scope = 'casa' and a.household_id = (select id from h))), '[]'),
    'cards', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'scope', c.scope)) from public.cards c
                   where (c.owner_id = p_owner and c.scope = 'pessoal') or (c.scope = 'casa' and c.household_id = (select id from h))), '[]')
  );
$$;

-- Executa como se fosse a pessoa (auth.uid() = dono), para valer as mesmas regras do app.
create function public.watch_as(p_owner uuid) returns void
language sql set search_path = ''
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_owner, 'role', 'authenticated')::text, true) $$;

create function public.watch_add_tx(p_owner uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v uuid;
begin
  perform public.watch_as(p_owner);
  if (p->>'installments')::int >= 2 and p->>'card_id' is not null then
    v := public.add_installment_purchase(p->>'scope', p->>'description', (p->>'amount_cents')::bigint, (p->>'installments')::int,
                                         (p->>'date')::date, (p->>'card_id')::uuid, nullif(p->>'category_id', '')::uuid, null);
  else
    v := public.add_transaction(p->>'scope', p->>'type', p->>'description', (p->>'amount_cents')::bigint, (p->>'date')::date, p->>'payment',
                                nullif(p->>'category_id', '')::uuid, nullif(p->>'account_id', '')::uuid, nullif(p->>'card_id', '')::uuid);
  end if;
  return v;
end $$;

create function public.watch_after(p_owner uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._detect_transfers(p_owner);
  perform public._auto_categorize(p_owner);
  perform public._reconcile(p_owner);
  perform public._match_recurrences(p_owner);
end $$;

-- "desfazer": apaga o último lote lançado pelo relógio (até 30 minutos atrás).
create function public.watch_undo(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare e public.watch_events; x uuid; n int := 0;
begin
  select * into e from public.watch_events where owner_id = p_owner and not undone and created_at > now() - interval '30 minutes'
   order by created_at desc limit 1;
  if e.id is null then return jsonb_build_object('undone', 0); end if;
  perform public.watch_as(p_owner);
  foreach x in array e.tx_ids loop perform public.delete_transaction(x); n := n + 1; end loop;
  foreach x in array e.group_ids loop perform public.delete_installment_group(x); n := n + 1; end loop;
  delete from public.tasks where owner_id = p_owner and id = any (e.task_ids);
  n := n + coalesce(array_length(e.task_ids, 1), 0);
  update public.watch_events set undone = true where id = e.id;
  return jsonb_build_object('undone', n, 'said', e.said);
end $$;

do $$
declare f text;
begin
  foreach f in array array['watch_owner(text)', 'watch_catalog(uuid)', 'watch_as(uuid)', 'watch_add_tx(uuid,jsonb)', 'watch_after(uuid)', 'watch_undo(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
