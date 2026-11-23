-- Additive migration: creates a separate shared Low Wire register; existing data is untouched.
create table if not exists public.low_wire_poles (
  id uuid primary key default gen_random_uuid(),
  exchange text not null,
  dp text not null default '',
  cp text not null default '',
  a1024_number text not null default '',
  wire_type text not null default 'AC' check (wire_type in ('AC','DW')),
  wire_count integer not null default 1 check (wire_count >= 1),
  height_m double precision not null check (height_m > 0),
  grid_reference text not null,
  latitude double precision not null,
  longitude double precision not null,
  status text not null default 'Reported' check (status in ('Fixed','In Progress','Reported')),
  notes text not null default '',
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists low_wire_poles_created_idx on public.low_wire_poles(created_at desc);
