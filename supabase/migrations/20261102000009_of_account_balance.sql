-- Em conta conectada pelo Open Finance, o saldo vem do banco: lançamentos manuais/nota/fatura
-- nessa conta não mexem no saldo (senão contariam duas vezes quando o banco trouxer a mesma operação).
create function public.of_account_balance() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.account_id is not null and new.source <> 'open_finance' and new.type <> 'ajuste'
     and exists (select 1 from public.accounts a where a.id = new.account_id and a.external_id like 'pluggy:%') then
    new.affects_balance := false;
  end if;
  return new;
end $$;

create trigger b_of_account_balance before insert or update of account_id on public.transactions
  for each row execute function public.of_account_balance();

revoke execute on function public.of_account_balance() from public, anon, authenticated;

update public.transactions t set affects_balance = false
 where t.affects_balance and t.source <> 'open_finance' and t.type <> 'ajuste'
   and exists (select 1 from public.accounts a where a.id = t.account_id and a.external_id like 'pluggy:%');
