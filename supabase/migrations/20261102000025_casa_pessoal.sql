-- Casa x Pessoal:
-- 1) veículos são da casa;
-- 2) a outra pessoa da casa usa a mesma aplicação do Meu Pluggy (Client ID/Secret) para conectar os bancos dela.
--    As contas que ela conectar entram no Pessoal dela, que só ela vê.

update public.vehicles v set scope = 'casa'
 where v.scope = 'pessoal' and public.household_of(v.owner_id) is not null;
update public.vehicle_logs l set scope = 'casa'
 where l.scope = 'pessoal' and exists (select 1 from public.vehicles v where v.id = l.vehicle_id and v.scope = 'casa');
update public.vehicle_reminders r set scope = 'casa'
 where r.scope = 'pessoal' and exists (select 1 from public.vehicles v where v.id = r.vehicle_id and v.scope = 'casa');

create or replace function public.get_pluggy_credentials(p_owner uuid)
returns table (client_id text, client_secret text)
language sql security definer set search_path = ''
as $$
  select c.client_id, s.decrypted_secret
  from public.pluggy_credentials c
  join vault.decrypted_secrets s on s.id = c.secret_id
  left join public.profiles p on p.id = c.owner_id
  where c.owner_id = p_owner or (p.household_id is not null and p.household_id = public.household_of(p_owner))
  order by (c.owner_id = p_owner) desc
  limit 1;
$$;

create or replace function public.pluggy_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'configured', exists (select 1 from public.pluggy_credentials c left join public.profiles p on p.id = c.owner_id
                          where c.owner_id = auth.uid() or (p.household_id is not null and p.household_id = public.my_household())),
    'mine', exists (select 1 from public.pluggy_credentials where owner_id = auth.uid()),
    'client_id_hint', (select right(client_id, 4) from public.pluggy_credentials where owner_id = auth.uid())
  );
$$;
