"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  createConnection,
  revokeConnection,
  SetupTokenError,
} from "@/lib/connections";
import { isOwner, passwordMatches, signIn } from "@/lib/owner";

export type SetupState = { url?: string; error?: string };

export async function signInAction(
  _prev: SetupState,
  form: FormData,
): Promise<SetupState> {
  if (!passwordMatches(String(form.get("password") ?? ""))) {
    return { error: "That password doesn't match OWNER_PASSWORD." };
  }
  await signIn();
  revalidatePath("/setup");
  return {};
}

export async function claimSetupToken(
  _prev: SetupState,
  form: FormData,
): Promise<SetupState> {
  if (!(await isOwner())) return { error: "Sign in again." };
  const token = String(form.get("token") ?? "").trim();
  if (!token) return { error: "Paste a setup token." };
  try {
    const key = await createConnection(token);
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    revalidatePath("/setup");
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

export async function revokeAction(form: FormData) {
  if (!(await isOwner())) return;
  await revokeConnection(String(form.get("keyHash")));
  revalidatePath("/setup");
}
