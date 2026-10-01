"use server";

import { headers } from "next/headers";

import { createConnection, SetupTokenError } from "@/lib/connections";

export type SetupState = { url?: string; error?: string };

export async function claimSetupToken(
  _prev: SetupState,
  form: FormData,
): Promise<SetupState> {
  const token = String(form.get("token") ?? "").trim();
  if (!token) return { error: "Paste a setup token." };
  try {
    const key = await createConnection(token);
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    return { url: `${origin}/mcp?key=${key}` };
  } catch (error) {
    // Never echo the token or SimpleFin's response body.
    return {
      error:
        error instanceof SetupTokenError
          ? error.message
          : "Something went wrong. Try again.",
    };
  }
}
