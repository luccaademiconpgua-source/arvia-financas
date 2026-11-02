-- Open Finance via Meu Pluggy (plano gratuito, uso pessoal).
-- Cada pessoa guarda as proprias credenciais. O segredo fica no Vault e so a
-- Edge Function (service_role) consegue le-lo.

-- Unicidade do identificador externo para contas e cartoes importados
create unique index accounts_external_uniq on public.accounts (owner_id, external_id) where external_id is not null;
create unique index cards_external_uniq on public.cards (owner_id, external_id) where external_id is not null;

create table public.pluggy_credentials (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  client_id text not null,
  secret_id uuid not null,
  updated_at timestamptz not null default now()
);

create table public.pluggy_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  connector_name text,
  status text not null default 'ok' check (status in ('ok', 'erro', 'expirada')),
  last_error text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, item_id)
);

alter table public.pluggy_credentials enable row level security;
alter table public.pluggy_items enable row level security;
-- credenciais: nenhuma policy, ninguem do cliente le a tabela
create policy pitems_sel on public.pluggy_items for select to authenticated using (owner_id = auth.uid());

revoke all on public.pluggy_credentials from anon, authenticated;
revoke all on public.pluggy_items from anon, authenticated;
grant select on public.pluggy_items to authenticated;

-- ---------- Salvar credenciais (segredo vai para o Vault) ----------
create function public.save_pluggy_credentials(p_client_id text, p_client_secret text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old uuid;
  v_new uuid;
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  if char_length(trim(coalesce(p_client_id, ''))) < 8 or char_length(trim(coalesce(p_client_secret, ''))) < 8 then
    raise exception 'Client ID e Client Secret inválidos.';
  end if;
  select secret_id into v_old from public.pluggy_credentials where owner_id = v_uid;
  if v_old is not null then
    perform vault.update_secret(v_old, trim(p_client_secret));
    update public.pluggy_credentials set client_id = trim(p_client_id), updated_at = now() where owner_id = v_uid;
  else
    v_new := vault.create_secret(trim(p_client_secret), 'pluggy_' || v_uid::text, 'Client Secret Meu Pluggy');
    insert into public.pluggy_credentials (owner_id, client_id, secret_id) values (v_uid, trim(p_client_id), v_new);
  end if;
end $$;

create function public.delete_pluggy_credentials()
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_old uuid;
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  select secret_id into v_old from public.pluggy_credentials where owner_id = v_uid;
  delete from public.pluggy_credentials where owner_id = v_uid;
  if v_old is not null then delete from vault.secrets where id = v_old; end if;
end $$;

-- Mostra so se existe e o final do Client ID, nunca o segredo
create function public.pluggy_status()
returns jsonb
language sql security definer set search_path = ''
as $$
  select jsonb_build_object(
    'configured', exists (select 1 from public.pluggy_credentials where owner_id = auth.uid()),
    'client_id_hint', (select right(client_id, 4) from public.pluggy_credentials where owner_id = auth.uid())
  );
$$;

-- ---------- Somente servidor ----------
create function public.get_pluggy_credentials(p_owner uuid)
returns table (client_id text, client_secret text)
language sql security definer set search_path = ''
as $$
  select c.client_id, s.decrypted_secret
  from public.pluggy_credentials c
  join vault.decrypted_secrets s on s.id = c.secret_id
  where c.owner_id = p_owner;
$$;

-- Recebe o retorno da Pluggy (contas + transacoes) e grava tudo numa transacao.
-- Idempotente: transacoes repetidas sao ignoradas pelo external_id.
create function public.apply_pluggy_sync(p_owner uuid, p_connector text, p_accounts jsonb)
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
        insert into public.transactions (owner_id, scope, type, description, card_id, payment, amount_cents, date, affects_balance, source, external_id)
        values (p_owner, 'pessoal', 'despesa', v_desc, v_card, 'credito', v_amount, left(t->>'date', 10)::date, false, 'open_finance', 'pluggy:' || (t->>'id'))
        on conflict (owner_id, external_id) where external_id is not null do nothing;
        get diagnostics v_new = row_count;
        v_count_tx := v_count_tx + v_new;
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
        insert into public.transactions (owner_id, scope, type, description, account_id, payment, amount_cents, date, affects_balance, source, external_id)
        values (
          p_owner, 'pessoal',
          case when t->>'type' = 'CREDIT' then 'receita' else 'despesa' end,
          v_desc, v_acc,
          case when v_desc ilike '%pix%' then 'pix' else 'debito' end,
          v_amount, left(t->>'date', 10)::date, false, 'open_finance', 'pluggy:' || (t->>'id')
        )
        on conflict (owner_id, external_id) where external_id is not null do nothing;
        get diagnostics v_new = row_count;
        v_count_tx := v_count_tx + v_new;
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

revoke execute on function public.get_pluggy_credentials(uuid) from public, anon, authenticated;
revoke execute on function public.apply_pluggy_sync(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.get_pluggy_credentials(uuid) to service_role;
grant execute on function public.apply_pluggy_sync(uuid, text, jsonb) to service_role;

revoke execute on function public.save_pluggy_credentials(text, text) from public, anon;
revoke execute on function public.delete_pluggy_credentials() from public, anon;
revoke execute on function public.pluggy_status() from public, anon;
grant execute on function public.save_pluggy_credentials(text, text) to authenticated;
grant execute on function public.delete_pluggy_credentials() to authenticated;
grant execute on function public.pluggy_status() to authenticated;
