-- Correções da importação de extrato:
-- 1) só completa o nome quando o lançamento do banco é genérico ("DÉBITO DE CARTÃO"), nunca troca um nome bom;
-- 2) tira o sufixo que o C6 põe nas compras ("... PARANAGUA BRA. Cartão 5456");
-- 3) "TRANSF ENVIADA PIX" e parecidos também contam como descrição genérica.

create or replace function public.clean_merchant(p text) returns text
language sql immutable set search_path = ''
as $$ select trim(regexp_replace(regexp_replace(p, '\s+BRA\.?\s*Cart[aã]o\s*\d*\s*$', '', 'i'), '\s+BRA\.?\s*$', '', 'i')) $$;

create or replace function public.is_generic_desc(p text) returns boolean
language sql immutable set search_path = ''
as $$
  select public.norm_txt(coalesce(p, '')) ~ '^(debito de cartao|compra (no )?(cartao|debito)|compra com cartao|pagamento (com|de) cartao|debito|lancamento|transacao|pix enviado|pix recebido|transferencia|transf (enviada|recebida) pix|devol (enviada|recebida) pix|pix)( [0-9/:x* -]*)?$'
      or char_length(public.norm_txt(coalesce(p, ''))) < 3;
$$;

create or replace function public.import_statement(p_account_id uuid, p_card_id uuid, p_rows jsonb)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_scope text;
  r jsonb;
  v_type text;
  v_desc text;
  v_amount bigint;
  v_date date;
  v_ext text;
  v_cat uuid;
  v_new int;
  v_match public.transactions;
  v_used uuid[] := '{}';
  v_inserted int := 0;
  v_skipped int := 0;
  v_enriched int := 0;
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
    v_date := (r->>'date')::date;
    if v_type not in ('receita', 'despesa') or v_amount is null or v_amount <= 0 or v_ext is null or v_date is null
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

    v_desc := left(public.clean_merchant(coalesce(nullif(trim(r->>'description'), ''), 'Lançamento')), 80);
    if char_length(v_desc) < 2 then v_desc := 'Lançamento'; end if;

    -- já veio pelo Open Finance? então só completa o nome (sem duplicar)
    select t.* into v_match from public.transactions t
     where t.source = 'open_finance' and t.type = v_type and t.amount_cents = v_amount
       and (t.account_id = p_account_id or t.card_id = p_card_id)
       and abs(t.date - v_date) <= 2
       and not (t.id = any (v_used))
     order by (t.merchant is null and public.is_generic_desc(t.description)) desc, abs(t.date - v_date), t.created_at
     limit 1;
    if v_match.id is not null then
      v_used := v_used || v_match.id;
      if v_match.merchant is null and public.is_generic_desc(v_match.description) and not public.is_generic_desc(v_desc)
         and public.norm_txt(v_desc) <> public.norm_txt(v_match.description) then
        update public.transactions set merchant = v_desc where id = v_match.id;
        v_enriched := v_enriched + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
      v_match := null;
      continue;
    end if;

    v_cat := null;
    if nullif(r->>'category_id', '') is not null then
      select id into v_cat from public.categories
       where id = (r->>'category_id')::uuid and scope = v_scope and kind = v_type;
    end if;

    insert into public.transactions (scope, type, description, category_id, account_id, card_id, payment,
                                     amount_cents, date, affects_balance, source, external_id)
    values (v_scope, v_type, v_desc, v_cat, p_account_id, p_card_id,
            case when p_card_id is not null then 'credito' when v_desc ilike '%pix%' then 'pix' else 'debito' end,
            v_amount, v_date, false, 'extrato', v_ext)
    on conflict (owner_id, external_id) where external_id is not null do nothing;
    get diagnostics v_new = row_count;
    if v_new = 0 then v_skipped := v_skipped + 1; else v_inserted := v_inserted + 1; end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'enriched', v_enriched);
end $$;
