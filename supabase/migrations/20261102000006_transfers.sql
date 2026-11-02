-- Transferências entre contas próprias: não contam como receita nem despesa.
-- Duas formas de detectar:
--   1) pelo nome: o Pix traz o nome de quem está do outro lado; se for um dos
--      "nomes que são você" (profiles.transfer_names), é transferência;
--   2) pelo par: saída numa conta e entrada de mesmo valor em outra conta sua, até 3 dias.
-- A pessoa pode marcar ou desmarcar à mão; aí a detecção não mexe mais (transfer_locked).

alter table public.transactions
  add column is_transfer boolean not null default false,
  add column transfer_locked boolean not null default false,
  add column transfer_group uuid;

create index on public.transactions (owner_id, is_transfer) where is_transfer;

alter table public.profiles add column transfer_names text[] not null default '{}';
grant update (transfer_names) on public.profiles to authenticated;

-- minúsculas, sem acento, só letras e números separados por espaço
create function public.norm_txt(p text) returns text
language sql immutable set search_path = ''
as $$
  select trim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- todas as palavras do nome (com 3+ letras) aparecem no texto; exige ao menos 2 palavras
create function public.name_in_text(p_name text, p_text text) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  toks text[];
  t text;
  hay text := ' ' || public.norm_txt(p_text) || ' ';
  n int := 0;
begin
  toks := string_to_array(public.norm_txt(p_name), ' ');
  if toks is null then return false; end if;
  foreach t in array toks loop
    continue when char_length(t) < 3 or t in ('dos', 'das');
    if position(' ' || t || ' ' in hay) = 0 then return false; end if;
    n := n + 1;
  end loop;
  return n >= 2;
end $$;

create function public._detect_transfers(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_names text[];
  v_by_name int := 0;
  v_pairs int := 0;
  d record;
  r_id uuid;
  g uuid;
begin
  select case when cardinality(transfer_names) > 0 then transfer_names else array[name] end
    into v_names from public.profiles where id = p_owner;
  v_names := coalesce(v_names, '{}');

  -- 1) pelo nome
  update public.transactions t set is_transfer = true
   where t.owner_id = p_owner and not t.transfer_locked and not t.is_transfer
     and t.type in ('receita', 'despesa') and t.invoice_id is null and t.debt_id is null
     and exists (select 1 from unnest(v_names) nm where public.name_in_text(nm, t.description));
  get diagnostics v_by_name = row_count;

  -- 2) pelo par saída/entrada entre contas diferentes
  for d in
    select id, account_id, amount_cents, date from public.transactions
     where owner_id = p_owner and type = 'despesa' and account_id is not null
       and not is_transfer and not transfer_locked and invoice_id is null and debt_id is null
     order by date
  loop
    select id into r_id from public.transactions
     where owner_id = p_owner and type = 'receita' and account_id is not null and account_id <> d.account_id
       and amount_cents = d.amount_cents and abs(date - d.date) <= 3
       and not is_transfer and not transfer_locked
     order by abs(date - d.date), created_at
     limit 1;
    if r_id is not null then
      g := gen_random_uuid();
      update public.transactions set is_transfer = true, transfer_group = g where id in (d.id, r_id);
      v_pairs := v_pairs + 1;
    end if;
  end loop;

  return jsonb_build_object('by_name', v_by_name, 'pairs', v_pairs);
end $$;

-- versão para o app: sempre roda para quem chamou
create function public.detect_transfers() returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  return public._detect_transfers(auth.uid());
end $$;

-- marcar/desmarcar à mão (vale para o par inteiro); RLS decide o que a pessoa pode alterar
create function public.set_transfer(p_id uuid, p_value boolean) returns void
language plpgsql set search_path = ''
as $$
declare v_group uuid;
begin
  select transfer_group into v_group from public.transactions where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  update public.transactions
     set is_transfer = p_value, transfer_locked = true,
         transfer_group = case when p_value then transfer_group else null end
   where id = p_id or (v_group is not null and transfer_group = v_group);
end $$;

revoke execute on function public._detect_transfers(uuid) from public, anon, authenticated;
grant execute on function public._detect_transfers(uuid) to service_role;
revoke execute on function public.detect_transfers() from public, anon;
grant execute on function public.detect_transfers() to authenticated;
revoke execute on function public.set_transfer(uuid, boolean) from public, anon;
grant execute on function public.set_transfer(uuid, boolean) to authenticated;
