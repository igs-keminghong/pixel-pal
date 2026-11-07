-- =====================================================================
-- 像素行程夥伴 Pixel Pal — Supabase 資料庫結構
-- 用法：Supabase 後台 → SQL Editor → New query → 貼上全部 → Run
-- 可重複執行（已存在的物件會先移除再建立；資料表內既有資料不會被刪）
-- =====================================================================

-- ---------- 1. 使用者資料 ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '新朋友',
  friend_code  text not null unique,
  pet          text not null default 'shiba' check (pet in ('shiba','beagle','parrot','obsidian')),
  pet_name     text not null default '小柴' check (char_length(pet_name) <= 12),
  remind_time  time not null default '21:00',
  timezone     text not null default 'Asia/Taipei',
  created_at   timestamptz not null default now()
);

-- 產生不重複的好友碼，例如 PXL-4821
create or replace function public.gen_friend_code()
returns text
language plpgsql
set search_path = public
as $$
declare c text;
begin
  loop
    c := 'PXL-' || lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when not exists (select 1 from public.profiles where friend_code = c);
  end loop;
  return c;
end
$$;

-- 新使用者第一次登入時，自動建立 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, friend_code)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1), '新朋友'),
    public.gen_friend_code()
  )
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 既有資料庫：放寬吉祥物種類（新增黑曜）
alter table public.profiles drop constraint if exists profiles_pet_check;
alter table public.profiles add constraint profiles_pet_check check (pet in ('shiba','beagle','parrot','obsidian'));

-- ---------- 2. 好友關係（雙向各存一筆） ----------
create table if not exists public.friendships (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  friend_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create or replace function public.is_friend(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.friendships where user_id = a and friend_id = b);
$$;

-- 用好友碼加好友（直接成為雙向好友）
create or replace function public.add_friend(code text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  target public.profiles;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select * into target from public.profiles where friend_code = upper(trim(code));
  if not found then
    raise exception 'friend code not found';
  end if;
  if target.id = me then
    raise exception 'cannot add yourself';
  end if;
  insert into public.friendships (user_id, friend_id)
  values (me, target.id), (target.id, me)
  on conflict do nothing;
  return target;
end
$$;

-- 刪除好友（雙向一起刪）
create or replace function public.remove_friend(fid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.friendships
  where (user_id = auth.uid() and friend_id = fid)
     or (user_id = fid and friend_id = auth.uid());
$$;

-- ---------- 3. 訊息（文字 / 圖片 / 戳一下） ----------
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('text','image','poke')),
  body        text check (char_length(body) <= 1000),
  image_path  text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists messages_pair_idx     on public.messages (sender_id, receiver_id, created_at desc);
create index if not exists messages_receiver_idx on public.messages (receiver_id, created_at desc);

-- ---------- 4. 行程快取（給每晚推播用） ----------
create table if not exists public.events (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  google_id  text not null,
  starts_at  timestamptz not null,
  title      text not null,
  location   text,
  all_day    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, google_id)
);
create index if not exists events_start_idx on public.events (user_id, starts_at);

-- ---------- 5. 推播訂閱 ----------
create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 權限（Row Level Security）：每個人只能看到自己和好友的資料
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.friendships        enable row level security;
alter table public.messages           enable row level security;
alter table public.events             enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles：自己和好友看得到；只能改自己，而且好友碼不能改
drop policy if exists "profiles read self and friends" on public.profiles;
create policy "profiles read self and friends" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_friend(auth.uid(), id));

drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, pet, pet_name, remind_time, timezone) on public.profiles to authenticated;

-- friendships：只看得到自己的；新增與刪除只能透過上面的函式
drop policy if exists "friendships read own" on public.friendships;
create policy "friendships read own" on public.friendships
  for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.friendships from anon, authenticated;

-- messages：寄件者或收件者看得到；只能寄給好友；收件者只能標記已讀
drop policy if exists "messages read own" on public.messages;
create policy "messages read own" on public.messages
  for select to authenticated
  using (auth.uid() in (sender_id, receiver_id));

drop policy if exists "messages send to friends" on public.messages;
create policy "messages send to friends" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_friend(sender_id, receiver_id));

drop policy if exists "messages mark read" on public.messages;
create policy "messages mark read" on public.messages
  for update to authenticated
  using (receiver_id = auth.uid()) with check (receiver_id = auth.uid());

revoke update, delete on public.messages from anon, authenticated;
grant update (read_at) on public.messages to authenticated;

-- events / push_subscriptions：只管得到自己的
drop policy if exists "events own" on public.events;
create policy "events own" on public.events
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 明確授權（建立專案時沒勾「Automatically expose new tables」也能正常運作）
grant usage on schema public to anon, authenticated;
grant select                         on public.profiles           to authenticated;
grant select                         on public.friendships        to authenticated;
grant select, insert                 on public.messages           to authenticated;
grant select, insert, update, delete on public.events             to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant execute on function public.is_friend(uuid, uuid) to authenticated;

-- 後端（每晚推播程式）用 service_role 讀寫，也要明確授權
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 函式只給登入的人用
revoke execute on function public.add_friend(text)    from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
grant  execute on function public.add_friend(text)    to authenticated;
grant  execute on function public.remove_friend(uuid) to authenticated;

-- =====================================================================
-- 6. 聊天圖片儲存區（私人；路徑 = 寄件者id/收件者id/檔名）
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "chat images upload to friend" on storage.objects;
create policy "chat images upload to friend" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.friendships f
      where f.user_id = auth.uid() and f.friend_id::text = (storage.foldername(name))[2]
    )
  );

drop policy if exists "chat images read sender or receiver" on storage.objects;
create policy "chat images read sender or receiver" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-images'
    and auth.uid()::text in ((storage.foldername(name))[1], (storage.foldername(name))[2])
  );

-- =====================================================================
-- 7. 即時訊息（新訊息會立刻推到對方畫面）
-- =====================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
