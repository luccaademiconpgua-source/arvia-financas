-- Chave do Gemini (Google AI Studio, plano gratuito) para ler foto de lista de compras escrita à mão.
-- Fica cifrada no Vault; só a Edge Function `list-photo` (service_role) lê. A outra pessoa da casa pode usar a mesma chave.

create table public.ai_credentials (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  secret_id uuid not null,
  hint text,
  updated_at timestamptz not null default now()
);
alter table public.ai_credentials enable row level security;
revoke all on public.ai_credentials from anon, authenticated;

create function public.save_gemini_key(p_key text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_old uuid; v_new uuid;
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  if p_key is null or trim(p_key) !~ '^[A-Za-z0-9_\-]{30,60}$' then raise exception 'Essa chave não parece uma chave do Google AI Studio.'; end if;
  select secret_id into v_old from public.ai_credentials where owner_id = v_uid;
  if v_old is not null then
    perform vault.update_secret(v_old, trim(p_key));
    update public.ai_credentials set hint = right(trim(p_key), 4), updated_at = now() where owner_id = v_uid;
  else
    v_new := vault.create_secret(trim(p_key), 'gemini_' || v_uid::text, 'Chave Gemini para ler listas');
    insert into public.ai_credentials (owner_id, secret_id, hint) values (v_uid, v_new, right(trim(p_key), 4));
  end if;
end $$;

create function public.delete_gemini_key() returns void
language plpgsql security definer set search_path = ''
as $$
declare v_old uuid;
begin
  select secret_id into v_old from public.ai_credentials where owner_id = auth.uid();
  delete from public.ai_credentials where owner_id = auth.uid();
  if v_old is not null then delete from vault.secrets where id = v_old; end if;
end $$;

-- mine: tenho chave; shared: alguém da casa tem (dá para usar)
create function public.gemini_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'mine', exists (select 1 from public.ai_credentials where owner_id = auth.uid()),
    'hint', (select hint from public.ai_credentials where owner_id = auth.uid()),
    'shared', exists (select 1 from public.ai_credentials c join public.profiles p on p.id = c.owner_id
                      where p.household_id is not null and p.household_id = public.my_household() and c.owner_id <> auth.uid())
  );
$$;

-- a minha chave, ou a de alguém da minha casa
create function public.get_gemini_key(p_owner uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select s.decrypted_secret from public.ai_credentials c
  join vault.decrypted_secrets s on s.id = c.secret_id
  left join public.profiles p on p.id = c.owner_id
  where c.owner_id = p_owner or (p.household_id is not null and p.household_id = public.household_of(p_owner))
  order by (c.owner_id = p_owner) desc
  limit 1;
$$;

revoke execute on function public.save_gemini_key(text) from public, anon;
revoke execute on function public.delete_gemini_key() from public, anon;
revoke execute on function public.gemini_status() from public, anon;
grant execute on function public.save_gemini_key(text) to authenticated;
grant execute on function public.delete_gemini_key() to authenticated;
grant execute on function public.gemini_status() to authenticated;
revoke execute on function public.get_gemini_key(uuid) from public, anon, authenticated;
grant execute on function public.get_gemini_key(uuid) to service_role;
