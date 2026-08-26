import "server-only";

/**
 * Who operates the platform. SERVER ONLY — and the `server-only` import above
 * is the whole point of this file existing.
 *
 * These used to live in config.ts, which has no such guard and is imported by
 * six "use client" components. Next replaces a non-NEXT_PUBLIC_ `process.env.X`
 * with `undefined` in client code, so what actually shipped was the literal
 * fallback string — and grepping .next/static confirmed it: the super-admin
 * addresses were present in four public JavaScript chunks. Anyone could view
 * source and learn the exact two accounts that own every workspace on the
 * platform, which is the first thing you would want before phishing someone.
 *
 * Nothing here is a secret in the cryptographic sense; knowing the address does
 * not grant access. But it hands an attacker the target list for free, and a
 * super-admin account is the one credential that unlocks every customer's data.
 * Importing this from a client component now fails the build instead.
 */

/** Where operator notifications (leads, access requests) are sent. */
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "mnbgotyou@gmail.com";

/**
 * PLATFORM super-admins — a level ABOVE org "owner".
 * Org roles (viewer→analyst→manager→admin→owner) are scoped to a single
 * workspace. A super-admin operates the whole platform: sees every
 * organization, grants access, and can export the entire database.
 * Override with SUPER_ADMIN_EMAILS="a@x.com,b@y.com".
 */
export const SUPER_ADMINS: string[] = (process.env.SUPER_ADMIN_EMAILS || "mridulnanda2004@gmail.com,mnbgotyou@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
