"use client";

import { useState, type FormEvent } from "react";

import { createBrowserSupabaseClient } from "../../lib/supabase-browser";

type Status = "idle" | "sending" | "code" | "verifying" | "send-error" | "verify-error";

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`;
    const { error } = await createBrowserSupabaseClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });
    setStatus(error ? "send-error" : "code");
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("verifying");
    const { error } = await createBrowserSupabaseClient().auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setStatus("verify-error");
      return;
    }
    window.location.href = nextPath();
  }

  const awaitingCode = status === "code" || status === "verifying" || status === "verify-error";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-4">
      <h1 className="font-serif text-3xl">Sign in to simplefin-mcp</h1>
      {awaitingCode ? (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <p>Enter the code sent to {email}, or click the link in the email.</p>
          <input
            className="rounded border px-3 py-2"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Email code"
            required
          />
          <button className="rounded bg-orange px-3 py-2 text-white" disabled={status === "verifying"}>
            {status === "verifying" ? "Verifying…" : "Verify code"}
          </button>
          {status === "verify-error" && <p className="text-red-600">That code didn&apos;t work. Try again.</p>}
          <button type="button" className="underline" onClick={() => setStatus("idle")}>
            Use a different email
          </button>
        </form>
      ) : (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <input
            className="rounded border px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          <button className="rounded bg-orange px-3 py-2 text-white" disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : "Send sign-in code"}
          </button>
          {status === "send-error" && <p className="text-red-600">Something went wrong. Try again.</p>}
        </form>
      )}
    </main>
  );
}
