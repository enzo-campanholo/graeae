// The setup secret: the value the deployer sets, which makes a browser the owner's
// device. It is the owner's way in on a fresh instance and the way back in after losing
// every device.

import { hash } from "./people.ts";

/** Shorter than this, the setup secret could be guessed, so setup is refused entirely. */
export const SETUP_SECRET_MIN_LENGTH = 32;

/** The secrets besides the setup secret that a working instance needs. */
const OTHER_SECRETS = ["SFU_APP_ID", "SFU_APP_SECRET", "TURN_KEY_ID", "TURN_KEY_TOKEN"] as const;

/** Whether `offered` is the instance's setup secret, and setup is allowed at all. */
export async function isSetupSecret(env: Env, offered: unknown): Promise<boolean> {
  const secret = configured(env, "SETUP_SECRET");
  if (secret === null || secret.length < SETUP_SECRET_MIN_LENGTH) return false;
  if (typeof offered !== "string") return false;
  // Compared as hashes, so the comparison takes the same time whatever was offered.
  const encoder = new TextEncoder();
  const [want, got] = await Promise.all([hash(secret), hash(offered)]);
  return crypto.subtle.timingSafeEqual(encoder.encode(want), encoder.encode(got));
}

/** The other secrets the deploy left unset, named for someone who holds the setup secret. */
export function missingSecrets(env: Env): string[] {
  return OTHER_SECRETS.filter((name) => configured(env, name) === null);
}

function configured(env: Env, name: keyof Env): string | null {
  const value = env[name];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
