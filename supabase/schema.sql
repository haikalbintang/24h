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


-- One-time Device handoff capabilities. A signed-in device inserts a row with
-- its current session credentials and a high-entropy token; the QR code carries
-- only that token. The second device redeems it through the RPC below, which
-- deletes the row atomically so it can be used once and only for a short time.
create table if not exists public.handoff_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  handoff_expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

alter table public.handoff_tokens enable row level security;

create policy "Users can insert own handoff_tokens"
  on public.handoff_tokens for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Redeems a handoff token without requiring a Supabase Edge Function. The
-- function is the only way for a signed-out device to read a handoff row; it
-- matches the full secret token and removes the row in the same statement.
-- If the first device refreshed its session after creating the handoff token,
-- the newer credentials in account_sessions are returned instead.
create or replace function public.consume_handoff_token(handoff_token text)
returns table (
  access_token text,
  refresh_token text,
  expires_at bigint,
  user_id uuid,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  consumed public.handoff_tokens%rowtype;
begin
  delete from public.handoff_tokens h
   where h.token = handoff_token
     and h.handoff_expires_at > now()
  returning * into consumed;

  if consumed.token is null then
    return;
  end if;

  return query
    select
      coalesce(s.access_token, consumed.access_token),
      coalesce(s.refresh_token, consumed.refresh_token),
      coalesce(s.expires_at, consumed.expires_at),
      consumed.user_id,
      consumed.email
    from (select 1) as _
    left join public.account_sessions s
      on s.user_id = consumed.user_id
     and s.expires_at > consumed.expires_at;
end;
$$;

revoke all on function public.consume_handoff_token(text) from public;
grant execute on function public.consume_handoff_token(text) to anon, authenticated;
