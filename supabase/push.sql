-- =====================================================================
-- 像素行程夥伴 — 每晚推播（在 schema.sql 之後執行，可重複執行）
-- 把 __CRON_SECRET__ 換成 secrets/push-secrets.txt 裡的值再執行
-- =====================================================================
alter table public.profiles add column if not exists last_reminded_on date;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 每 15 分鐘叫一次 nightly-reminder，由它判斷誰的提醒時間到了
do $$
begin
  if exists (select 1 from cron.job where jobname = 'nightly-reminder') then
    perform cron.unschedule('nightly-reminder');
  end if;
end
$$;

select cron.schedule(
  'nightly-reminder',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://oqdizogpzqqxxlbfymfk.supabase.co/functions/v1/nightly-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '__CRON_SECRET__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);
