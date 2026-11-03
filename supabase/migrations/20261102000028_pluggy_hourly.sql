-- Open Finance de hora em hora: a rotina chama a Edge Function `pluggy` com o segredo da rotina (Vault),
-- que sincroniza as conexões de todo mundo e roda as regras de transferência, categoria, conciliação e contas fixas.
select cron.schedule('arvia-open-finance-hora', '7 * * * *', $cron$
  select net.http_post(
    url := 'https://nkahgnijpohafstaxtld.supabase.co/functions/v1/pluggy',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    body := '{"action":"sync_all"}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
