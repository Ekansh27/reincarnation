-- Reincarnation — Supabase schema.
-- Run this in your Supabase project's SQL editor.
-- The server uses the service_role key (bypasses RLS), so no policies are needed.

create table if not exists commentators (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  sport           text not null,
  xtrace_group_id text,
  created_at      timestamptz default now()
);

create table if not exists iconic_moments (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text unique not null,
  title                text not null,
  year                 int not null,
  original_commentator text not null,
  original_line        text not null,
  context              text not null,
  created_at           timestamptz default now()
);

create table if not exists generated_clips (
  id                 uuid primary key default gen_random_uuid(),
  user_handle        text not null,
  query              text not null,
  target_commentator text not null,
  matched_moment     text,
  script_text        text not null,
  created_at         timestamptz default now()
);

-- Enable RLS with no policies: the public anon key gets zero access, while the
-- server's service_role/secret key bypasses RLS and retains full access.
alter table commentators    enable row level security;
alter table iconic_moments  enable row level security;
alter table generated_clips enable row level security;
