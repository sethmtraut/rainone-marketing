"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import SignOutButton from "../SignOutButton";

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  synonyms: string[];
}

const FIELDS: FieldDef[] = [
  { key: "address", label: "Address (street)", required: true, synonyms: ["address", "street", "addr", "property address", "site address", "address 1", "street address"] },
  { key: "city", label: "City", required: true, synonyms: ["city", "town"] },
  { key: "state", label: "State", required: true, synonyms: ["state", "province"] },
  { key: "zip", label: "ZIP", required: true, synonyms: ["zip", "zipcode", "zip code", "postal", "postal code", "zip5"] },
  { key: "status", label: "Status", required: false, synonyms: ["status"] },
  { key: "list_price", label: "List Price", required: false, synonyms: ["list price", "price", "amount"] },
  { key: "beds", label: "Beds", required: false, synonyms: ["beds", "bed", "bedrooms", "br"] },
  { key: "baths", label: "Baths", required: false, synonyms: ["baths", "bath", "bathrooms", "ba"] },
  { key: "sqft", label: "Sqft", required: false, synonyms: ["sqft", "square feet", "sq ft", "size"] },
  { key: "keyword_hit", label: "Keyword Hit", required: false, synonyms: ["keyword", "keyword hit", "keywords"] },
  { key: "source", label: "Source", required: false, synonyms: ["source", "list source", "origin"] },
];

const normHeader = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function autoMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normed = headers.map(normHeader);
  for (const f of FIELDS) {
    let idx = -1;
    for (const syn of f.synonyms) {
      const i = normed.indexOf(syn);
      if (i >= 0) { idx = i; break; }
    }
    if (idx < 0) {
      // loose contains match
      idx = normed.findIndex((h) => f.synonyms.some((syn) => h.includes(syn)));
    }
    map[f.key] = idx;
  }
  return map;
}

function splitLine(line: string, delim: string): string[] {
  if (delim === "\t") return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { q = false; }
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseDelimited(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const delim = lines[0].includes("\t") ? "\t" : ",";
  return lines.map((line) => splitLine(line, delim));
}

// Parse a pasted "sold homes" listing block (address + price/beds/baths/sqft per
// listing) into standard columns. Returns null if it doesn't look like listings,
// so the caller can fall back to tab/CSV parsing.
const ADDR_RE = /([0-9][^[\]]*?,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/;
const LISTING_NOISE = /^(more|save|previous photo.*|next photo.*|loading\.*|for sale|see all|sort:.*|\d+\s+results?.*|recently sold.*|homes for you.*)$/i;

function parseListings(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());

  // Anchor on address lines ("Street, City, ST ZIP") — works for both the
  // markdown copy ([addr](url)) and the plain-text copy.
  const addrIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] && ADDR_RE.test(lines[i])) addrIdx.push(i);
  }
  if (addrIdx.length === 0) return null;

  const rows: string[][] = [];
  for (let n = 0; n < addrIdx.length; n++) {
    const ai = addrIdx[n];
    const prevAi = n > 0 ? addrIdx[n - 1] : -1;
    const back = lines.slice(prevAi + 1, ai).join("\n"); // price + stats sit above the address
    const fwdEnd = n + 1 < addrIdx.length ? addrIdx[n + 1] : lines.length;
    const fwd = lines.slice(ai + 1, Math.min(fwdEnd, ai + 8)); // brokerage + sold date below

    const am = lines[ai].match(ADDR_RE);
    if (!am) continue;
    const parts = am[1].trim().split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) continue;
    const last = parts[parts.length - 1];
    const zip = (last.match(/(\d{5})(?:-\d{4})?$/) || [])[1] ?? "";
    const state = (last.match(/\b([A-Z]{2})\b/) || [])[1] ?? "";
    const city = parts[parts.length - 2];
    const street = parts.slice(0, parts.length - 2).join(", ");

    const price = (back.match(/\$\s?[\d.,]+\s?[MK]?/i) || [])[0]?.replace(/\s/g, "") ?? "";
    const beds = (back.match(/(\d+)\s*bds?/i) || [])[1] ?? "";
    const baths = (back.match(/([\d.]+)\s*ba(?:ths?)?/i) || [])[1] ?? "";
    const sqft = ((back.match(/([\d,]+)\s*sqft/i) || [])[1] ?? "").replace(/,/g, "");
    // Sold date appears below the address; only read forward to avoid borrowing
    // the previous listing's date.
    const sold = (fwd.join("\n").match(/Sold\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i) || [])[1];
    const status = sold ? `Sold ${sold}` : "Sold";

    let source = "";
    for (const t of fwd) {
      if (
        t &&
        !LISTING_NOISE.test(t) &&
        !/^sold\b/i.test(t) &&
        !ADDR_RE.test(t) &&
        !/\$/.test(t) &&
        !/bds?|sqft|\bba\b/i.test(t)
      ) {
        source = t;
        break;
      }
    }

    rows.push([street, city, state, zip, price, beds, baths, sqft, status, source]);
  }

  if (rows.length === 0) return null;
  return {
    headers: ["Address", "City", "State", "Zip", "List Price", "Beds", "Baths", "Sqft", "Status", "Source"],
    rows,
  };
}

function fmtTime(s: string | null) {
  if (!s) return "never";
  return new Date(s).toLocaleString();
}

export default function AddressTool() {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<any[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [parseError, setParseError] = useState("");
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [pasteText, setPasteText] = useState("");

  const [matchBehavior, setMatchBehavior] = useState("remove");
  const [remailDays, setRemailDays] = useState(0);

  const [meta, setMeta] = useState<{ customers_refreshed_at: string | null; customer_key_count: number }>({ customers_refreshed_at: null, customer_key_count: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [runs, setRuns] = useState<any[]>([]);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/runs", { credentials: "include" });
      if (res.status === 401) { setError("Your login session expired — refresh and sign in again."); return; }
      const data = await res.json();
      if (res.ok) { setRuns(data.runs ?? []); setMeta(data.meta ?? meta); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  async function onFile(file: File) {
    setParseError("");
    setResult(null);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: "" });
      if (!aoa.length) { setParseError("That file looks empty."); return; }
      const hdr = (aoa[0] as any[]).map((x) => String(x ?? "").trim());
      const rows = (aoa.slice(1) as any[][]).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
      setHeaders(hdr);
      setDataRows(rows);
      setMapping(autoMap(hdr));
    } catch (e) {
      setParseError("Couldn't read that file. Use a .csv or .xlsx exported from your prospect list.");
    }
  }

  function handlePaste() {
    setParseError("");
    setResult(null);

    // First try the "sold listings" format (address + price/beds/baths/sqft blocks).
    const listings = parseListings(pasteText);
    if (listings) {
      setHeaders(listings.headers);
      setDataRows(listings.rows);
      setMapping(autoMap(listings.headers));
      setFileName(`Pasted listings (${listings.rows.length})`);
      return;
    }

    // Otherwise treat it as tab- or comma-separated rows with a header line.
    const aoa = parseDelimited(pasteText);
    if (aoa.length < 2) {
      setParseError("Paste a header row plus data rows (tab/comma-separated), or paste a sold-listings results block.");
      return;
    }
    const hdr = aoa[0].map((x) => String(x ?? "").trim());
    const rows = aoa.slice(1);
    setHeaders(hdr);
    setDataRows(rows);
    setMapping(autoMap(hdr));
    setFileName("Pasted rows");
  }

  const missingRequired = FIELDS.filter((f) => f.required && (mapping[f.key] === undefined || mapping[f.key] < 0)).map((f) => f.label);

  async function refreshCustomers() {
    setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/marketing/refresh-customers", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.status === 401) setError("Your login session expired — refresh and sign in again.");
      else if (!res.ok) setError(data.error || "Customer refresh failed.");
      else setMeta({ customers_refreshed_at: data.customers_refreshed_at, customer_key_count: data.customer_key_count ?? data.count });
    } catch { setError("Network error refreshing customers."); }
    setRefreshing(false);
  }

  async function run() {
    if (!dataRows.length) { setError("Upload a prospect list first."); return; }
    if (missingRequired.length) { setError("Map these required columns first: " + missingRequired.join(", ")); return; }
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const prospects = dataRows.map((r) => {
        const get = (k: string) => { const i = mapping[k]; return i >= 0 ? String(r[i] ?? "").trim() : ""; };
        return {
          address: get("address"), city: get("city"), state: get("state"), zip: get("zip"),
          status: get("status"), list_price: get("list_price"), beds: get("beds"), baths: get("baths"),
          sqft: get("sqft"), keyword_hit: get("keyword_hit"), source: get("source"),
        };
      });
      const res = await fetch("/api/marketing/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prospects, matchBehavior, remailAfterDays: remailDays, label: fileName }),
      });
      const data = await res.json();
      if (res.status === 401) setError("Your login session expired — refresh and sign in again.");
      else if (!res.ok) setError(data.error || "Run failed.");
      else { setResult(data); loadRuns(); }
    } catch { setError("Network error during run."); }
    setRunning(false);
  }

  return (
    <div className="min-h-screen">
      <header className="mk-header px-8 py-7 text-white">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div>
            <Link href="/" className="text-xs text-amber-100 hover:text-white">← Marketing Tools</Link>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">New Homeowner Address Tool</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/85">
              Upload a prospect address list. We remove existing Rain One customers and anyone already mailed, then output a clean Excel mail list.
            </p>
            <p className="mt-2 text-[11px] text-white/70">
              This tool only processes lists you paste or upload — it doesn&apos;t connect to or pull from any listing site. You&apos;re responsible for making sure any pasted data complies with its source&apos;s terms of use.
            </p>
          </div>
          <SignOutButton className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/20" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-8 py-6">
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {/* Customer cache */}
        <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm">
            <div className="font-semibold text-zinc-800">ServiceTitan customer list</div>
            <div className="text-xs text-zinc-500">
              {meta.customer_key_count.toLocaleString()} addresses cached · last refreshed {fmtTime(meta.customers_refreshed_at)}
            </div>
          </div>
          <button className="btn btn-secondary" onClick={refreshCustomers} disabled={refreshing}>
            {refreshing ? "Refreshing… (up to a minute)" : "Refresh customers"}
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          {/* Left: upload + mapping */}
          <section className="card p-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-700">1 · Add prospect list</h2>
            <div className="mb-3 inline-flex rounded-md border border-amber-200 p-0.5 text-xs">
              <button
                onClick={() => setInputMode("file")}
                className={"rounded px-3 py-1 font-semibold " + (inputMode === "file" ? "bg-amber-500 text-amber-950" : "text-amber-700")}
              >
                Upload file
              </button>
              <button
                onClick={() => setInputMode("paste")}
                className={"rounded px-3 py-1 font-semibold " + (inputMode === "paste" ? "bg-amber-500 text-amber-950" : "text-amber-700")}
              >
                Paste rows
              </button>
            </div>

            {inputMode === "file" ? (
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-amber-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-amber-950 hover:file:bg-amber-600"
              />
            ) : (
              <div>
                <textarea
                  className="textarea min-h-[120px] font-mono text-xs"
                  placeholder={"Paste a sold-listings results block, OR rows from Excel/Sheets (tab/comma) with a header row, e.g.\nAddress\tCity\tState\tZip\n123 Main St\tColumbus\tOH\t43215"}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <button className="btn btn-secondary mt-2 text-xs" onClick={handlePaste} disabled={!pasteText.trim()}>
                  Parse pasted rows
                </button>
              </div>
            )}
            {parseError && <p className="mt-2 text-sm text-red-600">{parseError}</p>}

            {headers.length > 0 && (
              <>
                <div className="mt-2 text-xs text-zinc-500">{fileName} · {dataRows.length} rows</div>

                <h3 className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">2 · Map columns</h3>
                <div className="grid grid-cols-2 gap-2">
                  {FIELDS.map((f) => (
                    <label key={f.key} className="text-xs">
                      <span className="font-semibold text-zinc-600">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
                      <select
                        className="select mt-1 text-sm"
                        value={mapping[f.key] ?? -1}
                        onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                      >
                        <option value={-1}>—</option>
                        {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>

                <h3 className="mt-4 mb-1 text-xs font-bold uppercase tracking-wide text-amber-700">Preview</h3>
                <div className="overflow-x-auto rounded border border-amber-100">
                  <table className="w-full text-[11px]">
                    <thead className="bg-amber-50 text-zinc-600">
                      <tr>{FIELDS.filter((f) => mapping[f.key] >= 0).map((f) => <th key={f.key} className="px-2 py-1 text-left">{f.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {dataRows.slice(0, 10).map((r, ri) => (
                        <tr key={ri} className="border-t border-amber-50">
                          {FIELDS.filter((f) => mapping[f.key] >= 0).map((f) => (
                            <td key={f.key} className="px-2 py-1">{String(r[mapping[f.key]] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* Right: settings + run */}
          <section className="card flex flex-col p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-amber-700">3 · Settings &amp; run</h2>

            <label className="mb-3 block text-xs">
              <span className="font-semibold text-zinc-600">If a prospect matches an existing customer</span>
              <select className="select mt-1 text-sm" value={matchBehavior} onChange={(e) => setMatchBehavior(e.target.value)}>
                <option value="remove">Remove from list (default)</option>
                <option value="flag">Keep but flag as “Existing Customer”</option>
                <option value="separate">Move to a separate section</option>
              </select>
            </label>

            <label className="mb-4 block text-xs">
              <span className="font-semibold text-zinc-600">Allow re-mailing after N days</span>
              <input type="number" min={0} className="input mt-1 text-sm" value={remailDays}
                onChange={(e) => setRemailDays(Number(e.target.value) || 0)} />
              <span className="text-[11px] text-zinc-400">0 = never re-mail an address from a prior run.</span>
            </label>

            <button className="btn btn-primary w-full" onClick={run} disabled={running || !dataRows.length}>
              {running ? "Running…" : "Run & build mail list"}
            </button>

            {result && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                <div className="mb-2 font-bold text-amber-800">Results</div>
                <ul className="space-y-0.5 text-xs text-zinc-700">
                  <li>Uploaded: <b>{result.summary.total_uploaded}</b></li>
                  <li>Existing customers matched: <b>{result.summary.removed_customers}</b></li>
                  <li>Duplicates in list: <b>{result.summary.dupes_within}</b></li>
                  <li>Already mailed (prior runs): <b>{result.summary.dupes_history}</b></li>
                  {result.summary.missing_zip > 0 && <li className="text-amber-700">Missing/invalid ZIP (flagged): <b>{result.summary.missing_zip}</b></li>}
                  <li className="text-emerald-700">Net new mailable: <b>{result.summary.net_new}</b></li>
                </ul>
                <a href="/api/marketing/download?runId=all" className="btn btn-primary mt-3 w-full justify-center text-sm">
                  Download workbook (.xlsx)
                </a>
              </div>
            )}
          </section>
        </div>

        {/* Run history */}
        <section className="card mt-6 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-amber-700">Run history</h2>
            {runs.length > 0 && (
              <a href="/api/marketing/download?runId=all" className="btn btn-secondary text-xs">Download full workbook</a>
            )}
          </div>
          {runs.length === 0 ? (
            <p className="text-sm italic text-zinc-400">No runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b-2 border-amber-100 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-2 py-2 text-left">Run date</th>
                    <th className="px-2 py-2 text-right">Net new</th>
                    <th className="px-2 py-2 text-right">Existing</th>
                    <th className="px-2 py-2 text-right">Dupes</th>
                    <th className="px-2 py-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-amber-50">
                      <td className="px-2 py-2">{r.run_date}{r.label ? <span className="ml-1 text-xs text-zinc-400">· {r.label}</span> : null}</td>
                      <td className="px-2 py-2 text-right font-semibold text-emerald-700">{r.net_new}</td>
                      <td className="px-2 py-2 text-right">{r.removed_customers}</td>
                      <td className="px-2 py-2 text-right">{r.dupes_within + r.dupes_history}</td>
                      <td className="px-2 py-2 text-right">
                        <a href={`/api/marketing/download?runId=${r.id}`} className="text-amber-700 hover:underline">Download</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
