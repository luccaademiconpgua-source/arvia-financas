-- Importação de extrato (OFX/CSV) feita no navegador e gravada aqui.
-- Roda como o próprio usuário (RLS vale). Lançamentos entram como histórico:
-- não mexem no saldo (o saldo pode ser acertado à parte com adjust_balance).

alter table public.transactions drop constraint transactions_source_check;
alter table public.transactions add constraint transactions_source_check
  check (source in ('manual', 'nfce', 'open_finance', 'fatura', 'extrato'));

create function public.import_statement(p_account_id uuid, p_card_id uuid, p_rows jsonb)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_scope text;
  r jsonb;
  v_type text;
  v_desc text;
  v_amount bigint;
  v_ext text;
  v_cat uuid;
  v_new int;
  v_inserted int := 0;
  v_skipped int := 0;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if (p_account_id is null) = (p_card_id is null) then
    raise exception 'Escolha uma conta ou um cartão de destino.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nenhum lançamento para importar.';
  end if;
  if jsonb_array_length(p_rows) > 3000 then
    raise exception 'Arquivo grande demais: importe no máximo 3000 lançamentos por vez.';
  end if;

  if p_account_id is not null then
    select scope into v_scope from public.accounts where id = p_account_id;
    if not found then raise exception 'Conta não encontrada.'; end if;
  else
    select scope into v_scope from public.cards where id = p_card_id;
    if not found then raise exception 'Cartão não encontrado.'; end if;
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_type := r->>'type';
    v_amount := (r->>'amount_cents')::bigint;
    v_ext := left(r->>'external_id', 200);
    if v_type not in ('receita', 'despesa') or v_amount is null or v_amount <= 0 or v_ext is null
       or (p_card_id is not null and v_type = 'receita') then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- mesmo lançamento já importado nesta conta ou cartão (por mim ou pela outra pessoa da casa)
    if exists (select 1 from public.transactions t where t.external_id = v_ext
               and (t.account_id = p_account_id or t.card_id = p_card_id)) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_desc := left(coalesce(nullif(trim(r->>'description'), ''), 'Lançamento'), 80);
    if char_length(v_desc) < 2 then v_desc := 'Lançamento'; end if;

    v_cat := null;
    if nullif(r->>'category_id', '') is not null then
      select id into v_cat from public.categories
       where id = (r->>'category_id')::uuid and scope = v_scope and kind = v_type;
    end if;

    insert into public.transactions (scope, type, description, category_id, account_id, card_id, payment,
                                     amount_cents, date, affects_balance, source, external_id)
    values (v_scope, v_type, v_desc, v_cat, p_account_id, p_card_id,
            case when p_card_id is not null then 'credito' when v_desc ilike '%pix%' then 'pix' else 'debito' end,
            v_amount, (r->>'date')::date, false, 'extrato', v_ext)
    on conflict (owner_id, external_id) where external_id is not null do nothing;
    get diagnostics v_new = row_count;
    if v_new = 0 then v_skipped := v_skipped + 1; else v_inserted := v_inserted + 1; end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end $$;

revoke execute on function public.import_statement(uuid, uuid, jsonb) from public, anon;
grant execute on function public.import_statement(uuid, uuid, jsonb) to authenticated;
