import { neon } from "@neondatabase/serverless";

// Neon Postgres over HTTP. The schema is applied on first use, so a fresh deployment
// needs no migration step.

const SCHEMA = [
  `create table if not exists connections (
    key_hash               text primary key,
    access_url_ciphertext  text not null,
    label                  text,
    created_at             timestamptz not null default now(),
    last_used_at           timestamptz
  )`,
  `create table if not exists snapshots (
    key_hash    text primary key references connections (key_hash) on delete cascade,
    ciphertext  text not null,
    fetched_at  timestamptz not null default now()
  )`,
];

let ready: Promise<void> | undefined;

/** The query function, after making sure the schema exists. */
export async function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const q = neon(url);
  ready ??= (async () => {
    for (const statement of SCHEMA) await q.query(statement);
  })().catch((error) => {
    ready = undefined;
    throw error;
  });
  await ready;
  return q;
}
