-- Additive migration: creates a separate shared register; existing project/pole tables are untouched.
create table if not exists public.near_water_poles (
  id uuid primary key default gen_random_uuid(),
  exchange text not null,
  dp text not null default '',
  cp text not null default '',
  year text not null default '',
  grid_reference text not null,
  latitude double precision not null,
  longitude double precision not null,
  tested boolean not null default false,
  notes text not null default '',
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists near_water_poles_created_idx on public.near_water_poles(created_at desc);
