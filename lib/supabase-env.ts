// Public Supabase project settings. The publishable key is designed to ship to the browser;
// these are NOT credentials (unlike SIMPLEFIN_ACCESS_URL). Read lazily so a build without
// them still succeeds and only the OAuth paths fail.
export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  return url.replace(/\/$/, "");
}

export function supabasePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");
  return key;
}
