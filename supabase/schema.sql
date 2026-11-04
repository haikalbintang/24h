-- Day Labels Supabase Schema for Issue #24
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

