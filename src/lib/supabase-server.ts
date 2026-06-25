// Supabase clients for server-side use only.
// MUST NOT be imported from "use client" components — uses next/headers.

import { createServerClient as supaCreateServer, type CookieOptions } from "@supabase/ssr";
import { createClient as supaCreateClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Server client that respects RLS via the user's session cookies. */
export function createServerClient() {
  const cookieStore = cookies();
  return supaCreateServer(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Components can't set cookies; harmless to swallow here.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // see above
        }
      },
    },
  });
}

/** Service-role client for backend-only operations — bypasses RLS. */
export function createServiceClient() {
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing — required for service-role operations.");
  }
  return supaCreateClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
