// GET /api/marketing/download?runId=all | <uuid>
// Regenerates the .xlsx workbook from the database: a Summary sheet plus one
// sheet per run, named by run date. Mailable rows first; any existing-customer
// rows are listed below a divider.

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServerClient } from "@/lib/supabase-server";
import { getRunsForExport } from "@/lib/marketing-db";

export const runtime = "nodejs";
export const maxDuration = 60;

const HEADERS = [
  "Address", "City", "State", "ZIP", "Status", "List Price", "Beds", "Baths",
  "Sqft", "Keyword Hit", "Source", "Date Pulled", "Notes",
];

function rowToArray(r: any) {
  return [
    r.address ?? "", r.city ?? "", r.state ?? "", r.zip ?? "", r.status ?? "",
    r.list_price ?? "", r.beds ?? "", r.baths ?? "", r.sqft ?? "", r.keyword_hit ?? "",
    r.source ?? "", r.date_pulled ?? "", r.notes ?? "",
  ];
}

function uniqueSheetName(base: string, used: Set<string>) {
  let name = base.slice(0, 31);
  let n = 2;
  while (used.has(name)) {
    const suffix = ` (${n})`;
    name = (base.slice(0, 31 - suffix.length) + suffix);
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

    // Summary sheet.
    const summaryAoa: any[][] = [
      ["Rain One — Mail List Runs"],
      [],
      ["Run Date", "Label", "Uploaded", "Existing Customers", "Dupes (in-list)", "Dupes (prior)", "Net New", "Match Mode"],
    ];
    for (const run of runs) {
      summaryAoa.push([
        run.run_date, run.label ?? "", run.total_uploaded, run.removed_customers,
        run.dupes_within, run.dupes_history, run.net_new, run.match_behavior,
      ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa), "Summary");

    // One sheet per run.
    const used = new Set<string>(["Summary"]);
    for (const run of runs) {
      const all = rowsByRun.get(run.id) ?? [];
      const mailable = all.filter((r) => r.notes !== "Existing Customer");
      const existing = all.filter((r) => r.notes === "Existing Customer");

      const aoa: any[][] = [
        ["New Homeowner Mail List", `Run ${run.run_date}`],
        ["Uploaded", run.total_uploaded, "Existing customers", run.removed_customers],
        ["Dupes (in-list)", run.dupes_within, "Dupes (prior runs)", run.dupes_history],
        ["Net new mailable", run.net_new, "Match mode", run.match_behavior],
        [],
        HEADERS,
        ...mailable.map(rowToArray),
      ];
      if (existing.length) {
        aoa.push([], ["EXISTING CUSTOMERS — DO NOT MAIL"], HEADERS, ...existing.map(rowToArray));
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), uniqueSheetName(run.run_date, used));
    }

    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = runId ? `rainone-mail-list_${runs[0].run_date}.xlsx` : "rainone-mail-list.xlsx";

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
