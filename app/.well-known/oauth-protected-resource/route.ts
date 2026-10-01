import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

import { supabaseUrl } from "../../../lib/supabase-env";

// RFC 9728 -- tells an MCP client that Supabase's OAuth 2.1 server is this resource's
// authorization server. That's what makes claude.ai prompt for sign-in.
export function GET(req: Request) {
  return protectedResourceHandler({ authServerUrls: [`${supabaseUrl()}/auth/v1`] })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
