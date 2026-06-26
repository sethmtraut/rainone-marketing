// GET /api/marketing/download?runId=all | <uuid>
// Regenerates the .xlsx in Stannp's recipient-import format so it uploads
// directly. The recipient list is the FIRST sheet (Stannp reads sheet 1).
// A single run = one sheet; "all" = a combined "All Recipients" sheet first,
// then one dated sheet per run for the archive.

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServerClient } from "@/lib/supabase-server";
import { getRunsForExport } from "@/lib/marketing-db";

export const runtime = "nodejs";
export const maxDuration = 60;

// Exact Stannp import header (order matters).
const HEADERS = [
  "firstname", "lastname", "Address 1", "Address 2", "City", "State",
  "Zipcode", "Country", "Animal", "Pet Name", "Renewal Date",
];

function stannpRow(r: any) {
  return [
    "",            // firstname (no homeowner name for new-mover mail)
    "",            // lastname
    r.address ?? "", // Address 1
    "",            // Address 2 (unit, if any, is kept within Address 1)
    r.city ?? "",
    r.state ?? "",
    r.zip ?? "",   // Zipcode
    "US",          // Country
    "", "", "",    // Animal, Pet Name, Renewal Date (n/a)
  ];
}

// Only mail rows that aren't flagged as existing customers.
const mailable = (rows: any[]) => rows.filter((r) => r.notes !== "Existing Customer");

function uniqueSheetName(base: string, used: Set<string>) {
  let name = base.slice(0, 31);
  let n = 2;
  while (used.has(name)) {
    const suffix = ` (${n})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  used.add(name);
  return name;
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runIdParam = req.nextUrl.searchParams.get("runId");
  const runId = !runIdParam || runIdParam === "all" ? null : runIdParam;

  try {
    const { runs, rows } = await getRunsForExport(runId);
    if (runs.length === 0) {
      return NextResponse.json({ error: "No runs to export yet." }, { status: 404 });
    }

    const rowsByRun = new Map<string, any[]>();
    for (const r of rows) {
      if (!rowsByRun.has(r.run_id)) rowsByRun.set(r.run_id, []);
      rowsByRun.get(r.run_id)!.push(r);
    }

    const wb = XLSX.utils.book_new();
    const used = new Set<string>();

    const sheetFrom = (recipients: any[]) =>
      XLSX.utils.aoa_to_sheet([HEADERS, ...recipients.map(stannpRow)]);

    if (runId) {
      // Single run → one Stannp-ready sheet.
      const run = runs[0];
      const rec = mailable(rowsByRun.get(run.id) ?? []);
      XLSX.utils.book_append_sheet(wb, sheetFrom(rec), uniqueSheetName(run.run_date, used));
    } else {
      // Full archive → combined recipients first, then one dated sheet per run.
      XLSX.utils.book_append_sheet(wb, sheetFrom(mailable(rows)), uniqueSheetName("All Recipients", used));
      for (const run of runs) {
        const rec = mailable(rowsByRun.get(run.id) ?? []);
        XLSX.utils.book_append_sheet(wb, sheetFrom(rec), uniqueSheetName(run.run_date, used));
      }
    }

    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = runId ? `stannp-mail-list_${runs[0].run_date}.xlsx` : "stannp-mail-list.xlsx";

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
