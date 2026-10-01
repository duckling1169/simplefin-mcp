"use client";

import { useState } from "react";

const CLIENTS = ["Claude", "ChatGPT", "Cursor"] as const;
type Client = (typeof CLIENTS)[number];

/** Where to paste a connector URL in each client. */
export function ConnectTabs({ url }: { url: string }) {
  const [client, setClient] = useState<Client>("Claude");
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <input
        className="url"
        readOnly
        value={url}
        aria-label="Connector URL"
        onFocus={(e) => e.currentTarget.select()}
      />
      <p style={{ margin: "12px 0 0" }}>
        <button
          type="button"
          className="button dark"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy URL"}
        </button>
      </p>

      <div className="tabs" role="tablist" aria-label="Add it to">
        {CLIENTS.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            className="pill"
            aria-selected={client === c}
            onClick={() => setClient(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {client === "Claude" && (
          <p>
            In Claude, open{" "}
            <strong>Settings → Connectors → Add custom connector</strong>. Name
            it SimpleFIN and paste the URL.
          </p>
        )}
        {client === "ChatGPT" && (
          <p>
            In ChatGPT, open{" "}
            <strong>
              Settings → Apps &amp; Connectors → Advanced settings
            </strong>
            , turn on Developer mode, then <strong>Create</strong>. Paste the
            URL and choose no authentication.
          </p>
        )}
        {client === "Cursor" && (
          <>
            <p>
              Add this to <code>~/.cursor/mcp.json</code>:
            </p>
            <pre>
              {JSON.stringify({ mcpServers: { simplefin: { url } } }, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
