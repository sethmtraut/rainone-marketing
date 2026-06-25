// GET /api/marketing/runs — list past runs + customer-cache status.

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { listRuns, getMeta } from "@/lib/marketing-db";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [runs, meta] = await Promise.all([listRuns(), getMeta()]);
    return NextResponse.json({ runs, meta });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
