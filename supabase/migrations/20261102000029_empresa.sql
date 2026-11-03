-- Espaço Empresa: igual ao Pessoal (só o próprio usuário vê; nunca é compartilhado com a casa),
-- com categorias de empresa. Contas e cartões podem ser movidos entre Pessoal e Empresa.

-- 1) o escopo aceita 'empresa' em todas as tabelas
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname
      from pg_constraint c join pg_class k on k.oid = c.conrelid join pg_namespace n on n.oid = k.relnamespace
     where n.nspname = 'public' and c.contype = 'c' and c.conname like '%scope_check'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format($f$alter table %s add constraint %I check (scope in ('pessoal', 'casa', 'empresa'))$f$, r.tbl, r.conname);
  end loop;
end $$;
-- (RLS: as políticas só liberam para a casa quando scope = 'casa'; Empresa fica só com o dono, como o Pessoal.)

alter table public.profiles add column empresa_name text check (empresa_name is null or char_length(empresa_name) between 2 and 40);

create unique index networth_empresa on public.networth_snapshots (owner_id, month) where scope = 'empresa';

-- 2) categorias de empresa
create function public.seed_empresa_categories(p_owner uuid) returns void
language sql security definer set search_path = ''
as $$
  insert into public.categories (owner_id, scope, name, kind, essential) values
    (p_owner, 'empresa', 'Impostos (DAS, ISS)', 'despesa', true), (p_owner, 'empresa', 'Contador', 'despesa', true),
    (p_owner, 'empresa', 'Marketing e anúncios', 'despesa', false), (p_owner, 'empresa', 'Ferramentas e assinaturas', 'despesa', false),
    (p_owner, 'empresa', 'Telefone e internet', 'despesa', true), (p_owner, 'empresa', 'Combustível e deslocamento', 'despesa', false),
    (p_owner, 'empresa', 'Alimentação a trabalho', 'despesa', false), (p_owner, 'empresa', 'Taxas bancárias', 'despesa', true),
    (p_owner, 'empresa', 'Equipe e parceiros', 'despesa', false), (p_owner, 'empresa', 'Escritório e material', 'despesa', false),
    (p_owner, 'empresa', 'Pró-labore e retiradas', 'despesa', false), (p_owner, 'empresa', 'Outras despesas', 'despesa', false),
    (p_owner, 'empresa', 'Comissões', 'receita', false), (p_owner, 'empresa', 'Serviços prestados', 'receita', false),
    (p_owner, 'empresa', 'Outras receitas', 'receita', false);
$$;
revoke execute on function public.seed_empresa_categories(uuid) from public, anon, authenticated;

create function public.enable_empresa(p_name text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_name is null or char_length(trim(p_name)) < 2 then raise exception 'Informe o nome da empresa.'; end if;
  update public.profiles set empresa_name = left(trim(p_name), 40) where id = auth.uid();
  if not exists (select 1 from public.categories where owner_id = auth.uid() and scope = 'empresa') then
    perform public.seed_empresa_categories(auth.uid());
  end if;
end $$;
revoke execute on function public.enable_empresa(text) from public, anon;
grant execute on function public.enable_empresa(text) to authenticated;

-- 3) lançamento segue o escopo da conta ou do cartão quando um dos lados é Empresa (inclui Open Finance)
create function public.tx_follow_parent_scope() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v text;
begin
  if new.account_id is not null then select scope into v from public.accounts where id = new.account_id;
  elsif new.card_id is not null then select scope into v from public.cards where id = new.card_id;
  end if;
  if v is not null and v <> new.scope and (v = 'empresa' or new.scope = 'empresa') then
    new.scope := v;
    if new.category_id is not null then
      select c2.id into new.category_id from public.categories c1
        left join public.categories c2 on c2.owner_id = new.owner_id and c2.scope = v and c2.kind = c1.kind and c2.name = c1.name
       where c1.id = new.category_id;
    end if;
  end if;
  return new;
end $$;
create trigger a_follow_parent_scope before insert on public.transactions
  for each row execute function public.tx_follow_parent_scope();
revoke execute on function public.tx_follow_parent_scope() from public, anon, authenticated;

-- 4) mover conta ou cartão (com os lançamentos) entre Pessoal e Empresa
create function public.move_to_scope(p_kind text, p_id uuid, p_scope text) returns int
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  if p_scope not in ('pessoal', 'empresa') then raise exception 'Só dá para mover entre Pessoal e Empresa.'; end if;
  if p_kind = 'account' then
    update public.accounts set scope = p_scope where id = p_id and owner_id = v_uid and scope in ('pessoal', 'empresa');
  elsif p_kind = 'card' then
    update public.cards set scope = p_scope where id = p_id and owner_id = v_uid and scope in ('pessoal', 'empresa');
  else
    raise exception 'Tipo inválido.';
  end if;
  if not found then raise exception 'Conta ou cartão não encontrado (contas da Casa não podem ir para a Empresa).'; end if;

  update public.transactions t
     set scope = p_scope,
         category_id = (select c2.id from public.categories c1
                          join public.categories c2 on c2.owner_id = v_uid and c2.scope = p_scope and c2.kind = c1.kind and c2.name = c1.name
                         where c1.id = t.category_id),
         goal_id = null, recurrence_id = null, recurrence_month = null
   where t.owner_id = v_uid and t.scope <> p_scope
     and ((p_kind = 'account' and t.account_id = p_id) or (p_kind = 'card' and t.card_id = p_id));
  get diagnostics n = row_count;
  perform public._auto_categorize(v_uid);
  return n;
end $$;
revoke execute on function public.move_to_scope(text, uuid, text) from public, anon;
grant execute on function public.move_to_scope(text, uuid, text) to authenticated;

-- 5) Pix entre a empresa e você não é transferência entre contas suas: é retirada na Empresa e entrada no Pessoal
create or replace function public._detect_transfers(p_owner uuid)
returns jsonb
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

  update public.transactions t set is_transfer = true
   where t.owner_id = p_owner and not t.transfer_locked and not t.is_transfer and t.scope <> 'empresa'
     and t.type in ('receita', 'despesa') and t.invoice_id is null and t.debt_id is null
     and exists (select 1 from unnest(v_names) nm where public.name_in_text(nm, t.description));
  get diagnostics v_by_name = row_count;

  for d in
    select id, account_id, amount_cents, date, scope from public.transactions
     where owner_id = p_owner and type = 'despesa' and account_id is not null
       and not is_transfer and not transfer_locked and invoice_id is null and debt_id is null
     order by date
  loop
    select id into r_id from public.transactions
     where owner_id = p_owner and type = 'receita' and account_id is not null and account_id <> d.account_id
       and scope = d.scope
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

-- 6) foto do patrimônio por escopo (antes, Empresa cairia na foto do Pessoal)
create or replace function public.save_networth_snapshot(p_scope text, p_month text, p_assets bigint, p_liabilities bigint) returns void
language plpgsql set search_path = ''
as $$
declare v_id uuid;
begin
  if p_scope = 'casa' then
    select id into v_id from public.networth_snapshots where scope = 'casa' and household_id = public.my_household() and month = p_month;
  else
    select id into v_id from public.networth_snapshots where scope = p_scope and owner_id = auth.uid() and month = p_month;
  end if;
  if v_id is null then
    insert into public.networth_snapshots (scope, month, assets_cents, liabilities_cents) values (p_scope, p_month, p_assets, p_liabilities);
  else
    update public.networth_snapshots set assets_cents = p_assets, liabilities_cents = p_liabilities, updated_at = now() where id = v_id;
  end if;
end $$;

-- 7) avisos, assistente e relógio enxergam a Empresa do próprio usuário (nunca a de outra pessoa)
do $$
declare f text; def text;
begin
  foreach f in array array['public._alerts(uuid)', 'public.assistant_context(uuid)', 'public.watch_catalog(uuid)'] loop
    def := pg_get_functiondef(f::regprocedure);
    def := replace(def, $q$scope = 'pessoal')$q$, $q$scope in ('pessoal', 'empresa'))$q$);
    execute def;
  end loop;
  def := pg_get_functiondef('public.assistant_context(uuid)'::regprocedure);
  def := replace(def, $q$'tem_casa', v_h is not null,$q$,
    $q$'tem_casa', v_h is not null,
    'tem_empresa', exists (select 1 from public.profiles where id = p_owner and empresa_name is not null),
    'empresa', (select empresa_name from public.profiles where id = p_owner),$q$);
  execute def;
  -- nota fiscal da Empresa não abastece a despensa da casa
  def := pg_get_functiondef('public.pantry_from_scan()'::regprocedure);
  def := replace(def, $q$if new.status <> 'lancada' or$q$, $q$if new.scope = 'empresa' or new.status <> 'lancada' or$q$);
  execute def;
end $$;
