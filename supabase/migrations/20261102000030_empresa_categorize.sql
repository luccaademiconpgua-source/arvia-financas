-- Categorização automática da Empresa: palavras de empresa (comissão, DAS, contador, anúncios...),
-- Pix para você mesmo vira pró-labore na Empresa, e o que vem da sua empresa entra como Salário no Pessoal.
create or replace function public.keyword_empresa(p_text text, p_type text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_type = 'receita' then
      case when p_text ~ '(comiss|ademicon|premiacao|bonific)' then 'Comissões'
           when p_text ~ '(servico|consultoria|honorario|nota fiscal|nfs)' then 'Serviços prestados' end
    when p_text ~ '(pro ?labore|retirada|distribuicao de lucro|lucros)' then 'Pró-labore e retiradas'
    when p_text ~ '(\mdas\M|simples nacional|darf|receita federal|\miss\M|inss|gps|prefeitura|tributo|imposto)' then 'Impostos (DAS, ISS)'
    when p_text ~ '(contab|contador|escritorio contabil)' then 'Contador'
    when p_text ~ '(facebk|facebook|meta ads|\mmeta\M|google ads|google ?\*ads|instagram|tiktok|anuncio|trafego)' then 'Marketing e anúncios'
    when p_text ~ '(canva|notion|google workspace|gsuite|chatgpt|openai|anthropic|claude|zoom|adobe|microsoft|capcut|hotmart|kiwify|n8n|supabase|vercel|github|zapier)' then 'Ferramentas e assinaturas'
    when p_text ~ '(\mvivo\M|\mclaro\M|\mtim\M|telefonica|internet|\mnet\M)' then 'Telefone e internet'
    when p_text ~ '(posto|combust|shell|ipiranga|petrobras|uber|99app|\m99\M|pedagio|estacionamento)' then 'Combustível e deslocamento'
    when p_text ~ '(tarifa|pacote de servicos|anuidade|\miof\M|juros|taxa)' then 'Taxas bancárias'
    when p_text ~ '(ifood|restaur|lanchon|padaria|cafe)' then 'Alimentação a trabalho'
    when p_text ~ '(kalunga|papelaria|escritorio|coworking)' then 'Escritório e material'
  end;
$$;

create or replace function public._auto_categorize(p_owner uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_cat uuid;
  v_name text;
  v_txt text;
  v_n int := 0;
  v_names text[];
  v_empresa text;
begin
  select case when cardinality(transfer_names) > 0 then transfer_names else array[name] end, public.norm_txt(empresa_name)
    into v_names, v_empresa from public.profiles where id = p_owner;
  v_names := coalesce(v_names, '{}');
  for r in
    select id, scope, type, description, merchant, bank_category
      from public.transactions
     where owner_id = p_owner and category_id is null and not is_transfer
       and type in ('receita', 'despesa') and source in ('open_finance', 'extrato')
  loop
    v_cat := null;
    select cr.category_id into v_cat from public.category_rules cr
     where cr.owner_id = p_owner and cr.scope = r.scope and cr.type = r.type
       and cr.pattern in (public.norm_txt(r.description), public.norm_txt(r.merchant))
     limit 1;
    if v_cat is null then
      v_txt := public.norm_txt(coalesce(r.merchant, '') || ' ' || r.description);
      if r.scope = 'empresa' then
        v_name := case when r.type = 'despesa' and exists (select 1 from unnest(v_names) nm where public.name_in_text(nm, r.description))
                       then 'Pró-labore e retiradas' else public.keyword_empresa(v_txt, r.type) end;
      elsif r.type = 'receita' and coalesce(v_empresa, '') <> '' and position(v_empresa in v_txt) > 0 then
        v_name := 'Salário';
      else
        v_name := coalesce(public.keyword_category(v_txt, r.type), public.bank_category_map(r.bank_category, r.type));
      end if;
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
