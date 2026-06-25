"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";

export default function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  async function signOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button onClick={signOut} className={className}>
      Sign out →
    </button>
  );
}
