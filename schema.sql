-- ROOTED IN 40 — SUPABASE SCHEMA
-- Run this in: Supabase Dashboard → your project → SQL Editor → New query
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. PROFILES ───────────────────────────────────────────────────────────────
-- One row per user (client or admin). Created automatically on sign-up via trigger.

create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text,
  whatsapp    text,
  is_admin    boolean not null default false,
  day_started date,
  photo_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Auto-create profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper: is the current user an admin? (security definer avoids RLS loop)
create or replace function public.is_admin()
returns boolean
language sql security definer stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Policies
create policy "Users manage own profile"
  on public.profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Admins read all profiles"
  on public.profiles for select
  using (public.is_admin());

-- ── 2. FORM ANSWERS ───────────────────────────────────────────────────────────
-- One row per (user, field_id). Covers all workbook textarea/text inputs.

create table if not exists public.form_answers (
  user_id    uuid not null references auth.users on delete cascade,
  field_id   text not null,
  value      text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, field_id)
);

alter table public.form_answers enable row level security;

create policy "Users manage own answers"
  on public.form_answers for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Admins read all answers"
  on public.form_answers for select
  using (public.is_admin());

-- ── 3. DAILY CHECK-INS ────────────────────────────────────────────────────────
-- One row per (user, date). anchor_data is { "1": "1", "2": "0", ... }

create table if not exists public.daily_checkins (
  user_id     uuid not null references auth.users on delete cascade,
  date        date not null,
  anchor_data jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.daily_checkins enable row level security;

create policy "Users manage own checkins"
  on public.daily_checkins for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Admins read all checkins"
  on public.daily_checkins for select
  using (public.is_admin());

-- ── 4. WAITLIST ───────────────────────────────────────────────────────────────

create table if not exists public.waitlist (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  whatsapp     text not null,
  submitted_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Public insert (form on free page, no auth required)
create policy "Public can join waitlist"
  on public.waitlist for insert
  with check (true);

create policy "Admins read waitlist"
  on public.waitlist for select
  using (public.is_admin());

-- ── 5. REVIEWS ────────────────────────────────────────────────────────────────

create table if not exists public.reviews (
  user_id      uuid primary key references auth.users on delete cascade,
  rating       smallint check (rating between 1 and 5),
  recommend    text,
  changed_text text,
  proud_text   text,
  submitted_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

create policy "Users manage own review"
  on public.reviews for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Admins read all reviews"
  on public.reviews for select
  using (public.is_admin());

-- ── 6. STORAGE ────────────────────────────────────────────────────────────────
-- Run these in Supabase Dashboard → Storage → Policies
-- OR execute via the SQL editor if your Supabase version supports it.
--
-- Create bucket: "client-photos"  (public: false, 5 MB limit)
--
-- Storage policies:
--   INSERT: (storage.foldername(name))[1] = auth.uid()::text
--   SELECT: public.is_admin() OR (storage.foldername(name))[1] = auth.uid()::text
--   DELETE: (storage.foldername(name))[1] = auth.uid()::text

-- ── 7. GRANT SHADEY ADMIN RIGHTS ──────────────────────────────────────────────
-- After Shadey creates her account via the app, run this (replace the email):
--
--   update public.profiles
--   set is_admin = true
--   where id = (select id from auth.users where email = 'shadeybahali@gmail.com');
