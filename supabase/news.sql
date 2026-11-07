-- =====================================================================
-- 像素行程夥伴 — 發新版推播（只需建立一次；可重複執行）
-- 把 __CRON_SECRET__ 換成 secrets/push-secrets.txt 裡的值再執行
-- 之後每次發新版只要在 SQL Editor 執行：
--   select public.send_news('有新版本囉！貓咪「捨令」加入了，快來看看～');
-- 訊息裡的 {name} 會換成每個人自己的夥伴名字
-- =====================================================================
create or replace function public.send_news(msg text, title text default null)
returns bigint
language sql
security definer
set search_path = public, extensions
as $$
  select net.http_post(
    url := 'https://oqdizogpzqqxxlbfymfk.supabase.co/functions/v1/nightly-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '__CRON_SECRET__'),
    body := jsonb_build_object('broadcast', jsonb_strip_nulls(jsonb_build_object('body', msg, 'title', title))),
    timeout_milliseconds := 60000
  );
$$;

-- 只有後台（SQL Editor）能呼叫，App 使用者不能
revoke execute on function public.send_news(text, text) from public, anon, authenticated;
