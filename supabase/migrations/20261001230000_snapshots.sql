create table public.snapshots (
  key_hash text primary key references public.connections (key_hash) on delete cascade,
  ciphertext text not null,
  fetched_at timestamptz not null default now()
);
alter table public.snapshots enable row level security;
comment on table public.snapshots is 'Cached SimpleFin account set per connection (last 90 days), encrypted like connections.access_url_ciphertext. Keeps usage under SimpleFin Bridge''s ~24 requests/day.';
