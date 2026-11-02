-- Notificações: configuração lida pela Edge Function `push` (só service_role) e rotina diária às 8h20 (Brasília).
-- As chaves VAPID e o segredo da rotina ficam no Vault (push_vapid_private, push_vapid_public, push_cron_secret).

create function public.push_config() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_object_agg(name, decrypted_secret) from vault.decrypted_secrets
  where name in ('push_vapid_private', 'push_vapid_public', 'push_cron_secret');
$$;
revoke execute on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

grant execute on function public.pending_push_alerts() to service_role;

create function public.mark_alerts_sent(p_owner uuid, p_keys text[]) returns void
language sql security definer set search_path = ''
as $$
  insert into public.alert_log (owner_id, key) select p_owner, k from unnest(p_keys) k on conflict do nothing;
  delete from public.alert_log where sent_at < now() - interval '120 days';
$$;
revoke execute on function public.mark_alerts_sent(uuid, text[]) from public, anon, authenticated;
grant execute on function public.mark_alerts_sent(uuid, text[]) to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule('arvia-avisos-diarios', '20 11 * * *', $cron$
  select net.http_post(
    url := 'https://nkahgnijpohafstaxtld.supabase.co/functions/v1/push',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    body := '{"action":"daily"}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);
