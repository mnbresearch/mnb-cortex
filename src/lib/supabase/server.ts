import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { envKey } from "@/lib/env";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options));
          } catch { /* called from a Server Component */ }
        },
      },
    }
  );
}

export function hasSupabase() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // envKey() rejects the "[SENSITIVE]" placeholder that `vercel env pull`
  // writes, so a placeholder degrades to the migration-safe "not configured"
  // path instead of a client that 401s on every call.
  if (!url || !envKey("SUPABASE_SERVICE_ROLE_KEY")) return null;
  return createRawClient(url, key!, { auth: { persistSession: false } });
}

/**
 * True when a real service-role key is configured. Used by the health check so
 * a placeholder is reported as "not configured" rather than silently green.
 */
export function hasServiceRole(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && envKey("SUPABASE_SERVICE_ROLE_KEY"));
}
