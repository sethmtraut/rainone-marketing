// POST /api/marketing/run
// Body: {
//   prospects: Array<{ address, city, state, zip, status?, list_price?, beds?,
//                      baths?, sqft?, keyword_hit?, source? }>,
//   matchBehavior: 'remove' | 'flag' | 'separate',
//   remailAfterDays?: number,   // 0/undefined = never re-mail
//   label?: string
// }
//
// Dedupes within the list, removes (or flags) existing ServiceTitan customers,
// removes addresses already mailed in prior runs, stores the result as a new run,
// and returns the summary + a preview of the mailable rows.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { addressKey } from "@/lib/address";
import {
  getCustomerKeySet,
  getHistoryKeySet,
  createRun,
  type OutputRow,
} from "@/lib/marketing-db";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Prospect {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  status?: string;
  list_price?: string;
  beds?: string;
  baths?: string;
  sqft?: string;
  keyword_hit?: string;
  source?: string;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    prospects?: Prospect[];
    matchBehavior?: string;
    remailAfterDays?: number;
    label?: string;
  } | null;

  if (!body || !Array.isArray(body.prospects)) {
    return NextResponse.json({ error: "Missing 'prospects' array." }, { status: 400 });
  }
  const matchBehavior = ["remove", "flag", "separate"].includes(body.matchBehavior ?? "")
    ? (body.matchBehavior as string)
    : "remove";
  const remailAfterDays = Number(body.remailAfterDays) > 0 ? Number(body.remailAfterDays) : 0;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const [customerKeys, historyKeys] = await Promise.all([
      getCustomerKeySet(),
      getHistoryKeySet(remailAfterDays),
    ]);

    const seen = new Set<string>();
    const output: OutputRow[] = [];

    let matchedCustomers = 0;
    let dupesWithin = 0;
    let dupesHistory = 0;
    let netNew = 0;
    let missingZip = 0;

    for (const p of body.prospects) {
      const address = str(p.address);
      const zip = str(p.zip);
      const key = addressKey(address, zip);

      const base: OutputRow = {
        addr_key: key,
        address,
        city: str(p.city),
        state: str(p.state),
        zip,
        status: str(p.status),
        list_price: str(p.list_price),
        beds: str(p.beds),
        baths: str(p.baths),
        sqft: str(p.sqft),
        keyword_hit: str(p.keyword_hit),
        source: str(p.source),
        date_pulled: today,
        notes: "",
      };

      // No valid key (missing/invalid ZIP) — flag, never silently drop.
      if (!key) {
        missingZip += 1;
        netNew += 1;
        output.push({ ...base, notes: "Missing/invalid ZIP — not de-duplicated" });
        continue;
      }

      if (seen.has(key)) {
        dupesWithin += 1;
        continue;
      }
      seen.add(key);

      if (customerKeys.has(key)) {
        matchedCustomers += 1;
        if (matchBehavior === "remove") continue;
        // flag / separate: keep but mark
        output.push({ ...base, notes: "Existing Customer" });
        continue;
      }

      if (historyKeys.has(key)) {
        dupesHistory += 1;
        continue;
      }

      netNew += 1;
      output.push(base);
    }

    const summary = {
      run_date: today,
      label: str(body.label) || undefined,
      total_uploaded: body.prospects.length,
      removed_customers: matchedCustomers,
      dupes_within: dupesWithin,
      dupes_history: dupesHistory,
      net_new: netNew,
      match_behavior: matchBehavior,
      created_by: user.id,
    };

    const runId = await createRun(summary, output);

    return NextResponse.json({
      runId,
      summary: { ...summary, missing_zip: missingZip },
      preview: output.slice(0, 50),
      outputCount: output.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
