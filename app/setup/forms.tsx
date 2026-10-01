"use client";

import { useActionState } from "react";

import { ConnectTabs } from "@/app/_components/ConnectTabs";

import { claimSetupToken, signInAction, type SetupState } from "./actions";

export function PasswordForm() {
  const [state, run, pending] = useActionState<SetupState, FormData>(
    signInAction,
    {},
  );
  return (
    <form action={run} className="field">
      <input
        name="password"
        type="password"
        placeholder="Owner password"
        aria-label="Owner password"
        autoComplete="current-password"
        required
      />
      <button className="button dark" disabled={pending}>
        Unlock
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}

export function TokenForm() {
  const [state, run, pending] = useActionState<SetupState, FormData>(
    claimSetupToken,
    {},
  );
  if (state.url) {
    return (
      <>
        <p>
          Here&apos;s your connector URL. It&apos;s shown once and works like a
          password.
        </p>
        <ConnectTabs url={state.url} />
      </>
    );
  }
  return (
    <form action={run} className="field">
      <textarea
        name="token"
        rows={4}
        placeholder="Paste your SimpleFIN setup token"
        aria-label="SimpleFIN setup token"
        required
      />
      <button className="button dark" disabled={pending}>
        {pending ? "Connecting…" : "Get connector URL"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
