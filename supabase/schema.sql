-- Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;
create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(), name text not null,
 source_filename text, created_at timestamptz not null default now()
);
create table if not exists public.poles (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 pole_ref text not null default '', grid_reference text not null default '',
 latitude double precision not null, longitude double precision not null,
 status text not null default 'Outstanding' check(status in ('Outstanding','Completed','Problem')),
 notes text not null default '', data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists poles_project_id_idx on public.poles(project_id);
create index if not exists poles_grid_reference_idx on public.poles(grid_reference);
-- The browser anon role gets no table privileges. The Edge Function uses the
-- service-role key only on the server after validating the signed shared session.
alter table public.projects enable row level security;
alter table public.poles enable row level security;
revoke all on public.projects, public.poles from anon, authenticated;
