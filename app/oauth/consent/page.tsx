"use client";

import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { createBrowserSupabaseClient, ensureSession } from "../../../lib/supabase-browser";

type Status = "loading" | "ready" | "error";

// Supabase's OAuth 2.1 server sends the user here (the project's "authorization path") to
// approve or deny an MCP client's request.
export default function ConsentPage() {
  const [authorizationId, setAuthorizationId] = useState<string | null>(null);
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    async function load() {
      const id = new URLSearchParams(window.location.search).get("authorization_id");
      if (!id) return setStatus("error");
      setAuthorizationId(id);

      if (!(await ensureSession(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`))) return;

      const { data, error } = await createBrowserSupabaseClient().auth.oauth.getAuthorizationDetails(id);
      if (error) return setStatus("error");
      if ("redirect_url" in data) {
        window.location.href = data.redirect_url;
        return;
      }
      setDetails(data);
      setStatus("ready");
    }
    void load();
  }, []);

  async function respond(approve: boolean) {
    if (!authorizationId) return;
    const oauth = createBrowserSupabaseClient().auth.oauth;
    const { error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) setStatus("error");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-4">
      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p>Something went wrong. Close this tab and try again.</p>}
      {status === "ready" && (
        <>
          <p>
            <strong>{details?.client.name}</strong> wants read access to your SimpleFin balances.
          </p>
          <div className="flex gap-3">
            <button className="rounded bg-orange px-3 py-2 text-white" onClick={() => respond(true)}>
              Approve
            </button>
            <button className="rounded border px-3 py-2" onClick={() => respond(false)}>
              Deny
            </button>
          </div>
        </>
      )}
    </main>
  );
}
