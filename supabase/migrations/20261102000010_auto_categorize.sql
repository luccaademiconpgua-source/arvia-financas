-- Categorização automática que aprende.
-- Ordem de prioridade para lançamentos sem categoria vindos do banco/extrato:
--   1) regra aprendida (quando a pessoa reclassifica, a Arvia lembra para os próximos);
--   2) palavras-chave no nome do estabelecimento ou na descrição;
--   3) categoria sugerida pelo banco (Pluggy).

alter table public.transactions add column bank_category text, add column merchant text;

create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'casa')),
  household_id uuid references public.households (id) on delete cascade,
  pattern text not null,
  type text not null check (type in ('receita', 'despesa')),
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, scope, type, pattern)
);

create trigger set_scope before insert or update of scope on public.category_rules
  for each row execute function public.set_scope_fields();
alter table public.category_rules enable row level security;
create policy sel on public.category_rules for select to authenticated using (owner_id = auth.uid() or (scope = 'casa' and household_id = public.my_household()));
create policy del on public.category_rules for delete to authenticated using (owner_id = auth.uid());
create policy ins on public.category_rules for insert to authenticated with check (owner_id = auth.uid());
create policy upd on public.category_rules for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.category_rules from anon;

-- nome da categoria sugerida por palavra-chave (texto já normalizado por norm_txt)
create function public.keyword_category(p_text text, p_type text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_type = 'receita' then
      case when p_text ~ '(salario|folha de pag|proventos|pro labore)' then 'Salário' end
    when p_text ~ '(mercado pago|picpay|pagseguro|pagbank)' then null
    when p_text ~ '(netflix|spotify|prime video|amazon prime|disney|youtube|hbo|globoplay|apple com|icloud|google one|deezer|paramount)' then 'Assinaturas'
    when p_text ~ '(mercado ?livre|shopee|amazon|magalu|magazine luiza|aliexpress|shein|americanas)' then 'Compras online'
    when p_text ~ '(supermerc|mercado|muffato|condor|atacad|assai|carrefour|hortifruti|sacolao|angeloni|festval|bavaresc|komprao|koch)' then 'Mercado'
    when p_text ~ '(posto|combust|shell|ipiranga|petrobras|br mania)' then 'Gasolina'
    when p_text ~ '(farmac|drogar|droga raia|panvel|nissei|pague menos|drogasil|morifarma|hospital|clinica|laborat|odonto)' then 'Saúde e bem-estar'
    when p_text ~ '(ifood|rappi|restaur|lanchon|burger|pizz|padaria|churrasc|sushi|mcdonald|subway|\mbar\M|\mcafe\M)' then 'Restaurante'
    when p_text ~ '(academia|smart ?fit|gympass|wellhub|crossfit)' then 'Academia'
    when p_text ~ '(\mvivo\M|\mclaro\M|\mtim\M|telefonica)' then 'Plano de telefone'
    when p_text ~ '(copel|sanepar|energia|celesc|cemig|\magua\M|esgoto|internet|receita federal|simples nacional|darf)' then 'Contas'
    when p_text ~ '(aluguel|condominio|imobiliaria|iptu)' then 'Moradia'
    when p_text ~ '(escola|faculdade|universidade|\mcurso|udemy|alura|hotmart|livraria)' then 'Educação'
    when p_text ~ '(renner|riachuelo|\mzara\M|hering|centauro|netshoes)' then 'Vestuário'
    when p_text ~ '(cinema|ingresso|sympla|eventim|steam|playstation|viagem|hotel|airbnb)' then 'Lazer'
    when p_text ~ '(parcela|financiamento|consorcio|emprestimo|ademicon)' then 'Parcelas'
    when p_text ~ '(estacionamento|pedagio|auto pecas|autopecas|oficina|detran|ipva)' then 'Veículo'
  end;
$$;

-- categoria do banco (Pluggy, em inglês) para a nossa
create function public.bank_category_map(p_cat text, p_type text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_cat is null then null
    when p_type = 'receita' then case when lower(p_cat) like '%salary%' then 'Salário' end
    when lower(p_cat) ~ '(groceries|supermarket)' then 'Mercado'
    when lower(p_cat) ~ '(restaurant|eating out|food delivery|bars)' then 'Restaurante'
    when lower(p_cat) ~ '(gas station|fuel)' then 'Gasolina'
    when lower(p_cat) ~ '(pharmac|health|hospital|dentist)' then 'Saúde e bem-estar'
    when lower(p_cat) ~ '(streaming|digital service|subscription)' then 'Assinaturas'
    when lower(p_cat) ~ '(online shopping)' then 'Compras online'
    when lower(p_cat) ~ '(clothing)' then 'Vestuário'
    when lower(p_cat) ~ '(telecom|mobile|phone)' then 'Plano de telefone'
    when lower(p_cat) ~ '(electricity|water|utilities|internet|taxes)' then 'Contas'
    when lower(p_cat) ~ '(rent|housing)' then 'Moradia'
    when lower(p_cat) ~ '(education|school|university)' then 'Educação'
    when lower(p_cat) ~ '(gym|sport|fitness)' then 'Academia'
    when lower(p_cat) ~ '(entertainment|leisure|travel|lodging|tickets)' then 'Lazer'
    when lower(p_cat) ~ '(loan|financing|installment)' then 'Parcelas'
    when lower(p_cat) ~ '(vehicle|parking|toll|automotive)' then 'Veículo'
  end;
$$;

create function public._auto_categorize(p_owner uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_cat uuid;
  v_name text;
  v_txt text;
  v_n int := 0;
begin
  for r in
    select id, scope, type, description, merchant, bank_category
      from public.transactions
     where owner_id = p_owner and category_id is null and not is_transfer
       and type in ('receita', 'despesa') and source in ('open_finance', 'extrato')
  loop
    v_cat := null;
    -- 1) regra aprendida (pela descrição ou pelo estabelecimento)
    select cr.category_id into v_cat from public.category_rules cr
     where cr.owner_id = p_owner and cr.scope = r.scope and cr.type = r.type
       and cr.pattern in (public.norm_txt(r.description), public.norm_txt(r.merchant))
     limit 1;
    -- 2) palavras-chave, 3) categoria do banco
    if v_cat is null then
      v_txt := public.norm_txt(coalesce(r.merchant, '') || ' ' || r.description);
      v_name := coalesce(public.keyword_category(v_txt, r.type), public.bank_category_map(r.bank_category, r.type));
      if v_name is not null then
        select id into v_cat from public.categories
         where owner_id = p_owner and scope = r.scope and kind = r.type and name = v_name limit 1;
      end if;
    end if;
    if v_cat is not null then
      update public.transactions set category_id = v_cat where id = r.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create function public.auto_categorize() returns int
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  return public._auto_categorize(auth.uid());
end $$;

-- reclassificar agora também ensina: os próximos lançamentos com o mesmo nome já vêm nesta categoria
create or replace function public.classify_transaction(p_id uuid, p_transfer boolean, p_category_id uuid, p_apply_same boolean default false)
returns int
language plpgsql set search_path = ''
as $$
declare
  t public.transactions;
  v_count int;
begin
  select * into t from public.transactions where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if t.type not in ('receita', 'despesa') then raise exception 'Só receitas e despesas podem ser reclassificadas.'; end if;
  if not p_transfer and p_category_id is not null and not exists (
    select 1 from public.categories c where c.id = p_category_id and c.scope = t.scope and c.kind = t.type
  ) then
    raise exception 'Categoria inválida para este lançamento.';
  end if;

  update public.transactions x
     set is_transfer = p_transfer,
         transfer_locked = true,
         transfer_group = case when p_transfer then x.transfer_group else null end,
         category_id = case when p_transfer or x.type <> t.type then x.category_id else p_category_id end
   where x.id = p_id
      or (t.transfer_group is not null and x.transfer_group = t.transfer_group and not p_transfer)
      or (p_apply_same and x.scope = t.scope and x.type = t.type
          and public.norm_txt(coalesce(x.merchant, x.description)) = public.norm_txt(coalesce(t.merchant, t.description)));
  get diagnostics v_count = row_count;

  if p_apply_same and not p_transfer and p_category_id is not null then
    insert into public.category_rules (owner_id, scope, type, pattern, category_id)
    values (auth.uid(), t.scope, t.type, public.norm_txt(coalesce(t.merchant, t.description)), p_category_id)
    on conflict (owner_id, scope, type, pattern) do update set category_id = excluded.category_id;
  end if;
  return v_count;
end $$;

revoke execute on function public._auto_categorize(uuid) from public, anon, authenticated;
grant execute on function public._auto_categorize(uuid) to service_role;
revoke execute on function public.auto_categorize() from public, anon;
grant execute on function public.auto_categorize() to authenticated;

-- sincronização guarda categoria e estabelecimento do banco
create or replace function public.apply_pluggy_sync(p_owner uuid, p_connector text, p_accounts jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb;
  t jsonb;
  v_acc uuid;
  v_card uuid;
  v_inv uuid;
  v_count_tx int := 0;
  v_new int;
  v_accs int := 0;
  v_cards int := 0;
  v_balance bigint;
  v_local bigint;
  v_desc text;
  v_amount bigint;
  v_type text;
  v_name text;
  v_digits text;
  v_brand text;
  v_due date;
  v_month text;
  v_ins boolean;
begin
  if not exists (select 1 from auth.users where id = p_owner) then
    raise exception 'Usuário inválido.';
  end if;

  for a in select * from jsonb_array_elements(coalesce(p_accounts, '[]'::jsonb)) loop
    v_name := left(trim(concat_ws(' ', p_connector, a->>'name')), 60);
    if v_name = '' then v_name := 'Conta importada'; end if;

    if a->>'type' = 'CREDIT' then
      -- Cartao de credito
      v_digits := regexp_replace(coalesce(a->>'number', ''), '\D', '', 'g');
      v_digits := case when char_length(v_digits) >= 4 then right(v_digits, 4) else '0000' end;
      v_brand := lower(coalesce(a #>> '{creditData,brand}', ''));
      v_brand := case when v_brand like '%master%' then 'master' when v_brand like '%elo%' then 'elo' else 'visa' end;
      begin
        v_due := (a #>> '{creditData,balanceDueDate}')::timestamptz::date;
      exception when others then v_due := null;
      end;

      insert into public.cards (owner_id, scope, brand, label, last4, limit_cents, due_day, external_id)
      values (
        p_owner, 'pessoal', v_brand, v_name, v_digits,
        case when (a #>> '{creditData,creditLimit}') is not null then round(((a #>> '{creditData,creditLimit}')::numeric) * 100)::bigint end,
        coalesce(extract(day from v_due)::int, 10),
        'pluggy:' || (a->>'id')
      )
      on conflict (owner_id, external_id) where external_id is not null
      do update set label = excluded.label, limit_cents = coalesce(excluded.limit_cents, public.cards.limit_cents),
                    due_day = case when v_due is null then public.cards.due_day else excluded.due_day end
      returning id into v_card;
      v_cards := v_cards + 1;

      -- fatura aberta recebe o saldo devedor informado pelo banco
      v_balance := greatest(round(coalesce((a->>'balance')::numeric, 0) * 100)::bigint, 0);
      v_month := to_char(coalesce(v_due, current_date), 'YYYY-MM');
      select id into v_inv from public.card_invoices where card_id = v_card and status = 'aberta' order by month limit 1;
      if v_inv is null then
        insert into public.card_invoices (card_id, month, status, amount_cents) values (v_card, v_month, 'aberta', v_balance);
      else
        update public.card_invoices set amount_cents = v_balance where id = v_inv;
      end if;

      for t in select * from jsonb_array_elements(coalesce(a->'transactions', '[]'::jsonb)) loop
        -- no cartao entram so as compras (DEBIT); pagamentos de fatura aparecem na conta
        continue when t->>'type' is distinct from 'DEBIT';
        v_amount := abs(round(coalesce((t->>'amount')::numeric, 0) * 100))::bigint;
        continue when v_amount = 0;
        v_desc := left(coalesce(nullif(trim(t->>'description'), ''), 'Compra no cartão'), 80);
        if char_length(v_desc) < 2 then v_desc := 'Compra'; end if;
        insert into public.transactions (owner_id, scope, type, description, card_id, payment, amount_cents, date, affects_balance, source, external_id, bank_category, merchant)
        values (p_owner, 'pessoal', 'despesa', v_desc, v_card, 'credito', v_amount, left(t->>'date', 10)::date, false, 'open_finance', 'pluggy:' || (t->>'id'),
                nullif(left(t->>'category', 80), ''), nullif(left(t->>'merchant', 80), ''))
        on conflict (owner_id, external_id) where external_id is not null
        do update set bank_category = coalesce(public.transactions.bank_category, excluded.bank_category),
                      merchant = coalesce(public.transactions.merchant, excluded.merchant)
        returning (xmax = 0) into v_ins;
        if v_ins then v_count_tx := v_count_tx + 1; end if;
      end loop;

    else
      -- Conta bancaria
      v_type := case when a->>'subtype' = 'SAVINGS_ACCOUNT' then 'investimento' else 'corrente' end;
      v_balance := round(coalesce((a->>'balance')::numeric, 0) * 100)::bigint;

      insert into public.accounts (owner_id, scope, name, type, institution, opening_balance_cents, of_status, of_synced_at, external_id)
      values (p_owner, 'pessoal', v_name, v_type, p_connector, v_balance, 'conectada', now(), 'pluggy:' || (a->>'id'))
      on conflict (owner_id, external_id) where external_id is not null
      do update set name = excluded.name, institution = excluded.institution, of_status = 'conectada', of_synced_at = now()
      returning id into v_acc;
      v_accs := v_accs + 1;

      for t in select * from jsonb_array_elements(coalesce(a->'transactions', '[]'::jsonb)) loop
        v_amount := abs(round(coalesce((t->>'amount')::numeric, 0) * 100))::bigint;
        continue when v_amount = 0;
        v_desc := left(coalesce(nullif(trim(t->>'description'), ''), 'Movimentação'), 80);
        if char_length(v_desc) < 2 then v_desc := 'Movimentação'; end if;
        insert into public.transactions (owner_id, scope, type, description, account_id, payment, amount_cents, date, affects_balance, source, external_id, bank_category, merchant)
        values (
          p_owner, 'pessoal',
          case when t->>'type' = 'CREDIT' then 'receita' else 'despesa' end,
          v_desc, v_acc,
          case when v_desc ilike '%pix%' then 'pix' else 'debito' end,
          v_amount, left(t->>'date', 10)::date, false, 'open_finance', 'pluggy:' || (t->>'id'),
          nullif(left(t->>'category', 80), ''), nullif(left(t->>'merchant', 80), '')
        )
        on conflict (owner_id, external_id) where external_id is not null
        do update set bank_category = coalesce(public.transactions.bank_category, excluded.bank_category),
                      merchant = coalesce(public.transactions.merchant, excluded.merchant)
        returning (xmax = 0) into v_ins;
        if v_ins then v_count_tx := v_count_tx + 1; end if;
      end loop;

      -- saldo exibido = saldo do banco: abertura = saldo do banco - movimentos locais que afetam saldo
      select coalesce(sum(case type
               when 'receita' then amount_cents
               when 'despesa' then -amount_cents
               when 'reserva' then -amount_cents
               else coalesce(signed_cents, 0) end), 0)
        into v_local
        from public.transactions where account_id = v_acc and affects_balance;
      update public.accounts set opening_balance_cents = v_balance - v_local where id = v_acc;
    end if;
  end loop;

  return jsonb_build_object('accounts', v_accs, 'cards', v_cards, 'transactions', v_count_tx);
end $$;
