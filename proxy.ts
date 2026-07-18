import { NextResponse, type NextRequest } from "next/server";

import { timingSafeEqualString } from "./lib/mcp-auth";

// Gates the dashboard page ("/") behind the same static key MCP_BEARER_KEY already
// protects "/mcp" with -- a single shared "only me" secret, matching valorant-mcp's
// deliberately minimal deployment model, plus the one thing that model doesn't need
// (a public page rendering the same sensitive data as the MCP tool). No OAuth, no
// third-party auth service. "/mcp" is not matched here -- its own route handler
// already checks the Authorization header itself (see app/mcp/route.ts).
//
// Visit once with ?key=YOUR_KEY; on success a cookie is set so future visits don't
// need the query param. Fails closed: if MCP_BEARER_KEY is unset, every request is
// rejected rather than left open.

// No `runtime` export here -- Proxy defaults to (and in Next.js 16 requires) the
// Node.js runtime; explicitly setting `runtime` in a Proxy file is an error.

export const config = {
  matcher: ["/"],
};

const COOKIE_NAME = "sf_auth";

export function proxy(req: NextRequest) {
  const expected = process.env.MCP_BEARER_KEY;
  if (!expected) {
    return new NextResponse("Server is not configured with an access key.", { status: 500 });
  }

  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
  if (cookieValue && timingSafeEqualString(cookieValue, expected)) {
    return NextResponse.next();
  }

  const queryKey = req.nextUrl.searchParams.get("key");
  if (queryKey && timingSafeEqualString(queryKey, expected)) {
    const cleanUrl = req.nextUrl.clone();
    cleanUrl.searchParams.delete("key");
    const res = NextResponse.redirect(cleanUrl);
    res.cookies.set(COOKIE_NAME, expected, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  return new NextResponse("Unauthorized. Add ?key=YOUR_KEY to the URL once to authenticate.", {
    status: 401,
  });
}
