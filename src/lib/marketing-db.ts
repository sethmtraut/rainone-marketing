// Data access for the Marketing address tool. Uses the Supabase service-role
// client (server-only, behind auth middleware) for all marketing tables.

import { createServiceClient } from "@/lib/supabase-server";

export interface OutputRow {
  addr_key: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status?: string;
  list_price?: string;
  beds?: string;
  baths?: string;
  sqft?: string;
  keyword_hit?: string;
  source?: string;
  date_pulled: string;
  notes?: string;
}

export interface RunSummary {
  run_date: string;
  label?: string;
  total_uploaded: number;
  removed_customers: number;
  dupes_within: number;
  dupes_history: number;
  net_new: number;
  match_behavior: string;
  created_by?: string | null;
}

function db() {
  return createServiceClient();
}

// ── Customer-key cache ───────────────────────────────────────────────────────

export async function getCustomerKeySet(): Promise<Set<string>> {
  const set = new Set<string>();
  const supabase = db();
  const pageSize = 1000;
  let from = 0;
  for (let safety = 0; safety < 1000; safety++) {
    const { data, error } = await supabase
      .from("mkt_customer_keys")
      .select("addr_key")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) set.add(r.addr_key as string);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return set;
}

export async function replaceCustomerKeys(records: { addr_key: string; source: string }[]): Promise<number> {
  const supabase = db();
  // Clear then bulk insert (dedupe by key first).
  const seen = new Map<string, string>();
  for (const r of records) if (r.addr_key && !seen.has(r.addr_key)) seen.set(r.addr_key, r.source);
  const rows = [...seen.entries()].map(([addr_key, source]) => ({ addr_key, source }));

  const del = await supabase.from("mkt_customer_keys").delete().neq("addr_key", "__none__");
  if (del.error) throw new Error(del.error.message);

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const ins = await supabase.from("mkt_customer_keys").insert(chunk);
    if (ins.error) throw new Error(ins.error.message);
  }

  await supabase
    .from("mkt_meta")
    .update({ customers_refreshed_at: new Date().toISOString(), customer_key_count: rows.length })
    .eq("id", 1);

  return rows.length;
}

export async function getMeta(): Promise<{ customers_refreshed_at: string | null; customer_key_count: number }> {
  const supabase = db();
  const { data } = await supabase
    .from("mkt_meta")
    .select("customers_refreshed_at, customer_key_count")
    .eq("id", 1)
    .maybeSingle();
  return {
    customers_refreshed_at: data?.customers_refreshed_at ?? null,
    customer_key_count: data?.customer_key_count ?? 0,
  };
}

// ── History (every address ever output) ──────────────────────────────────────

export async function getHistoryKeySet(remailAfterDays?: number): Promise<Set<string>> {
  const supabase = db();
  let query = supabase.from("mkt_addresses").select("addr_key, date_pulled");
  if (remailAfterDays && remailAfterDays > 0) {
    const cutoff = new Date(Date.now() - remailAfterDays * 86_400_000).toISOString().slice(0, 10);
    query = query.gte("date_pulled", cutoff);
  }
  const set = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (let safety = 0; safety < 1000; safety++) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (r.addr_key) set.add(r.addr_key as string);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return set;
}

// ── Runs ─────────────────────────────────────────────────────────────────────

export async function createRun(summary: RunSummary, rows: OutputRow[]): Promise<string> {
  const supabase = db();
  const ins = await supabase.from("mkt_runs").insert(summary).select("id").single();
  if (ins.error) throw new Error(ins.error.message);
  const runId = ins.data.id as string;

  if (rows.length) {
    const withRun = rows.map((r) => ({ ...r, run_id: runId }));
    for (let i = 0; i < withRun.length; i += 500) {
      const chunk = withRun.slice(i, i + 500);
      const insRows = await supabase.from("mkt_addresses").insert(chunk);
      if (insRows.error) throw new Error(insRows.error.message);
    }
  }
  return runId;
}

export async function listRuns() {
  const supabase = db();
  const { data, error } = await supabase
    .from("mkt_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getRunsForExport(runId: string | null) {
  const supabase = db();
  let runsQuery = supabase.from("mkt_runs").select("*").order("run_date", { ascending: true });
  if (runId) runsQuery = runsQuery.eq("id", runId);
  const runs = await runsQuery;
  if (runs.error) throw new Error(runs.error.message);

  const runIds = (runs.data ?? []).map((r) => r.id);
  let rows: any[] = [];
  if (runIds.length) {
    const { data, error } = await supabase
      .from("mkt_addresses")
      .select("*")
      .in("run_id", runIds)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    rows = data ?? [];
  }
  return { runs: runs.data ?? [], rows };
}
