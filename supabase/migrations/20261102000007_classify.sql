-- Reclassificar um lançamento: transferência entre contas, ou receita/despesa numa categoria.
-- A direção (entrou ou saiu) vem do banco e não muda; muda como o lançamento conta nos totais.
-- p_apply_same: aplica também aos outros lançamentos com a mesma descrição e direção.
create function public.classify_transaction(p_id uuid, p_transfer boolean, p_category_id uuid, p_apply_same boolean default false)
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
          and public.norm_txt(x.description) = public.norm_txt(t.description));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.classify_transaction(uuid, boolean, uuid, boolean) from public, anon;
grant execute on function public.classify_transaction(uuid, boolean, uuid, boolean) to authenticated;
