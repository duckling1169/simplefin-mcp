import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "./supabase-env";

export function createBrowserSupabaseClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}

/** Redirects to /login?next=<nextPath> when there's no session; returns whether one exists. */
export async function ensureSession(nextPath: string): Promise<boolean> {
  const { data } = await createBrowserSupabaseClient().auth.getSession();
  if (data.session) return true;
  window.location.href = `/login?next=${encodeURIComponent(nextPath)}`;
  return false;
}
