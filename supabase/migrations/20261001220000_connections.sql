create table public.connections (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  access_url_ciphertext text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.connections enable row level security;
-- No policies: only the server's service-role client may read or write.
comment on table public.connections is 'One row per claimed SimpleFin setup token. access_url is AES-GCM encrypted with a key derived from the connection key, which is never stored (only its SHA-256).';
