// POST /api/marketing/refresh-customers
// Pulls every ServiceTitan customer + location address, normalizes to match keys,
// and replaces the cached customer-key table.

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { listCustomerAddresses } from "@/lib/servicetitan";
import { addressKey } from "@/lib/address";
import { replaceCustomerKeys, getMeta } from "@/lib/marketing-db";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const records = await listCustomerAddresses();
    const keyed = records
      .map((r) => ({ addr_key: addressKey(r.street, r.zip), source: r.source }))
      .filter((r) => r.addr_key);
    const count = await replaceCustomerKeys(keyed);
    const meta = await getMeta();
    return NextResponse.json({ count, ...meta });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
