// Supabase client for the browser (client components).

import { createBrowserClient as supaCreateBrowser } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createBrowserClient() {
  return supaCreateBrowser(url, anonKey);
}
