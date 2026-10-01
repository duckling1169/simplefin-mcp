alter table public.connections add column label text;
comment on column public.connections.label is 'Institution names, recorded at claim time for the owner''s connection list. Not secret.';
