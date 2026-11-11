-- AI COMIC – schemat Supabase, wersja DARMOWA (limity dzienne, bez płatności). NIEPRZETESTOWANY.
create table profiles(
  user_id uuid primary key references auth.users on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now());
create table usage_daily(
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  text_used int not null default 0, image_used int not null default 0,
  primary key (user_id, day));
create table usage_log(
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null, idempotency_key text unique,
  created_at timestamptz not null default now());
create index on usage_log(user_id, kind, created_at desc);
create table image_cache(key text primary key, url text not null, created_at timestamptz not null default now());
create table spend_daily(day date primary key default current_date, usd numeric(10,4) not null default 0, images int not null default 0);

alter table profiles enable row level security;
alter table usage_daily enable row level security;
alter table usage_log enable row level security;
alter table image_cache enable row level security;
alter table spend_daily enable row level security;
create policy "own profile" on profiles for select using (auth.uid() = user_id);
create policy "own usage" on usage_daily for select using (auth.uid() = user_id);
-- zapis tylko przez service role (serwer)

create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(user_id) values (new.id); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Atomowy dzienny limit. Ten sam klucz = brak podwójnego naliczenia. p_type: 'text' | 'image'.
create function use_quota(p_user uuid, p_type text, p_key text, p_limit int) returns boolean
language plpgsql security definer set search_path=public as $$
declare n int;
begin
  insert into usage_log(user_id,kind,idempotency_key) values (p_user,p_type,p_key) on conflict (idempotency_key) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return true; end if;
  insert into usage_daily(user_id) values (p_user) on conflict do nothing;
  if p_type = 'image' then
    update usage_daily set image_used = image_used + 1 where user_id=p_user and day=current_date and image_used < p_limit;
  else
    update usage_daily set text_used = text_used + 1 where user_id=p_user and day=current_date and text_used < p_limit;
  end if;
  if not found then delete from usage_log where idempotency_key = p_key; return false; end if;
  return true;
end $$;

create function refund_quota(p_user uuid, p_type text, p_key text) returns void
language plpgsql security definer set search_path=public as $$
declare n int;
begin
  insert into usage_log(user_id,kind,idempotency_key) values (p_user,p_type||'_refund',p_key||':refund') on conflict (idempotency_key) do nothing;
  get diagnostics n = row_count;
  if n = 1 then
    if p_type='image' then update usage_daily set image_used = greatest(image_used-1,0) where user_id=p_user and day=current_date;
    else update usage_daily set text_used = greatest(text_used-1,0) where user_id=p_user and day=current_date; end if;
  end if;
end $$;

create function add_spend(p_usd numeric) returns void language sql security definer set search_path=public as $$
  insert into spend_daily(day,usd,images) values (current_date,p_usd,1)
  on conflict (day) do update set usd = spend_daily.usd + p_usd, images = spend_daily.images + 1 $$;

revoke execute on all functions in schema public from public, anon, authenticated;

-- Zapis historii (każdy widzi tylko swoje)
create table stories(id uuid primary key, user_id uuid not null references auth.users on delete cascade, data jsonb not null, updated_at timestamptz not null default now());
alter table stories enable row level security;
create policy "own stories" on stories for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
