import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "../../../lib/supabase-server";

// Exchanges the magic-link code for a session, then returns to `next` (e.g. /oauth/consent).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=auth_callback", url.origin));
}
