-- Day Labels Supabase Schema
-- Run this in the Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/<your-project-id>/sql/new)

create table if not exists public.account_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version integer not null default 1,
  shared jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.account_states enable row level security;

-- RLS policies: Users can only select, insert, or update their own row
create policy "Users can read own account_states"
  on public.account_states for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own account_states"
  on public.account_states for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own account_states"
  on public.account_states for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- Coordinates rotated session credentials across devices linked to one Account
-- (for example after a Device handoff). Refresh tokens rotate, so the device
-- that refreshed publishes the new credentials here; devices that are near
-- expiry adopt them instead of rotating the shared refresh token again.
create table if not exists public.account_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.account_sessions enable row level security;

create policy "Users can read own account_sessions"
  on public.account_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own account_sessions"
  on public.account_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own account_sessions"
  on public.account_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
