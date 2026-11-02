-- Compras parceladas no cartão: cada parcela vira um lançamento no mês da sua fatura.

alter table public.transactions
  add column installment_group uuid,
  add column installment_no int check (installment_no is null or installment_no >= 1),
  add column installment_total int check (installment_total is null or installment_total between 2 and 48);
create index on public.transactions (installment_group) where installment_group is not null;

create function public.add_installment_purchase(
  p_scope text, p_description text, p_total_cents bigint, p_count int, p_date date,
  p_card_id uuid, p_category_id uuid default null, p_essential boolean default null
) returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_card public.cards;
  v_inv public.card_invoices;
  v_group uuid := gen_random_uuid();
  v_closing int;
  v_first date;
  v_ym text;
  v_each bigint;
  v_amount bigint;
  v_essential boolean := p_essential;
  i int;
begin
  if p_count is null or p_count < 2 or p_count > 48 then raise exception 'Escolha de 2 a 48 parcelas.'; end if;
  if p_total_cents is null or p_total_cents < p_count then raise exception 'Informe um valor maior que zero.'; end if;
  select * into v_card from public.cards where id = p_card_id for update;
  if not found then raise exception 'Cartão não encontrado.'; end if;
  if v_essential is null and p_category_id is not null then
    select essential into v_essential from public.categories where id = p_category_id;
  end if;

  v_closing := greatest(1, v_card.due_day - 7);
  -- mês da fatura da 1ª parcela (mesma regra da compra à vista)
  v_first := case when extract(day from p_date) <= v_closing then date_trunc('month', p_date)::date
                  else (date_trunc('month', p_date) + interval '1 month')::date end;
  v_each := p_total_cents / p_count;

  for i in 1..p_count loop
    v_amount := v_each + case when i = 1 then p_total_cents - v_each * p_count else 0 end;
    v_ym := to_char(v_first + make_interval(months => i - 1), 'YYYY-MM');
    select * into v_inv from public.card_invoices
      where card_id = p_card_id and month = v_ym and status <> 'paga' limit 1 for update;
    if not found then
      insert into public.card_invoices (card_id, month, status, amount_cents)
      values (p_card_id, v_ym, 'aberta', 0) returning * into v_inv;
    end if;
    update public.card_invoices set amount_cents = amount_cents + v_amount where id = v_inv.id;

    insert into public.transactions (
      scope, type, description, category_id, card_id, payment, amount_cents, date, essential,
      affects_balance, source, invoice_id, installment_group, installment_no, installment_total
    ) values (
      p_scope, 'despesa', trim(p_description), p_category_id, p_card_id, 'credito', v_amount,
      (p_date + make_interval(months => i - 1))::date, v_essential,
      false, 'manual', v_inv.id, v_group, i, p_count
    );
  end loop;
  return v_group;
end $$;

-- Exclui todas as parcelas de uma compra (cada uma desfaz o valor na sua fatura).
create function public.delete_installment_group(p_group uuid) returns int
language plpgsql set search_path = ''
as $$
declare r record; n int := 0;
begin
  for r in select id from public.transactions where installment_group = p_group loop
    perform public.delete_transaction(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.add_installment_purchase(text,text,bigint,int,date,uuid,uuid,boolean) from public, anon;
grant execute on function public.add_installment_purchase(text,text,bigint,int,date,uuid,uuid,boolean) to authenticated;
revoke execute on function public.delete_installment_group(uuid) from public, anon;
grant execute on function public.delete_installment_group(uuid) to authenticated;
