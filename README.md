# Rain One — Marketing Tools

Standalone app for Rain One marketing campaigns. First tool: the **New Homeowner
Address Tool**, which turns a prospect address list into a clean direct-mail list by
removing existing ServiceTitan customers and any address already mailed in a prior run.

Logs in with Supabase (same project as SPIFF / Install Planner) and reuses the same
ServiceTitan API credentials. Yellow-themed. Linked from mainline.

## Setup

1. **Create a Vercel project** from this repo (named `rainone-marketing` so the URL
   matches the link in mainline: `https://rainone-marketing.vercel.app`).

2. **Environment variables** (Vercel → Settings → Environment Variables) — use the
   **same values as the Install Planner**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SERVICETITAN_TENANT_ID`
   - `SERVICETITAN_APP_KEY`
   - `SERVICETITAN_CLIENT_ID`
   - `SERVICETITAN_CLIENT_SECRET`
   - (optional) `SERVICETITAN_AUTH_URL`, `SERVICETITAN_API_BASE`

3. **Run the database migration** once, in the Supabase SQL Editor:
   `supabase/migrations/20260625000000_marketing_tables.sql`
   (creates the `mkt_*` tables in the shared Supabase project).

4. Deploy. Sign in with your existing Supabase account, open the address tool, click
   **Refresh customers** once to build the ServiceTitan address cache, then run a list.

## How the address tool works

- Upload a prospect list (`.csv` / `.xlsx`). Columns are auto-mapped; adjust if needed.
- Required columns: Address, City, State, ZIP. Optional: Status, List Price, Beds,
  Baths, Sqft, Keyword Hit, Source.
- On **Run** it: normalizes addresses (USPS abbreviations, ZIP→5 digits), removes
  in-list duplicates, removes (or flags / separates) existing ServiceTitan customers,
  removes anything already mailed in a prior run, and stores the result.
- **Output:** an `.xlsx` regenerated from the database — a Summary sheet plus one sheet
  per run date. Earlier runs are never lost. The master mailed history lives in the
  `mkt_addresses` table, so the same address is never mailed twice across weeks
  (configurable re-mail-after-N-days, default off).

> Note: this tool only processes address lists you upload. It does not scrape or pull
> from Zillow, realtor.com, or any listing site.

## Deviation from the original spec

The spec called for persisting the workbook file between runs. Instead, every output
row is stored in Postgres (which is also the mailed-history source of truth) and the
`.xlsx` is **regenerated on demand** — this makes "new dated sheet each run / never lose
earlier sheets / cross-run de-dupe" reliable without storing binary files. The
ServiceTitan customer list is uploaded automatically via the API (cached, refresh on
demand) rather than uploaded as a file.
