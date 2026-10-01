"use client";

import { useActionState } from "react";

import { claimSetupToken, type SetupState } from "./actions";

export default function SetupPage() {
  const [state, action, pending] = useActionState<SetupState, FormData>(claimSetupToken, {});

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-4">
      <h1 className="font-serif text-3xl">Connect SimpleFin to an AI assistant</h1>
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
            className="w-full rounded border px-3 py-2 font-mono text-sm"
          />
          <button
            className="self-start rounded bg-orange px-3 py-2 text-white"
            onClick={() => navigator.clipboard.writeText(state.url!)}
          >
            Copy URL
          </button>
        </>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <p>
            Create a setup token in{" "}
            <a className="underline" href="https://beta-bridge.simplefin.org/" target="_blank" rel="noreferrer">
              SimpleFin Bridge
            </a>{" "}
            and paste it below. Tokens work once.
          </p>
          <textarea name="token" rows={4} required className="rounded border px-3 py-2 font-mono text-sm" />
          <button className="self-start rounded bg-orange px-3 py-2 text-white" disabled={pending}>
            {pending ? "Claiming…" : "Get connector URL"}
          </button>
          {state.error && <p className="text-red-600">{state.error}</p>}
        </form>
      )}
    </main>
  );
}
