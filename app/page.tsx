"use client";

import { useActionState } from "react";

import { claimSetupToken, type SetupState } from "./actions";

export default function Home() {
  const [state, action, pending] = useActionState<SetupState, FormData>(claimSetupToken, {});

  return (
    <main>
      <h1>Connect SimpleFin to an AI assistant</h1>
      {state.url ? (
        <>
          <p>
            Add this as a custom connector (MCP server URL) in Claude, ChatGPT, or any MCP client. It is
            shown <strong>once</strong> — anyone with it can read your balances, so treat it like a
            password.
          </p>
          <input
            readOnly
            value={state.url}
            onFocus={(e) => e.currentTarget.select()}
           
          />
          <button
           
            onClick={() => navigator.clipboard.writeText(state.url!)}
          >
            Copy URL
          </button>
        </>
      ) : (
        <form action={action}>
          <p>
            Create a setup token in{" "}
            <a href="https://beta-bridge.simplefin.org/" target="_blank" rel="noreferrer">
              SimpleFin Bridge
            </a>{" "}
            and paste it below. Tokens work once.
          </p>
          <textarea name="token" rows={4} required />
          <button disabled={pending}>
            {pending ? "Claiming…" : "Get connector URL"}
          </button>
          {state.error && <p className="error">{state.error}</p>}
        </form>
      )}
    </main>
  );
}
