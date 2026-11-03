-- Veículo é sempre da Casa (quando a pessoa tem casa); registros e lembretes seguem o escopo do veículo.
-- Abastecimento pode vir de uma nota fiscal de posto (nfce_id), sem lançar a despesa duas vezes.

-- 1) um veículo só: o Up cadastrado duas vezes (um vazio na Casa, outro com km no Pessoal)
delete from public.vehicles v
 where v.scope = 'casa' and v.initial_odometer = 0
   and not exists (select 1 from public.vehicle_logs l where l.vehicle_id = v.id)
   and not exists (select 1 from public.vehicle_reminders r where r.vehicle_id = v.id)
   and exists (select 1 from public.vehicles o where o.id <> v.id and o.owner_id = v.owner_id and o.scope = 'pessoal'
               and upper(coalesce(o.plate, o.name)) = upper(coalesce(v.plate, v.name)));
update public.vehicles set scope = 'casa' where scope = 'pessoal' and public.household_of(owner_id) is not null;
update public.vehicle_logs l set scope = v.scope from public.vehicles v where v.id = l.vehicle_id and l.scope <> v.scope;
update public.vehicle_reminders r set scope = v.scope from public.vehicles v where v.id = r.vehicle_id and r.scope <> v.scope;

-- 2) veículo novo vai para a Casa; registro e lembrete herdam o escopo do veículo
create function public.vehicle_force_casa() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.household_of(coalesce(new.owner_id, auth.uid())) is not null then new.scope := 'casa'; end if;
  return new;
end $$;
create trigger a_force_casa before insert or update of scope on public.vehicles
  for each row execute function public.vehicle_force_casa();

create function public.vehicle_child_scope() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select v.scope into new.scope from public.vehicles v where v.id = new.vehicle_id;
  return new;
end $$;
create trigger a_follow_vehicle before insert or update of scope, vehicle_id on public.vehicle_logs
  for each row execute function public.vehicle_child_scope();
create trigger a_follow_vehicle before insert or update of scope, vehicle_id on public.vehicle_reminders
  for each row execute function public.vehicle_child_scope();
revoke execute on function public.vehicle_force_casa() from public, anon, authenticated;
revoke execute on function public.vehicle_child_scope() from public, anon, authenticated;

-- 3) abastecimento ligado à nota do posto
alter table public.vehicle_logs add column nfce_id uuid references public.nfce_scans (id) on delete set null;
create unique index vehicle_logs_nfce_uniq on public.vehicle_logs (nfce_id) where nfce_id is not null;

-- 4) km do abastecimento passa a ser opcional (a nota do posto entra direto; o km melhora o cálculo de consumo)
alter table public.vehicle_logs drop constraint vehicle_logs_check;
alter table public.vehicle_logs add constraint vehicle_logs_check check (kind <> 'abastecimento' or liters is not null);

-- 5) nota de posto de veículo de terceiro: lança só a despesa e não fica pedindo para registrar abastecimento
alter table public.nfce_scans add column fuel_third_party boolean not null default false;
